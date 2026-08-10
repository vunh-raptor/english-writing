import type { ThinkRung } from "@/types";

/**
 * The Respond mode's shared rules (docs/RESPOND.md): the thinking ladder, and
 * the borrowing check that decides whether an idea is actually the learner's.
 *
 * The design constraint everything here serves: **the app supplies questions,
 * never content**. Nothing in this file is an idea, a summary, or an angle,
 * because a learner who leaves with the model's thinking hasn't thought.
 *
 * The four rungs are a fixed pedagogical arc — understand, analyse, evaluate,
 * create — so the labels below are UI chrome, not material. The questions
 * themselves are written against the learner's actual source every time
 * (`lib/server/prompts/respond.ts`); a generic ladder that could be asked about
 * anything is exactly the "blank page in a nicer font" this mode exists to
 * avoid.
 */

/** How each rung presents itself, and why it is worth climbing. */
export const THINK_RUNGS: Record<ThinkRung, { label: string; why: string }> = {
  grasp: {
    label: "Say it back",
    why: "Putting it in your own words is the first thing that shows you actually have it.",
  },
  assume: {
    label: "What it assumes",
    why: "Every piece takes something for granted. Naming it is where reading turns into thinking.",
  },
  push: {
    label: "Push back",
    why: "Weighing a claim against your own experience is what makes the opinion yours.",
  },
  extend: {
    label: "What it left out",
    why: "The gap in someone else's piece is the doorway to your own.",
  },
};

/** The fixed order of the ladder — understand → analyse → evaluate → create. */
export const RUNG_ORDER: ThinkRung[] = ["grasp", "assume", "push", "extend"];

/** Roughly the length of a post worth reading — short enough to finish. */
export const DRAFT_TARGET_WORDS = 120;
/** Below this a draft isn't a piece yet; the polish call would have nothing to say. */
export const DRAFT_MIN_WORDS = 40;

// --- Is this idea actually theirs? ------------------------------------------
//
// The documented failure mode of source-based writing is borrowing: novice
// writers lift the source's wording and produce something that reads like
// theirs but isn't. So every idea gets checked, in code, before any model sees
// it — a deterministic floor the AI can tighten but never loosen.

/** Words, lowercased, punctuation dropped — the unit both checks work on. */
function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/** Every n-word window of a token list, as joined strings. */
function shingles(words: string[], n: number): string[] {
  if (words.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
  return out;
}

/** A window this long, repeated verbatim, is quotation rather than coincidence. */
const RUN_WORDS = 6;
/** Above this share of borrowed windows, the idea is the source's, not theirs. */
const BORROW_LIMIT = 0.2;

export interface BorrowCheck {
  /** Share of the candidate's word-windows that also appear in the source. */
  ratio: number;
  /** The longest verbatim run lifted from the source, if any reached RUN_WORDS. */
  longest: string;
  /** Our verdict: is enough of this the learner's own wording? */
  own: boolean;
}

/**
 * Compare a candidate against the source it came from. Deliberately measures
 * *wording*, not meaning: agreeing with a piece is fine and normal, but saying
 * it in the piece's own words is the thing that hollows the exercise out.
 */
export function checkBorrowing(source: string, candidate: string): BorrowCheck {
  const cand = tokens(candidate);
  const candWindows = shingles(cand, RUN_WORDS);
  if (candWindows.length === 0) {
    // Too short to measure — a hook is one line, so fall back to a longer-run
    // check against the source and treat "no evidence" as their own.
    const src = new Set(shingles(tokens(source), Math.max(3, cand.length)));
    const hit = cand.length >= 3 && src.has(cand.join(" "));
    return { ratio: hit ? 1 : 0, longest: hit ? candidate.trim() : "", own: !hit };
  }

  const srcWindows = new Set(shingles(tokens(source), RUN_WORDS));
  let hits = 0;
  let runStart = -1;
  let bestStart = -1;
  let bestLen = 0;
  candWindows.forEach((w, i) => {
    if (srcWindows.has(w)) {
      hits++;
      if (runStart === -1) runStart = i;
      const len = i - runStart + RUN_WORDS;
      if (len > bestLen) {
        bestLen = len;
        bestStart = runStart;
      }
    } else {
      runStart = -1;
    }
  });

  const ratio = hits / candWindows.length;
  return {
    ratio,
    longest: bestLen > 0 ? cand.slice(bestStart, bestStart + bestLen).join(" ") : "",
    own: ratio <= BORROW_LIMIT,
  };
}

/** The whole idea as one string — what the borrowing check actually reads. */
export function ideaText(idea: { hook: string; bullets: string[] }): string {
  return [idea.hook, ...idea.bullets].filter(Boolean).join(" ");
}
