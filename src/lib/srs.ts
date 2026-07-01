import type { SrsRecord, DayKey } from "../types";
import { addDays, daysBetween, todayKey } from "./date";

/**
 * A small Leitner-style spaced-repetition scheduler. Each successful production
 * moves a phrase up a box (longer interval); a lapse resets it. Reviewing right
 * before you'd forget is what beats "remember then forget".
 */

export const SRS_INTERVALS = [0, 1, 3, 7, 16, 30]; // days per box
const MAX_BOX = SRS_INTERVALS.length - 1;

/** Update a phrase's schedule after a review. New phrases have no record yet. */
export function reviewCard(
  rec: SrsRecord | undefined,
  success: boolean,
  today: DayKey = todayKey(),
): SrsRecord {
  const prevBox = rec?.box ?? 0;
  const box = success ? Math.min(prevBox + 1, MAX_BOX) : 0;
  return {
    box,
    due: addDays(today, SRS_INTERVALS[box]),
    reps: (rec?.reps ?? 0) + (success ? 1 : 0),
    last: today,
  };
}

/** New (no record) or past its due date → due for practice. */
export function isDue(rec: SrsRecord | undefined, today: DayKey = todayKey()): boolean {
  if (!rec) return true;
  return daysBetween(rec.due, today) >= 0;
}

export type PhraseState = "new" | "learning" | "mastered";

export function phraseState(rec: SrsRecord | undefined): PhraseState {
  if (!rec) return "new";
  return rec.box >= 4 ? "mastered" : "learning";
}

export interface SrsSummary {
  new: number;
  learning: number;
  mastered: number;
  dueToday: number;
}

/** Count states across a set of phrase ids given the schedule. */
export function srsSummary(
  ids: string[],
  srs: Record<string, SrsRecord>,
  today: DayKey = todayKey(),
): SrsSummary {
  const out: SrsSummary = { new: 0, learning: 0, mastered: 0, dueToday: 0 };
  for (const id of ids) {
    const rec = srs[id];
    out[phraseState(rec)]++;
    if (isDue(rec, today)) out.dueToday++;
  }
  return out;
}
