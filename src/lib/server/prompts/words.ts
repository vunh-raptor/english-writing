import "server-only";
import {
  bullets,
  jsonContract,
  joinParts,
  renderSnapshot,
  section,
  type LearnerSnapshot,
} from "@/lib/shared/prompt";
import type { WordPos } from "@/types";
import { EXAMPLES_ARE_INPUT, NO_LEAK, PITCH, UNTRUSTED } from "./blocks";

/** One word a round is wanted for. The id is what the pack must come back under. */
export interface WordRoundInput {
  id: string;
  word: string;
  pos: WordPos;
  meaning: string;
  collocations?: string[];
}

/**
 * The Daily Words round pack — the material one word's turn is made of
 * (docs/DAILY_WORDS.md).
 *
 * Every rung of the drill ladder needs a different kind of sentence, and only
 * `setup` is the learner's ask: `cloze` and `repair` are raw material the code
 * cuts gaps into afterwards, which is why they are asked for as ordinary
 * sentences rather than as pre-gapped ones. A model asked for "a sentence with
 * ___ in it" puts the gap in the wrong place surprisingly often; a model asked
 * for a sentence, gapped in code, cannot.
 */

export const VERSION = "words.rounds.v2";

export const SYSTEM = joinParts([
  "You write practice material for words an English learner is studying today. For EACH word you get, return one pack.",

  section(
    "THE PACK",
    bullets([
      'setup: a concrete everyday moment, 1-2 sentences, addressed to "you" (friends, family, work, shops, messages, travel). It must END on the exact thing the learner has to respond to, and it must make this particular word the natural one to reach for.',
      "task: ONE short instruction telling them what to write. They always answer in their own sentence.",
      "examples: exactly 2 short, natural sentences that USE the word.",
      "cloze: ONE natural sentence using the word, where the surrounding words make clear both WHICH word belongs and WHICH form it must take (tense, plural, comparative). Write it out normally — do NOT put a blank in it.",
      'repair: a pair {wrong, right}. "wrong" is that same kind of sentence carrying ONE realistic learner mistake involving this word — a wrong partner word ("do a decision"), a wrong preposition, a wrong form. "right" is the identical sentence with only that mistake fixed. Change nothing else between them, and never make the mistake a spelling typo.',
    ]),
  ),

  section(
    "HARD RULES",
    bullets([
      NO_LEAK,
      "Each example, and both the cloze and repair sentences, MUST contain the word (any normal inflection is fine).",
      EXAMPLES_ARE_INPUT,
      "Vary the settings across rounds — different places, people, and times of day.",
    ]),
  ),

  PITCH,
  UNTRUSTED,

  jsonContract(
    `{"rounds":[{"id":"...","setup":"...","task":"...","examples":["...","..."],"cloze":"...","repair":{"wrong":"...","right":"..."}}]}`,
  ),
]);

/** One line per word: the id the round must come back under, and its gloss. */
function wordLines(words: WordRoundInput[]): string {
  return words
    .map(
      (w) =>
        `${w.id} [${w.pos}] "${w.word}" — ${w.meaning || "(no gloss)"}${
          w.collocations?.length ? ` (goes with: ${w.collocations.join(", ")})` : ""
        }`,
    )
    .join("\n");
}

export function user(snapshot: LearnerSnapshot, words: WordRoundInput[]): string {
  return joinParts([
    renderSnapshot(snapshot, ["level", "topics", "recent"]),
    section("TODAY'S WORDS", wordLines(words)),
  ]);
}
