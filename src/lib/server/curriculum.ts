import "server-only";
import type { NewsLevel, WordPos, WordSeed } from "@/types";
import type { Db } from "./supabase";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { extractObject, str, strList } from "@/lib/shared/modelJson";
import { countWords } from "@/lib/shared/stats";
import { rawComplete } from "./ai";
import { SYSTEM, user as curriculumUser } from "./prompts/curriculum";

/**
 * The learner's word curriculum, written for them.
 *
 * This replaced `WORD_SEEDS` — 890 lines of hand-curated words, identical for
 * everybody, finite, and unable to use anything the learner had actually done.
 * A generated curriculum is none of those things: it never repeats a word they
 * have met, it can lean on the subjects they choose to write about, and it does
 * not run out.
 *
 * What it keeps is the *rules*, which were always the valuable part of the old
 * list. Frequency-first selection and the one-word-per-semantic-field
 * constraint are stated in the prompt and checked here in code, because a model
 * asked for "unrelated words" will still hand you three ways to be tired.
 *
 * Batches, not single words: generating twelve at a time means one AI call
 * covers a couple of weeks, and the day a learner opens the app is almost never
 * the day it has to run.
 */

/** How many words one generation call asks for. ~2 weeks at the default dose. */
const BATCH = 12;
/** Never let the queue run dry: refill once fewer than this remain unmet. */
const REFILL_BELOW = 6;
/** A gloss longer than this is an explanation, not a meaning. */
const MAX_MEANING_WORDS = 20;
/** Total curriculum ceiling per learner, so a runaway loop can't mint forever. */
const MAX_ITEMS = 2000;

const POS = new Set<WordPos>(["verb", "noun", "adjective", "adverb"]);
const BANDS = new Set<NewsLevel>(["A2", "B1", "B2", "C1"]);

