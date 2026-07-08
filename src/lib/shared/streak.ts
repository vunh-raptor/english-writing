import type { Profile, DayKey } from "@/types";
import { daysBetween } from "./date";

/**
 * Streaks with forgiveness. Loss aversion is the engine — but a single missed
 * day must not nuke months of progress, or learners death-spiral and quit. So
 * we keep "freeze" tokens that silently cover missed days.
 */

export const MAX_FREEZES = 5;
export const STARTING_FREEZES = 2;
/** Earn a freeze each time the streak reaches a multiple of this. */
const FREEZE_MILESTONE = 5;

export type StreakStatus =
  | "none" // never written
  | "today" // already wrote today
  | "safe" // wrote yesterday; write today to extend
  | "at-risk" // missed day(s) — a freeze will cover it
  | "broken"; // missed more than freezes can cover

export interface StreakInfo {
  streak: number;
  status: StreakStatus;
  freezes: number;
  /** Freezes that would be spent if they write right now. */
  freezesNeeded: number;
}

/**
 * Non-mutating view of where the streak stands *as of `today`*, accounting for
 * elapsed time and available freezes. Used for display so a stale number never
 * misleads the learner.
 */
export function streakInfo(profile: Profile, today: DayKey): StreakInfo {
  const { lastWriteDay, streak, freezes } = profile;
  if (lastWriteDay === null) {
    return { streak: 0, status: "none", freezes, freezesNeeded: 0 };
  }
  const gap = daysBetween(lastWriteDay, today);
  if (gap <= 0) {
    return { streak, status: "today", freezes, freezesNeeded: 0 };
  }
  const missed = gap - 1;
  if (missed === 0) {
    return { streak, status: "safe", freezes, freezesNeeded: 0 };
  }
  if (missed <= freezes) {
    return { streak, status: "at-risk", freezes, freezesNeeded: missed };
  }
  return { streak: 0, status: "broken", freezes, freezesNeeded: 0 };
}

/**
 * Commit a completed writing session for `today`, returning the updated streak
 * fields. Caller folds these into the profile alongside word/time totals.
 */
export function applyWrite(
  profile: Profile,
  today: DayKey,
): Pick<Profile, "streak" | "longestStreak" | "freezes" | "lastWriteDay"> {
  let { streak, freezes, longestStreak } = profile;
  const { lastWriteDay } = profile;

  if (lastWriteDay === today) {
    // Already counted today — writing again is great, but the streak holds.
    return { streak, longestStreak, freezes, lastWriteDay };
  }

  if (lastWriteDay === null) {
    streak = 1;
  } else {
    const missed = daysBetween(lastWriteDay, today) - 1;
    if (missed <= 0) {
      streak += 1; // consecutive day
    } else if (missed <= freezes) {
      freezes -= missed; // forgiven
      streak += 1;
    } else {
      streak = 1; // streak broke; start fresh today
    }
  }

  if (streak > 0 && streak % FREEZE_MILESTONE === 0) {
    freezes = Math.min(freezes + 1, MAX_FREEZES);
  }
  longestStreak = Math.max(longestStreak, streak);

  return { streak, longestStreak, freezes, lastWriteDay: today };
}
