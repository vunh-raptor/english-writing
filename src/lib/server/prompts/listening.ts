import "server-only";
import {
  bullets,
  jsonContract,
  joinParts,
  renderSnapshot,
  section,
  type LearnerSnapshot,
} from "@/lib/shared/prompt";
import type { NewsLevel } from "@/types";
import { PITCH, UNTRUSTED } from "./blocks";

/**
 * A listening passage, written for one learner (docs/TRANSCRIBE.md).
 *
 * Transcribe used to ship three hand-written passages. Three passages is a
 * week; after that the mode is over. A generated passage is unlimited, sits at
 * the learner's band, and can be about something they have actually chosen to
 * write about — but it has to be *worth transcribing*, which is a real
 * constraint: dictation exposes every filler sentence, so the prose has to hold
 * up word by word.
 *
 * The passage is prose only. Cue timings are derived from it in code at a
 * stated speaking rate (`lib/shared/clips.ts`), because a model asked for
 * timings produces a transcript and a clock that disagree, and the chunk cut
 * trusts the clock.
 */

export const VERSION = "listening.clip.v1";

/** Roughly the length that yields ~10 chunks of 15 seconds — one full passage. */
const TARGET_WORDS = 420;

export const SYSTEM = joinParts([
  "You write a short spoken-English passage for a learner to transcribe by ear, word by word. It will be read aloud and they will write down exactly what they hear, so every sentence has to survive that.",

  section(
    "THE PASSAGE",
    bullets([
      `About ${TARGET_WORDS} words of continuous prose. No headings, no lists, no speaker labels, no stage directions.`,
      "One voice, explaining something real to an ordinary listener. Narration or a lecture excerpt — not a dialogue.",
      "A genuine idea with a shape: an observation, what it turns out to be, and why that matters. Something the learner will still be thinking about after the last chunk.",
      "Plain spoken rhythm. Contractions are welcome. Long clause-stacked sentences are not — they punish the ear without teaching it.",
      "Concrete over abstract: numbers, places, objects, and consequences. Vague prose is unlistenable and unmemorable at the same time.",
      "Nothing that needs specialist knowledge, and nothing distressing — the learner is doing hard work already.",
      "No invented quotations, no invented named people, no invented statistics attributed to a real organisation. Where a figure helps, keep it round and clearly illustrative.",
    ]),
  ),

  section(
    "AND WITH IT",
    bullets([
      "title: a plain, curiosity-provoking line. Not a headline pun.",
      'source: an honest label for what this is, e.g. "Written for you · narration". Never a real programme, publisher, or byline.',
      "blurb: ONE line on what makes this clip easy or hard to HEAR — pace, register, density of numbers. Not what it is about.",
      "wpm: the speaking rate it should be read at. Narration sits near 150; slow it towards 130 for a dense or higher-band passage.",
    ]),
  ),

  PITCH,
  UNTRUSTED,

  jsonContract(`{"title":"...","source":"...","blurb":"...","wpm":150,"prose":"..."}`),
]);

export function user(snapshot: LearnerSnapshot, level: NewsLevel): string {
  return joinParts([
    renderSnapshot(snapshot, ["level", "topics", "known", "recent"]),
    section("ASKED FOR", `One passage at ${level}, around ${TARGET_WORDS} words.`),
    "Choose a subject they have not just had. If the app knows what they write about, go near it — but a passage about something adjacent teaches more than one about the same thing again.",
  ]);
}
