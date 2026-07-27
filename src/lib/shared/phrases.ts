import type { DrillMethod, LexKind, Phrase, SrsRecord } from "@/types";
import { todayKey } from "./date";
import { isDue } from "./srs";

/**
 * The shared vocabulary of lexical practice: how a round asks for production,
 * and how a saved item is recognized inside a learner's own sentence.
 *
 * The items themselves live in `Store.minedPhrases` — daily words the learner
 * has met (docs/DAILY_WORDS.md), highlights they captured, and targets mined
 * from News Chat missions. One pool, one Leitner schedule, three surfaces.
 */

// --- Drill methods: the shared method vocabulary ----------------------------

/**
 * The fixed method rotation a practice session walks (index % length). Starts
 * with the easiest ask; both the server (round building) and the client
 * (offline fallback) follow it so sessions feel the same either way.
 */
export const DRILL_METHOD_ARC: DrillMethod[] = [
  "situation",
  "reply",
  "rephrase",
  "personal",
];

/** Single words learn best in company (collocation research) — their arc
 *  leads with partner-word production instead of rephrasing an idiom. */
const WORD_METHOD_ARC: DrillMethod[] = ["collocation", "situation", "reply", "personal"];

/** The method rotation appropriate to an item's kind. */
export function drillArcFor(kind?: LexKind): DrillMethod[] {
  return kind === "word" ? WORD_METHOD_ARC : DRILL_METHOD_ARC;
}

/** The learner-facing instruction each method falls back to. */
export const DRILL_TASKS: Record<DrillMethod, string> = {
  situation: "Answer the moment in your own sentence — work your phrase in naturally.",
  reply: "Write your reply — use your phrase naturally.",
  rephrase: "Say the same idea more naturally, using your phrase.",
  personal: "Tell it in one or two true sentences, using your phrase.",
  collocation: "Use it together with a natural partner word, in your own sentence.",
};

/**
 * A phrase as a lenient matcher: ___ gaps become short wildcards; apostrophes
 * and spacing flex. "It's worth ___" matches "its worth trying it, honestly".
 * Used server-side to detect honest production (missions, drills) and
 * client-side as the offline judging fallback.
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
