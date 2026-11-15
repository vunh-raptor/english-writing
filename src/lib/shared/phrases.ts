import type { LexKind, Phrase, SrsRecord } from "@/types";
import { todayKey } from "./date";
import { isDue } from "./srs";
import { wordMatcher } from "./words";

/**
 * The shared vocabulary of lexical practice: how a round asks for production,
 * and how a saved item is recognized inside a learner's own sentence.
 *
 * The items themselves live in `Store.minedPhrases` — daily words the learner
 * has met (docs/DAILY_WORDS.md), highlights they captured, and targets mined
 * from News Chat missions. One pool, one Leitner schedule, three surfaces.
 */

/**
 * A phrase as a lenient matcher: ___ gaps become short wildcards; apostrophes
 * and spacing flex. "It's worth ___" matches "its worth trying it, honestly".
 * Used server-side to detect honest production (missions, the arena).
 */
export function phraseMatcher(text: string): RegExp {
  const parts = text
    .split(/_{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) =>
      p
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/['’]/g, "['’]?")
        .replace(/\s+/g, "\\s+"),
    );
  if (parts.length === 0) return /$^/;
  return new RegExp(parts.join("[\\s\\S]{0,40}?"), "i");
}

/**
 * The matcher for any saved item. A single word matches its normal inflections
 * ("arrange" in "arranging"), which `phraseMatcher` alone can't — it matches
 * the letters as written, so a learner who bent the word correctly would be
 * told it wasn't there. Everything longer flexes through its gaps instead.
 */
export function itemMatcher(text: string, kind?: LexKind): RegExp {
  const t = text.trim();
  const oneWord = /^[a-z'’-]+$/i.test(t);
  return oneWord || (kind === "word" && !/[\s_]/.test(t)) ? wordMatcher(t) : phraseMatcher(t);
}

/**
 * How many saved items are due for practice today, capped for the badge. New
 * items (no schedule yet) count as due; returns 0 once the pool is clear.
 */
export function dueTodayCount(
  srs: Record<string, SrsRecord>,
  pool: Phrase[],
  cap = 9,
): number {
  const today = todayKey();
  const due = pool.reduce((n, p) => (isDue(srs[p.id], today) ? n + 1 : n), 0);
  return Math.min(due, cap);
}
