import "server-only";
import type { WordRound } from "@/types";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { extractObject, str, strList } from "@/lib/shared/modelJson";
import { countWords } from "@/lib/shared/stats";
import { wordMatcher } from "@/lib/shared/words";
import { rawComplete } from "./ai";
import { SYSTEM, user as roundsUser, type WordRoundInput } from "./prompts/words";

export type { WordRoundInput };

/**
 * The Daily Words engine (docs/DAILY_WORDS.md) — one stateless AI job.
 *
 *   wordRounds : for each word in today's set, a round pack — the real-life
 *                moment that CALLS FOR the word (never containing it), two
 *                worked examples, one sentence to cut a gap in, and one
 *                near-miss to repair.
 *
 * The guards below are the interesting part, and they all pull the same way:
 * **the model proposes, the code disposes.** A setup that leaks the word it is
 * eliciting would turn production into copying, so it is dropped. An example
 * that doesn't contain the word teaches nothing, so it is dropped. A repair
 * pair whose halves differ by a rewrite has no "spot what changed" answer worth
 * learning, so it is dropped. The prompt asks for all of this; only the code
 * can guarantee it.
 *
 * There is no local fallback any more. The curriculum is generated, so a day
 * without a provider has no material at all, and saying so honestly beats
 * running a session on generic moments that fit no word in particular.
 */

/** How many words one call may build rounds for (also the session cap). */
const MAX_WORDS = 10;
/** A worked example longer than this is a paragraph, not a model sentence. */
const MAX_EXAMPLE_WORDS = 25;
/** Each pack contains six sentences plus JSON structure. Scale the allowance
 * with the day size so five- and ten-word modes do not end in truncated JSON. */
const TOKENS_PER_ROUND = 360;
const MIN_OUTPUT_TOKENS = 1500;
const MAX_OUTPUT_TOKENS = 4000;

/** Coerce one response into rounds, keeping only what survives the guards. */
function coerceRounds(
  obj: Record<string, unknown>,
  words: WordRoundInput[],
): WordRound[] {
  if (!Array.isArray(obj.rounds)) return [];
  const byId = new Map(words.map((w) => [w.id, w]));
  const out: WordRound[] = [];

  for (const r of obj.rounds) {
    const o = (r ?? {}) as Record<string, unknown>;
    const word = byId.get(str(o.id));
    if (!word) continue;

    const matcher = wordMatcher(word.word);
    const setup = str(o.setup);
    if (!setup || matcher.test(setup)) continue; // empty, or it gave the word away

    // The ask has to come from the model too, now that there is no bundled
    // instruction to fall back on. A round without one is not a round.
    const task = str(o.task);
    if (!task) continue;

    const examples = strList(o.examples, 2).filter(
      (e) => countWords(e) <= MAX_EXAMPLE_WORDS && matcher.test(e),
    );

    // A cloze sentence without the word in it has no gap to cut.
    const clozeRaw = str(o.cloze);
    const cloze =
      clozeRaw && countWords(clozeRaw) <= MAX_EXAMPLE_WORDS && matcher.test(clozeRaw)
        ? clozeRaw
        : undefined;

    // A repair pair is only usable if both halves contain the word, they
    // actually differ, and the fix is a word-level change rather than a rewrite.
    const rep = (o.repair ?? null) as Record<string, unknown> | null;
    const wrong = str(rep?.wrong);
    const right = str(rep?.right);
    const repair =
      wrong &&
      right &&
      wrong.toLowerCase() !== right.toLowerCase() &&
      matcher.test(wrong) &&
      matcher.test(right) &&
      countWords(right) <= MAX_EXAMPLE_WORDS &&
      Math.abs(countWords(right) - countWords(wrong)) <= 2
        ? { wrong, right }
        : undefined;

    out.push({
      id: word.id,
      setup,
      task,
      examples,
      ...(cloze ? { cloze } : {}),
      ...(repair ? { repair } : {}),
    });
  }
  return out;
}

/**
 * One "use it" round per word, in one call.
 *
 * Retries once when nothing survived the guards — a single unlucky generation
 * is common on fast free-tier models and cheap to redo — then fails honestly.
 * A partial result is kept: a set that built eight rounds out of ten runs eight
 * full rounds rather than none.
 */
export async function wordRounds(
  snapshot: LearnerSnapshot,
  words: WordRoundInput[],
): Promise<WordRound[]> {
  const capped = words.slice(0, MAX_WORDS);
  if (capped.length === 0) return [];

  const prompt = roundsUser(snapshot, capped);
  const outputTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(MIN_OUTPUT_TOKENS, capped.length * TOKENS_PER_ROUND),
  );

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await rawComplete(SYSTEM, prompt, outputTokens);
    const obj = extractObject(raw);
    const rounds = obj ? coerceRounds(obj, capped) : [];
    if (rounds.length > 0) return rounds;
    console.warn(`[words] attempt ${attempt} produced no usable rounds`);
  }

  throw new Error("Couldn't build today's moments — try again in a moment.");
}
