import type {
  DayKey,
  NewsLevel,
  Phrase,
  SrsRecord,
  WordDrill,
  WordPos,
  WordSeed,
} from "@/types";
import { todayKey } from "./date";
import { isDue } from "./srs";

/**
 * The rules for drawing a day's set, and everything a word's turn is judged by
 * (docs/DAILY_WORDS.md).
 *
 * The curriculum itself is no longer here. It used to be a hand-curated,
 * frequency-ordered array bundled with the app — the same words for everybody,
 * and finite. It is now generated per learner (`lib/server/curriculum.ts`) and
 * stored in `word_items`, so every function below takes the learner's own
 * catalogue as an argument rather than reaching for a module-level list.
 *
 * What did NOT move is the pedagogy, because it is rules rather than content:
 *
 *   1. WHICH words matter. Frequency-first: words a learner will actually need
 *      to PRODUCE, not rare words that only impress (the General Service List
 *      tradition; NGSL ≈ 2,800 words ≈ 92% coverage). The generator is told
 *      this; the catalogue arrives here already in that order.
 *   2. HOW they're grouped. Words taught in a semantic set (synonyms,
 *      opposites, "five kinds of weather") interfere with each other and are
 *      learned more slowly (Tinkham 1993; Finkbeiner & Nicol 2003; Erten &
 *      Tekin 2008). Every item carries a `field`, and `pickDailyWords` never
 *      puts two of one field in a set.
 */

/** Daily doses offered in Settings. Small enough to always finish. */
export const WORDS_PER_DAY_OPTIONS = [3, 5, 8];

/** Ceiling on a whole session (new words + reviews) so a day never sprawls. */
export const MAX_SESSION_ITEMS = 10;

/** Index a catalogue by id — the lookup every resolver below shares. */
export function catalogById(catalog: WordSeed[]): Map<string, WordSeed> {
  return new Map(catalog.map((w) => [w.id, w]));
}

const BAND_ORDER: NewsLevel[] = ["A2", "B1", "B2", "C1"];

// --- Choosing a day's set ---------------------------------------------------

/**
 * Draw today's brand-new words from the learner's catalogue. Frequency-first
 * within their band (then the nearest bands), and — the rule that matters —
 * **no two words from the same semantic field in one set**, because words
 * taught in a semantic cluster interfere with each other.
 *
 * `met` is every word id the learner has already met, so the curriculum never
 * repeats itself. Deterministic: the same inputs always give the same set.
 */
export function pickDailyWords(opts: {
  catalog: WordSeed[];
  level: NewsLevel;
  count: number;
  met: Set<string>;
}): WordSeed[] {
  const { catalog, level, count, met } = opts;
  const levelIdx = BAND_ORDER.indexOf(level);

  const candidates = catalog.map((w, i) => ({ w, i }))
    .filter(({ w }) => !met.has(w.id))
    .sort((a, b) => {
      // Nearest band first (below before above at equal distance), then the
      // curriculum's own frequency order.
      const da = Math.abs(BAND_ORDER.indexOf(a.w.band) - levelIdx);
      const db = Math.abs(BAND_ORDER.indexOf(b.w.band) - levelIdx);
      if (da !== db) return da - db;
      const ba = BAND_ORDER.indexOf(a.w.band);
      const bb = BAND_ORDER.indexOf(b.w.band);
      if (ba !== bb) return ba - bb;
      return a.i - b.i;
    })
    .map(({ w }) => w);

  const picked: WordSeed[] = [];
  const fields = new Set<string>();
  for (const w of candidates) {
    if (picked.length >= count) break;
    if (fields.has(w.field)) continue;
    picked.push(w);
    fields.add(w.field);
  }
  // Only if the field rule couldn't fill the set (a nearly-finished curriculum)
  // do we relax it — a short set is worse than two related words.
  if (picked.length < count) {
    for (const w of candidates) {
      if (picked.length >= count) break;
      if (!picked.includes(w)) picked.push(w);
    }
  }
  return picked;
}

