import "server-only";
import type { TalkTurn, TalkVerdict, WordRound } from "@/types";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { extractObject, resolveItemId, str, strList } from "@/lib/shared/modelJson";
import { countWords } from "@/lib/shared/stats";
import {
  hintLeaks,
  suggestsFix,
  hintLevel,
  settleVerdict,
  usesWord,
  wordMatcher,
} from "@/lib/shared/words";
import { rawComplete } from "./ai";
import {
  CONFIRM_SYSTEM,
  SYSTEM,
  TURN_SYSTEM,
  confirmUser,
  turnUser,
  user as roundsUser,
  type WordRoundInput,
} from "./prompts/words";

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
/** How many times the partner carries the scene on after the opening moment. */
const MAX_FOLLOWUPS = 2;
/** Two or more underscores: a gap someone was meant to fill. */
const HAS_BLANK = /_{2,}/;

/** Coerce one response into rounds, keeping only what survives the guards. */
function coerceRounds(
  obj: Record<string, unknown>,
  words: WordRoundInput[],
): WordRound[] {
  if (!Array.isArray(obj.rounds)) return [];
  const out: WordRound[] = [];
  const seen = new Set<string>();

  for (const r of obj.rounds) {
    const o = (r ?? {}) as Record<string, unknown>;
    const word = resolveItemId(str(o.id), words);
    // One round per word: a forgiving id match must not let two packs land
    // on the same word and silently drop the other.
    if (!word || seen.has(word.id)) continue;

    const matcher = wordMatcher(word.word);
    const setup = str(o.setup);
    // Empty, or it gave the word away, or it came back as a sentence to
    // complete — a blank turns answering someone into filling a form.
    if (!setup || matcher.test(setup) || HAS_BLANK.test(setup)) continue;
    // A scene with nobody speaking gives them nothing to answer. The opening
    // has to carry a line said to them: something quoted, or a question.
    if (!/["“”]/.test(setup) && !setup.includes("?")) continue;

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

    seen.add(word.id);
    // The follow-ups are asks too, so they answer to the same rule as the
    // setup: one that names the word would hand over the sentence. A pack that
    // loses them is still a round — the conversation is just shorter.
    const followups = strList(o.followups, MAX_FOLLOWUPS).filter(
      // A follow-up is something asked of them. One that isn't a question is
      // usually the model answering on the learner's behalf.
      (f) => !matcher.test(f) && !HAS_BLANK.test(f) && /\?["'”’)]*$/.test(f),
    );

    out.push({
      id: word.id,
      setup,
      task,
      examples,
      ...(followups.length ? { followups } : {}),
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

  // A partial set is kept, but not at the first asking: the checks are strict
  // enough that one generation often loses a word or two, and a second try is
  // cheaper than a learner getting a short day. The fuller set wins.
  let best: WordRound[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await rawComplete(SYSTEM, prompt, 3200);
    const obj = extractObject(raw);
    const rounds = obj ? coerceRounds(obj, capped) : [];
    if (rounds.length > best.length) best = rounds;
    if (best.length === capped.length) break;
    console.warn(
      `[words] attempt ${attempt}: ${rounds.length} of ${capped.length} rounds usable —`,
      raw.slice(0, 200),
    );
  }
  if (best.length > 0) return best;

  throw new Error("Couldn't build today's moments — try again in a moment.");
}

// ---------------------------------------------------------------------------
// One turn of a word's conversation
// ---------------------------------------------------------------------------

const VERDICTS = new Set<TalkVerdict>(["landed", "almost", "missing"]);

/**
 * The lines a code-computed verdict wears when the model gave none.
 *
 * Not generated content and not a stand-in for it: these report a judgment the
 * code itself made, so the learner is never left looking at a held sentence
 * with no words attached. None of them names the word — retrieving it is the
 * learner's job, and the card is one tap away.
 */
const NOTE_MISSING = "Today's word isn't in there yet — say it again with the word in it.";
const NOTE_FRAGMENT = "That's the start of it. Now give it a whole sentence.";
const NOTE_LOOK_AGAIN = "Something in that part isn't right yet — look at it again and say it once more.";

/**
 * Does a context-free check agree that this sentence breaks a rule?
 *
 * Fails toward the judge: if the second opinion can't be had, the first one
 * stands — an outage must not quietly turn the mode into one that passes
 * everything.
 */
async function isFaulty(sentence: string): Promise<boolean> {
  try {
    const obj = extractObject(await rawComplete(CONFIRM_SYSTEM, confirmUser(sentence), 120, 0));
    return obj?.correct !== true;
  } catch {
    return true;
  }
}

/** What the held-sentence judge needs, whichever mode is holding the sentence. */
export interface HeldJudgeInput {
  /** The surface's own judge prompt (Daily Words, the arena) — same contract. */
  system: string;
  user: string;
  sentence: string;
  /** Did deterministic detection find the item in the sentence? */
  detected: boolean;
  /** The item, when it is hidden from the learner: a "missing" hint may not
   *  name it, because retrieving it is their job. Null when it is on screen. */
  hidden: RegExp | null;
  missingNote?: string;
}

/**
 * Judge one sentence that is held until it is right.
 *
 * This is the only implementation of the required-correction fences, shared
 * by every mode that holds a sentence (Daily Words, the Phrasebook arena) so
 * that none of them can quietly hold more loosely than the others. The model's
 * judgment is settled against deterministic detection (`settleVerdict`); a
 * held sentence needs a second, context-free judge to agree it is wrong; and
 * everything the model wrote back is checked before it reaches the learner —
 * a quote that isn't in their sentence is dropped, a hint that is really the
 * corrected sentence is dropped, and a hint that names a hidden item is
 * replaced. Fails soft to detection alone.
 */
export async function judgeHeld(input: HeldJudgeInput): Promise<TalkTurn> {
  const { sentence, detected, hidden } = input;
  const words = countWords(sentence);

  let obj: Record<string, unknown> | null = null;
  try {
    obj = extractObject(
      await rawComplete(
        input.system,
        input.user,
        220,
        // A verdict is not a creative act: the same sentence must get the same
        // answer twice, or being held on it stops feeling fair.
        0,
      ),
    );
  } catch (e) {
    console.warn("[held] turn judged by detection alone —", e instanceof Error ? e.message.slice(0, 160) : e);
  }

  const claimed = str(obj?.verdict) as TalkVerdict;
  const model = obj && VERDICTS.has(claimed) ? claimed : null;
  // Models echo the help level they were given ("frame: ..."); the label is
  // ours, not something to show the learner.
  let hint = str(obj?.hint).replace(/^\s*(point|pattern|frame)\s*[:\-–—]\s*/i, "");
  const rawQuote = str(obj?.quote);
  const quote =
    rawQuote && sentence.toLowerCase().includes(rawQuote.toLowerCase()) ? rawQuote : "";

  const verdict = settleVerdict(model, detected, words, Boolean(hint || quote));

  // The model may tighten, but only with a witness: a held sentence must also
  // fail a context-free grammar check. Costs a second call on misses only.
  if (verdict === "almost" && model === "almost" && words >= 3 && !(await isFaulty(sentence))) {
    return { verdict: "landed", reply: "" };
  }

  if (verdict === "landed") {
    // A reaction only counts when the model itself judged it landed; a rescued
    // verdict gets no invented line.
    return { verdict, reply: model === "landed" ? str(obj?.reply) : "" };
  }

  if (verdict === "missing") {
    if (!hint || (hidden && hidden.test(hint))) hint = input.missingNote ?? NOTE_MISSING;
    return { verdict, reply: "", hint };
  }

  // almost — "what already works" is a comment on their sentence. If it came
  // back as a sentence of its own, it is a model answer in disguise: drop it.
  const said_ = model === "almost" ? str(obj?.works) : "";
  const works =
    said_ && !hintLeaks(said_, sentence) && !suggestsFix(said_, quote, sentence) && said_.length <= 160
      ? said_
      : "";
  if (hint && (hintLeaks(hint, sentence) || suggestsFix(hint, quote, sentence))) hint = "";
  if (!hint) hint = words < 3 ? NOTE_FRAGMENT : quote ? "" : NOTE_LOOK_AGAIN;
  return {
    verdict,
    reply: works,
    ...(quote ? { quote } : {}),
    ...(hint ? { hint } : {}),
  };
}

/** Judge one sentence in a word's conversation (Daily Words). */
export async function wordTurn(
  snapshot: LearnerSnapshot,
  word: { word: string; pos: string; meaning: string },
  said: string,
  sentence: string,
  misses: number,
): Promise<TalkTurn> {
  return judgeHeld({
    system: TURN_SYSTEM,
    user: turnUser(snapshot, word, said, sentence, hintLevel(misses)),
    sentence,
    detected: usesWord(word.word, sentence),
    hidden: wordMatcher(word.word),
  });
}
