import type { Entry, Feedback, Profile } from "../types";
import { tokenize } from "./stats";

/**
 * Offline, on-device feedback. It runs with zero setup and — crucially — it
 * leads with what went well. The whole philosophy is: produce first with no
 * correction, then get *gentle*, opt-in feedback that builds confidence rather
 * than fear. These notes are framed as suggestions, never red squiggles.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "at",
  "for", "with", "is", "am", "are", "was", "were", "be", "been", "it", "i",
  "you", "he", "she", "we", "they", "my", "your", "this", "that", "have",
  "has", "had", "do", "did", "not", "as", "if", "then", "there", "here",
  "me", "him", "her", "them", "us", "from", "by", "about", "into", "very",
]);

const TRY_NEXT = [
  "Next time, add one sentence about *why* you feel that way.",
  "Try describing one detail using a sense — what could you see, hear, or smell?",
  "Pick one sentence and stretch it: add a 'because…' to the end.",
  "Next session, open with a question and then answer it.",
  "Try ending with one sentence about what happens next.",
  "Add a sentence comparing this to something else — 'it was like…'.",
];

function sentencesWithLengths(text: string): number[] {
  return text
    .split(/[.!?]+/)
    .map((s) => (s.trim().match(/[A-Za-z][A-Za-z'-]*/g)?.length ?? 0))
    .filter((n) => n > 0);
}

/**
 * Build encouraging feedback from the entry + the learner's history. `avgWords`
 * is their recent average session length, used to celebrate momentum.
 */
export function localFeedback(
  entry: Entry,
  profile: Profile,
  avgWords: number,
): Feedback {
  const strengths: string[] = [];

  strengths.push(
    `You wrote ${entry.words} word${entry.words === 1 ? "" : "s"} without stopping — that's the whole game.`,
  );
  if (avgWords > 0 && entry.words >= avgWords * 1.1) {
    strengths.push(`That's longer than your recent average. Real momentum.`);
  }
  if (entry.newWords > 0) {
    strengths.push(
      `You reached for ${entry.newWords} word${entry.newWords === 1 ? "" : "s"} you'd never written here before.`,
    );
  }
  if (entry.sentences >= 3) {
    strengths.push(`You shaped ${entry.sentences} full sentences — nice flow.`);
  }
  if (profile.streak >= 2) {
    strengths.push(`Day ${profile.streak} of your streak. Showing up is the skill.`);
  }

  const suggestions: Feedback["suggestions"] = [];
  const lens = sentencesWithLengths(entry.text);

  // Gentle: very long run-on sentence → invite splitting it.
  const longest = Math.max(0, ...lens);
  if (longest >= 35) {
    suggestions.push({
      note: "One of your sentences runs quite long. Splitting it into two can make it land harder — no rush, just something to play with.",
    });
  }

  // Gentle: heavy repetition of one content word → offer variety.
  const counts = new Map<string, number>();
  for (const w of tokenize(entry.text)) {
    if (STOPWORDS.has(w) || w.length < 4) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  let topWord = "";
  let topCount = 0;
  for (const [w, c] of counts) {
    if (c > topCount) {
      topWord = w;
      topCount = c;
    }
  }
  if (topCount >= 4) {
    suggestions.push({
      note: `You leaned on "${topWord}" a few times. When it feels natural, a synonym here and there adds color.`,
      example: topWord,
    });
  }

  // Gentle: long stretch with almost no full stops → pacing nudge.
  if (entry.words >= 40 && entry.sentences <= 1) {
    suggestions.push({
      note: "This came out as one long breath. Adding a few periods can give your ideas room to land.",
    });
  }

  const oneThingToTry = TRY_NEXT[entry.words % TRY_NEXT.length];

  return {
    source: "local",
    encouragement:
      entry.words >= 60
        ? "That's a real piece of writing. You kept going."
        : "You showed up and put words down. That's exactly the habit.",
    strengths,
    suggestions,
    oneThingToTry,
  };
}