/**
 * Resolve the set a day already issued (ids → items), dropping any id the
 * catalogue no longer has. Today's set is fixed the moment it's drawn, so
 * reopening the tab mid-session never reshuffles it.
 */
export function seedsFromIds(catalog: WordSeed[], ids: string[] | undefined): WordSeed[] {
  if (!ids) return [];
  const byId = catalogById(catalog);
  return ids.map((id) => byId.get(id)).filter((w): w is WordSeed => !!w);
}

/**
 * Today's review words: items already in the learner's pool that the Leitner
 * schedule says are due. Spacing is the whole reason the daily set is a *mix*
 * — new words alone would be forgotten as fast as they're met.
 */
export function dueReviews(
  pool: Phrase[],
  srs: Record<string, SrsRecord>,
  limit: number,
  today: DayKey = todayKey(),
): Phrase[] {
  return pool
    .filter((p) => srs[p.id] && isDue(srs[p.id], today))
    .sort((a, b) => (srs[a.id]!.box ?? 0) - (srs[b.id]!.box ?? 0))
    .slice(0, Math.max(0, limit));
}

/** Everything a day's session is made of — derived, never stored. */
export interface DaySet {
  /** Today's new words: the set this day issued, or the one it would issue. */
  todaysNew: WordSeed[];
  /** The ones not met yet — what's actually left to do today. */
  remainingNew: WordSeed[];
  /** Curriculum words the Leitner schedule says are ripe again. */
  reviews: Phrase[];
  /** New words met today. */
  done: number;
  /** Items in the session that's waiting: new words left, plus reviews. */
  remaining: number;
}

/**
 * Build today's set. One derivation, used by the mode and by the nav badge, so
 * the two can never disagree about what "today" means.
 *
 * A day's set is fixed the first time it's drawn (`wordDays`), and a word
 * counts as met once it's in the learner's pool — so leaving halfway through
 * and coming back resumes exactly where they were.
 */
export function buildDaySet(opts: {
  catalog: WordSeed[];
  wordDays: Record<DayKey, string[]>;
  pool: Phrase[];
  srs: Record<string, SrsRecord>;
  level: NewsLevel;
  perDay: number;
  today?: DayKey;
}): DaySet {
  const { catalog, wordDays, pool, srs, level, perDay } = opts;
  const today = opts.today ?? todayKey();
  const met = new Set(pool.map((p) => p.id));
  const inCatalog = catalogById(catalog);

  const issued = seedsFromIds(catalog, wordDays[today]);
  const todaysNew =
    issued.length > 0 ? issued : pickDailyWords({ catalog, level, count: perDay, met });
  const remainingNew = todaysNew.filter((w) => !met.has(w.id));
  const reviews = dueReviews(
    pool.filter((p) => inCatalog.has(p.id)),
    srs,
    MAX_SESSION_ITEMS - remainingNew.length,
    today,
  );

  return {
    todaysNew,
    remainingNew,
    reviews,
    done: todaysNew.length - remainingNew.length,
    remaining: remainingNew.length + reviews.length,
  };
}

// --- Words as pool items ----------------------------------------------------

/** A met word becomes a normal library item: same pool, same Leitner schedule,
 *  so the Phrasebook and the Coach recycle it like anything else. */
export function wordToPhrase(seed: WordSeed, day: DayKey): Phrase {
  return {
    id: seed.id,
    text: seed.word,
    meaning: seed.meaning,
    example: seed.example,
    kind: "word",
    collocations: seed.collocations,
    captured: { module: "Daily words", context: seed.example, day },
  };
}

/** Is this pool item one of the learner's curriculum words? */
export function isDailyWord(catalog: WordSeed[], id: string): boolean {
  return catalog.some((w) => w.id === id);
}

// --- Matching a word inside the learner's own sentence -----------------------

/** Stems that regular English inflection can build on (drop -e, drop -y,
 *  double the final consonant), so "rely" finds "relies" and "stop" "stopped". */
