import "server-only";
import type {
  CaptureEnrichment,
  DrillJudgment,
  DrillMethod,
  DrillRoundSetup,
  LexKind,
  PhraseAlternative,
  Upgrade,
} from "@/types";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { extractObject, normalizeGaps, str, strList } from "@/lib/shared/modelJson";
import { rawComplete } from "./ai";
import { countWords } from "@/lib/shared/stats";
import { drillArcFor, phraseMatcher } from "@/lib/shared/phrases";
import {
  DRILL_SYSTEM,
  ENRICH_SYSTEM,
  JUDGE_SYSTEM,
  drillUser,
  enrichUser,
  judgeUser,
  type DrillItem,
} from "./prompts/phrasebook";

/**
 * The Phrasebook engine (docs/PHRASEBOOK.md) — three small stateless AI jobs
 * behind the capture-to-application loop:
 *
 *   enrichCapture : a raw highlight (+ its surrounding passage) → a compact
 *                   phrasebook entry: the reusable unit, plain meaning, one
 *                   transfer example, register, alternatives.
 *   drillRounds   : one call per practice session — for each phrase, a tiny
 *                   real-life situation that CALLS FOR producing it. The
 *                   situation never contains the phrase (code-checked), so
 *                   recall rounds stay recall.
 *   judgeDrill    : honest per-answer judgment — did the learner APPLY the
 *                   phrase in their own sentence? Unioned with deterministic
 *                   detection (phraseMatcher) like the mission engine, so a
 *                   lazy model can't erase a real production.
 *
 * Practice is production, never recognition: nothing here ever returns a
 * ready-made answer sentence for the learner to send. The prompts live in
 * `prompts/phrasebook.ts`; what stays here is the coercion and the guards.
 */

const LEX_KINDS = new Set<LexKind>([
  "word",
  "phrase",
  "idiom",
  "pattern",
  "collocation",
  "sentence",
]);

/**
 * Enrich one highlight into a phrasebook entry. Throws when the model can't
 * produce a meaning — the client then saves the raw highlight instead (capture
 * never fails; enrichment is best-effort).
 */
export async function enrichCapture(
  snapshot: LearnerSnapshot,
  snippet: string,
  context: string,
): Promise<CaptureEnrichment> {
  const raw = await rawComplete(ENRICH_SYSTEM, enrichUser(snapshot, snippet, context), 300);
  const obj = extractObject(raw);
  if (!obj) throw new Error("Enrichment unavailable.");

  const meaning = str(obj.meaning);
  if (!meaning) throw new Error("Enrichment unavailable.");

  const alternatives: PhraseAlternative[] = Array.isArray(obj.alternatives)
    ? obj.alternatives
        .map((a) => {
          const o = (a ?? {}) as Record<string, unknown>;
          const note = str(o.note);
          return { text: str(o.text), ...(note ? { note } : {}) };
        })
        .filter((a) => a.text)
        .slice(0, 2)
    : [];

  const register = str(obj.register).slice(0, 24);
  const text = normalizeGaps(str(obj.text)) || snippet.trim();
  // Kind: the model's classification, sanity-corrected by shape (a ___ gap is
  // a pattern; a single token is a word) so practice never mis-adapts.
  let kind = LEX_KINDS.has(obj.kind as LexKind) ? (obj.kind as LexKind) : "phrase";
  if (text.includes("___")) kind = "pattern";
  else if (countWords(text) === 1) kind = "word";
  const collocations = strList(obj.collocations, 4).filter((c) => countWords(c) <= 4);

  return {
    text,
    kind,
    meaning,
    example: str(obj.example),
    ...(register ? { register } : {}),
    ...(alternatives.length ? { alternatives } : {}),
    ...(collocations.length ? { collocations } : {}),
  };
}

// ---------------------------------------------------------------------------
// 2. Rounds for a practice session — one call, all rounds, varied methods
// ---------------------------------------------------------------------------

/** How many rounds one call may set up (also the session cap client-side). */
const MAX_DRILL_ITEMS = 8;
/** A worked example longer than this is a paragraph, not a model sentence. */
const MAX_EXAMPLE_WORDS = 25;

const METHODS = new Set<DrillMethod>([
  "situation",
  "reply",
  "rephrase",
  "personal",
  "collocation",
]);