/** `decide` → `w-decide`. The id this word carries into the phrase pool. */
export function wordSlug(word: string): string {
  return `w-${word.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

// ---------------------------------------------------------------------------
// Generating a batch
// ---------------------------------------------------------------------------

/**
 * Coerce one generated batch into curriculum entries, collecting the reasons
 * anything was rejected so a retry can name them.
 *
 * `taken` carries every slug the learner already has (met or queued) and every
 * field this batch has used, so the two rules that matter — never repeat a
 * word, never two words from one semantic field — are enforced here rather than
 * hoped for.
 */
function coerceBatch(
  obj: Record<string, unknown>,
  taken: { slugs: Set<string>; fields: Set<string> },
): { words: Omit<WordSeed, "id">[]; slugs: string[]; errors: string[] } {
  const errors: string[] = [];
  const words: Omit<WordSeed, "id">[] = [];
  const slugs: string[] = [];

  const raw = Array.isArray(obj.words) ? obj.words : [];
  if (raw.length === 0) errors.push("the response carried no words");

  for (const entry of raw) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const word = str(o.word).toLowerCase();
    if (!word || !/^[a-z][a-z'-]*$/.test(word)) {
      errors.push(`"${word || "(empty)"}" is not a single plain word`);
      continue;
    }

    const slug = wordSlug(word);
    if (taken.slugs.has(slug)) {
      errors.push(`"${word}" is already in their curriculum — pick another`);
      continue;
    }

    const meaning = str(o.meaning);
    if (!meaning || countWords(meaning) > MAX_MEANING_WORDS) {
      errors.push(`"${word}" needs a short plain-words meaning`);
      continue;
    }

    const field = str(o.field).toLowerCase();
    if (!field) {
      errors.push(`"${word}" needs a semantic field`);
      continue;
    }
    if (taken.fields.has(field)) {
      // The interference rule, enforced rather than requested: two words from
      // one field in a batch would end up in one day's set.
      errors.push(`"${word}" repeats the semantic field "${field}" — choose an unrelated area`);
      continue;
    }

    const pos = POS.has(o.pos as WordPos) ? (o.pos as WordPos) : null;
    if (!pos) {
      errors.push(`"${word}" needs a pos of verb, noun, adjective or adverb`);
      continue;
    }

    taken.slugs.add(slug);
    taken.fields.add(field);
    slugs.push(slug);
    words.push({
      word,
      pos,
      band: BANDS.has(o.band as NewsLevel) ? (o.band as NewsLevel) : "B1",
      meaning,
      example: str(o.example),
      collocations: strList(o.collocations, 4).filter((c) => countWords(c) <= 5),
      field,
    });
  }

  return { words, slugs, errors };
}

/**
 * One batch of new words for this learner. Validates hard, retries once with
 * the failures named, then fails honestly — there is no bundled list to fall
 * back to any more, and inventing one silently would be worse than saying so.
 */
export async function generateWordBatch(
  snapshot: LearnerSnapshot,
  count: number,
  existingSlugs: Set<string>,
): Promise<Omit<WordSeed, "id">[]> {
  let lastErrors: string[] = ["no JSON object in the response"];

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? curriculumUser(snapshot, count)
        : `${curriculumUser(snapshot, count)}\n\nYour previous attempt was rejected:\n${lastErrors
            .slice(0, 8)
            .map((e) => `- ${e}`)
            .join("\n")}\nReturn corrected JSON only.`;

    const raw = await rawComplete(SYSTEM, prompt, 1800, 0.7);
    const obj = extractObject(raw);
    if (!obj) {
      console.warn(`[curriculum] attempt ${attempt}: no JSON —`, raw.slice(0, 300));
      continue;
    }

    // A fresh `taken` per attempt: the retry re-checks from the same baseline
    // rather than inheriting the rejected batch's claims.
    const { words, errors } = coerceBatch(obj, {
      slugs: new Set(existingSlugs),
      fields: new Set(),
    });

    // A partial batch is still a usable one — half a fortnight of words beats
    // an error page. Only an empty result is worth retrying for.
    if (words.length > 0) return words;
    lastErrors = errors;
    console.warn(`[curriculum] attempt ${attempt} produced nothing usable:`, errors);
  }

  throw new Error("Couldn't build your next words just now — try again in a moment.");
}

// ---------------------------------------------------------------------------
// Keeping the queue stocked
// ---------------------------------------------------------------------------

function toSeed(row: {
  slug: string;
  word: string;
  pos: WordPos;
  band: NewsLevel;
  meaning: string;
  example: string;
  collocations: string[];
  field: string;
}): WordSeed {
  return {
    id: row.slug,
    word: row.word,
    pos: row.pos,
    band: row.band,
    meaning: row.meaning,
    example: row.example,
    collocations: row.collocations ?? [],
    field: row.field,
  };
}

/** Every word this learner's curriculum has ever offered, in queue order. */
export async function loadCatalog(db: Db, userId: string): Promise<WordSeed[]> {
  const { data } = await db
    .from("word_items")
    .select("slug, word, pos, band, meaning, example, collocations, field")
    .eq("user_id", userId)
    .order("rank");
  return (data ?? []).map(toSeed);
}

/**
 * Make sure at least `need` unmet words are waiting, generating a batch if not,
 * and hand back the whole catalogue.
 *
 * Called on the daily-words path, where it is almost always a single read: the
 * queue only runs low every couple of weeks. `met` is the learner's pool, so a
 * word that has been met stops counting towards the queue without being
 * deleted — the row stays as the record of what has been covered.
 */
export async function ensureCatalog(
  db: Db,
  userId: string,
  snapshot: LearnerSnapshot,
  met: Set<string>,
  need: number,
): Promise<WordSeed[]> {
  const catalog = await loadCatalog(db, userId);
  const unmet = catalog.filter((w) => !met.has(w.id));
  if (unmet.length >= Math.max(need, REFILL_BELOW) || catalog.length >= MAX_ITEMS) {
    return catalog;
  }

  const existing = new Set(catalog.map((w) => w.id));
  const fresh = await generateWordBatch(
    snapshot,
    Math.max(BATCH, need - unmet.length),
    existing,
  );
  if (fresh.length === 0) return catalog;

  const baseRank = catalog.length;
  const { error } = await db.from("word_items").insert(
    fresh.map((w, i) => ({
      user_id: userId,
      slug: wordSlug(w.word),
      word: w.word,
      pos: w.pos,
      band: w.band,
      meaning: w.meaning,
      example: w.example,
      collocations: w.collocations,
      field: w.field,
      rank: baseRank + i,
    })),
  );
  if (error) {
    // A duplicate slug racing in from a parallel request is not a failure worth
    // showing anyone: the catalogue re-read below picks up whichever won.
    console.warn("[curriculum] batch insert:", error.message);
  }

  return loadCatalog(db, userId);
}