function stemsOf(word: string): string[] {
  const base = word.toLowerCase().trim();
  const stems = new Set([base]);
  if (base.length > 3) {
    if (base.endsWith("e")) stems.add(base.slice(0, -1));
    if (base.endsWith("y")) stems.add(base.slice(0, -1) + "i");
    stems.add(base + base[base.length - 1]);
  }
  return [...stems].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

const SUFFIXES = "(?:s|es|ed|d|ing|er|ers|est|ly|ment|ness|ion|ions|ation)?";

/**
 * A word as an inflection-tolerant matcher: whole word only, but any normal
 * ending. Used for the recall check and as the offline judging fallback, and
 * server-side to guarantee a setup never leaks the word it's eliciting.
 */
export function wordMatcher(word: string): RegExp {
  return new RegExp(`\\b(?:${stemsOf(word).join("|")})${SUFFIXES}\\b`, "i");
}

/** Did they produce the word (in any normal form) somewhere in this text? */
export function usesWord(word: string, text: string): boolean {
  return wordMatcher(word).test(text);
}

/**
 * The recall check: the learner types the word from its meaning. Any normal
 * inflection counts — this beat tests the form-meaning link, not spelling drill.
 */
export function recallMatches(word: string, typed: string): boolean {
  const t = typed.toLowerCase().replace(/[^a-z' -]/g, "").trim();
  if (!t) return false;
  return new RegExp(`^(?:${stemsOf(word).join("|")})${SUFFIXES}$`, "i").test(t);
}

/** A partner chunk with the word itself hidden — a cue that helps recall
 *  without giving the answer away ("make a ___" for "decision"). */
export function maskCollocation(chunk: string, word: string): string {
  return chunk.replace(new RegExp(wordMatcher(word).source, "gi"), "___");
}

// --- The drill ladder --------------------------------------------------------
//
// The middle beat of a word's arc. Which rung it gets is decided by its Leitner
// box, so the ask hardens as the memory does — expanding difficulty next to the
// expanding interval, which is the "desirable difficulties" idea applied to the
// task instead of the schedule. See docs/DAILY_WORDS.md.

/** The rung each box reaches for, before availability is checked. */
const LADDER: WordDrill[] = ["recall", "fit", "partner", "repair", "echo"];

export interface DrillMaterial {
  /** The word being drilled — every availability check depends on it. */
  word: string;
  /** A sentence they wrote with this word before (the `echo` rung). */
  myLine?: string;
  /** A natural sentence using the word (the `fit` rung). */
  cloze?: string;
  /** A near-miss and its natural version (the `repair` rung). */
  repair?: { wrong: string; right: string };
  collocations: string[];
}

/**
 * Pick the rung for a word at `box`, degrading to a lower one when the material
 * for the ideal rung isn't there (no AI, no partner chunk that makes a good
 * gap, nothing written yet). `recall` always works, so this can't fail.
 *
 * Availability is decided by running the real gap functions, not by proxies
 * like "has collocations" — a word whose every chunk leads with the word itself
 * (`borrow money`, `borrow it from someone`) has no partner round in it, and
 * only trying tells you that.
 *
 * One override: from box 2 up, a sentence the learner wrote themselves beats
 * anything we could generate, so `echo` takes priority whenever it's available.
 */
export function pickDrill(box: number, material: DrillMaterial): WordDrill {
  const { word } = material;
  const ideal = LADDER[Math.min(Math.max(box, 0), LADDER.length - 1)];
  const ok = (d: WordDrill): boolean => {
    switch (d) {
      case "recall":
        return true;
      case "fit":
        return !!material.cloze && !!gapSentence(material.cloze, word);
      case "partner":
        return !!gapPartner(material.collocations, word);
      case "repair":
        return !!material.repair;
      case "echo":
        return !!material.myLine && !!gapSentence(material.myLine, word);
    }
  };
  if (box >= 2 && ok("echo")) return "echo";
  // Walk back down the ladder until something is actually available.
  for (let i = LADDER.indexOf(ideal); i >= 0; i--) {
    if (ok(LADDER[i])) return LADDER[i];
  }
  return "recall";
}

/**
 * Cut the gap out of a sentence: the first occurrence of the word (in any
 * inflection) becomes `___`, and the surface form it replaced is the answer.
 *
 * Doing this in code rather than asking a model for a sentence "with ___ in it"
 * is deliberate — the gap can't land in the wrong place and the answer can't
 * disagree with the sentence. Returns null when the word isn't in there at all.
 */
export function gapSentence(
  sentence: string,
  word: string,
): { gapped: string; answer: string } | null {
  if (!sentence.trim() || !word) return null;
  const m = sentence.match(wordMatcher(word));
  if (!m || m.index === undefined) return null;
  return {
    gapped: sentence.slice(0, m.index) + "___" + sentence.slice(m.index + m[0].length),
    answer: m[0],
  };
}

/**
 * Gap the *partner*, not the word: "___ a decision". Which words travel
 * together is the last thing to arrive in a second language, and it's the thing
 * a "write your own sentence" round can't isolate — the learner just avoids the
 * chunk they're unsure of.
 *
 * Only chunks that lead with the partner make a good round, so chunks starting
 * with the target word are skipped rather than gapped awkwardly.
 */
export function gapPartner(
  collocations: string[],
  word: string,
): { gapped: string; answer: string } | null {
  const matcher = wordMatcher(word);
  for (const chunk of collocations) {
    const tokens = chunk.trim().split(/\s+/);
    if (tokens.length < 2) continue;
    if (matcher.test(tokens[0])) continue; // leads with the word — a weak gap
    return { gapped: ["___", ...tokens.slice(1)].join(" "), answer: tokens[0] };
  }
  return null;
}

/** How a typed answer measured up. `form` is right word, wrong ending — worth
 *  distinguishing, because it's a different thing to teach than not knowing. */
export type FitVerdict = "exact" | "form" | "wrong";

/**
 * Judge a gap answer. `answer` is the surface form the sentence needs
 * ("worried"); `word` is the headword it inflects from ("worry"). The
 * distinction matters: "right word, wrong ending" has to be measured against
 * the headword, because the surface form can't inflect back to its own lemma.
 */
export function judgeFit(word: string, answer: string, typed: string): FitVerdict {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z'’-]/g, "");
  const a = norm(answer);
  const t = norm(typed);
  if (!t) return "wrong";
  if (a && a === t) return "exact";
  return recallMatches(word, typed) ? "form" : "wrong";
}

/**
 * Did their repair actually land? The fix is whatever `right` has that `wrong`
 * doesn't — so we check for exactly those words rather than trying to diff
 * whole sentences. Lenient by design: this rung is about noticing, and the
 * natural version is always revealed afterwards either way.
 */
export function judgeRepair(
  repair: { wrong: string; right: string },
  word: string,
  typed: string,
): boolean {
  const words = (s: string) => s.toLowerCase().match(/[a-z'’-]+/g) ?? [];
  const before = new Set(words(repair.wrong));
  const added = words(repair.right).filter((w) => !before.has(w));
  const theirs = new Set(words(typed));
  if (!usesWord(word, typed)) return false;
  if (added.length === 0) return typed.trim().toLowerCase() !== repair.wrong.trim().toLowerCase();
  return added.some((w) => theirs.has(w));
}

// --- The bridge: one sentence, two of today's words --------------------------

/**
 * The day's closing bonus. Because a set is drawn from *different* semantic
 * fields by construction, joining two of its words in one sentence is a real
 * creative stretch — and elaborating a link between unrelated items is exactly
 * the processing that builds durable memory.
 *
 * It never touches the schedule. A bonus that could lapse a word would make
 * the honest scheduling elsewhere a lie.
 */
export function bridgePair<T extends { id: string; word: string }>(items: T[]): [T, T] | null {
  if (items.length < 2) return null;
  return [items[items.length - 2], items[items.length - 1]];
}

/** Both words present, in a sentence long enough to have joined them. */
export function judgeBridge(a: string, b: string, sentence: string): boolean {
  const words = sentence.trim().split(/\s+/).length;
  return words >= 5 && usesWord(a, sentence) && usesWord(b, sentence);
}