function coerceRounds(
  obj: Record<string, unknown>,
  items: DrillItem[],
  assigned: Map<string, DrillMethod>,
): DrillRoundSetup[] {
  if (!Array.isArray(obj.rounds)) return [];
  const byId = new Map(items.map((p) => [p.id, p]));
  const out: DrillRoundSetup[] = [];

  for (const r of obj.rounds) {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = str(o.id);
    const phrase = byId.get(id);
    if (!phrase) continue;

    const setup = str(o.setup);
    if (!setup || phraseMatcher(phrase.text).test(setup)) continue; // leaked/empty

    // The ask has to come from the model — there is no canned instruction to
    // fall back on any more, and a round without one is not a round.
    const task = str(o.task);
    if (!task) continue;

    // The method is code-assigned; the model echoing something else is noise.
    const method =
      METHODS.has(o.method as DrillMethod) && o.method === assigned.get(id)
        ? (o.method as DrillMethod)
        : assigned.get(id)!;
    const examples = strList(o.examples, 2).filter(
      (e) => countWords(e) <= MAX_EXAMPLE_WORDS && phraseMatcher(phrase.text).test(e),
    );
    out.push({ id, method, setup, task, examples });
  }
  return out;
}

/**
 * One round per phrase, in one call, methods rotating through a kind-aware arc
 * (code-assigned — variety is planned, not left to the model; words lead with
 * partner-word production).
 *
 * Guards, in code: a setup that leaks the phrase is dropped (it would turn a
 * recall round into copying); an example that doesn't contain the phrase is
 * dropped. Retries once when nothing survives, then fails honestly — a
 * session of canned situations that fit no phrase in particular is worse than
 * saying the material isn't ready.
 */
export async function drillRounds(
  snapshot: LearnerSnapshot,
  items: DrillItem[],
): Promise<DrillRoundSetup[]> {
  const capped = items.slice(0, MAX_DRILL_ITEMS);
  if (capped.length === 0) return [];

  const assigned = new Map<string, DrillMethod>(
    capped.map((p, i) => {
      const arc = drillArcFor(p.kind);
      return [p.id, arc[i % arc.length]];
    }),
  );
  const prompt = drillUser(snapshot, capped, assigned);

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await rawComplete(DRILL_SYSTEM, prompt, 1500);
    const obj = extractObject(raw);
    const rounds = obj ? coerceRounds(obj, capped, assigned) : [];
    if (rounds.length > 0) return rounds;
    console.warn(`[phrasebook] drill attempt ${attempt} produced no usable rounds`);
  }
  throw new Error("Couldn't build your practice rounds — try again in a moment.");
}

// ---------------------------------------------------------------------------
// 3. Judge one answer — application, honestly
// ---------------------------------------------------------------------------

/** An answer this short can't be an own sentence around the phrase. */
const MIN_ANSWER_WORDS = 4;

/**
 * The line a code-computed verdict wears when the model didn't supply one.
 *
 * These are not generated content and are not a fallback for it: the verdict
 * itself was decided deterministically, and this is the sentence that reports
 * it. A learner is never left staring at a judgment with no words attached.
 */
const USED_NOTE = "You worked it into your own sentence — that's the whole game.";
const MISSED_NOTE = "I couldn't spot it in there — look where it would fit, and it'll come back around.";

/**
 * Judge one drill answer. The model's variant-tolerant judgment is unioned
 * with deterministic detection, mirroring the mission engine: models speak
 * reliably but judge lazily, and a real production must never be erased.
 * Fails soft to the deterministic check alone.
 */
export async function judgeDrill(
  snapshot: LearnerSnapshot,
  phrase: { text: string; meaning: string },
  situation: string,
  sentence: string,
): Promise<DrillJudgment> {
  const detected =
    countWords(sentence) >= MIN_ANSWER_WORDS && phraseMatcher(phrase.text).test(sentence);

  try {
    const raw = await rawComplete(
      JUDGE_SYSTEM,
      judgeUser(snapshot, phrase, situation, sentence),
      260,
    );
    const obj = extractObject(raw);
    if (!obj) return { used: detected, note: detected ? USED_NOTE : MISSED_NOTE };

    const used = obj.used === true || detected;

    let upgrade: Upgrade | undefined;
    const u = (obj.upgrade ?? null) as Record<string, unknown> | null;
    if (u) {
      const you = str(u.you);
      const up = str(u.upgrade);
      if (you && up) upgrade = { you, upgrade: up, why: str(u.why) };
    }

    return {
      used,
      note: str(obj.note) || (used ? USED_NOTE : MISSED_NOTE),
      ...(upgrade ? { upgrade } : {}),
    };
  } catch {
    return { used: detected, note: detected ? USED_NOTE : MISSED_NOTE };
  }
}
