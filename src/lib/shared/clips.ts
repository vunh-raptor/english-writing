import type { TranscribeCue } from "@/types";

/**
 * Turning a written passage into timed caption lines.
 *
 * The passages themselves are no longer here. Transcribe used to ship three
 * hand-written clips bundled with the app; they are now generated per learner
 * and stored in `listening_clips` (`lib/server/listening.ts`). What stayed is
 * the part that is pure and worth testing: prose in, cues out.
 *
 * Cue timings are DERIVED from the prose at a stated speaking rate rather than
 * hand-written or asked of a model. Hand-timing a thousand words invites drift
 * between the text and the clock, and the clock is what the chunk cut trusts.
 */

/** Words per caption line — roughly what a broadcast subtitle carries. */
const WORDS_PER_LINE = 11;

/** Split prose into sentences, keeping their terminal punctuation. */
function sentences(prose: string): string[] {
  return prose
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

/**
 * Turn narration into timed caption lines at a given speaking rate. Every line
 * that ends a sentence keeps its full stop, which is what lets `cutIntoChunks`
 * land its cuts on sentence boundaries rather than mid-clause.
 */
export function cueProse(prose: string, wpm: number): TranscribeCue[] {
  const perWord = 60 / Math.max(wpm, 1);
  const cues: TranscribeCue[] = [];
  let clock = 0;

  for (const sentence of sentences(prose)) {
    const words = sentence.split(" ");
    let i = 0;
    while (i < words.length) {
      // Take a full line, unless that would orphan a word or two onto a line
      // of their own — then take the rest of the sentence.
      const remaining = words.length - i;
      const take = remaining - WORDS_PER_LINE <= 2 ? remaining : WORDS_PER_LINE;
      const line = words.slice(i, i + take);
      const start = clock;
      clock += line.length * perWord;
      cues.push({ start: round(start), end: round(clock), text: line.join(" ") });
      i += take;
    }
  }
  return cues;
}

/** Two decimals is finer than any seek the UI performs. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Whole-clip length in seconds, from its cues. */
export function clipDuration(cues: TranscribeCue[]): number {
  return cues.length > 0 ? Math.ceil(cues[cues.length - 1].end) : 0;
}
