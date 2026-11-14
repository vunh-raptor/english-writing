import type { ArenaRegister, ArenaShift, ArenaStation, ArenaTurn } from "@/types";

/**
 * How each station reads to the learner. Labels and one-line asks only — the
 * scenes themselves are generated per item, never written here.
 */
export const STATION_META: Record<
  ArenaStation | "combo",
  { label: string; tests: string; hidden: boolean }
> = {
  recall: { label: "Recall", tests: "Find it from its meaning alone.", hidden: true },
  partner: { label: "Partner", tests: "Use it with the word it travels with.", hidden: false },
  shift: { label: "Shape", tests: "Bend it into another shape.", hidden: false },
  register: { label: "Register", tests: "Say it to someone the setting changes.", hidden: false },
  native: { label: "Say it native", tests: "Take a flat line and say it the way a native would.", hidden: false },
  clock: { label: "Clock", tests: "From memory, against the clock.", hidden: true },
  combo: { label: "Combo", tests: "Both items, one sentence.", hidden: false },
};

const SHIFT_ASK: Record<ArenaShift, string> = {
  past: "Say it about something that already happened.",
  negative: "Say it as something that didn't, or won't, happen.",
  question: "Ask them something with it.",
  "someone else": "Say it about someone else, not you.",
  future: "Say it about something still to come.",
};

const REGISTER_ASK: Record<ArenaRegister, string> = {
  formal: "You're talking to someone you need to be careful with.",
  casual: "You're talking to someone close. Keep it relaxed.",
};

/** The one line that says what this station wants from the sentence. */
export function demandOf(turn: ArenaTurn): string {
  if (turn.rematch) return "Second try: from memory this time.";
  if (turn.station === "shift" && turn.shift) return SHIFT_ASK[turn.shift];
  if (turn.station === "register" && turn.register) return REGISTER_ASK[turn.register];
  return STATION_META[turn.station].tests;
}

/** Is the item kept off the screen at this station? */
export function isHidden(turn: ArenaTurn): boolean {
  return turn.rematch === true || STATION_META[turn.station].hidden;
}
