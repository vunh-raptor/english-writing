import type { DayKey } from "@/types";

/**
 * All day math is done in the learner's *local* time so day boundaries match
 * what they actually experience. Keys are `YYYY-MM-DD`.
 */

export function dayKeyFromDate(d: Date): DayKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): DayKey {
  return dayKeyFromDate(new Date());
}

export function parseDayKey(key: DayKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Whole days from `a` to `b` (b minus a). Negative if b precedes a. */
export function daysBetween(a: DayKey, b: DayKey): number {
  const ms = parseDayKey(b).getTime() - parseDayKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function addDays(key: DayKey, n: number): DayKey {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + n);
  return dayKeyFromDate(d);
}

/** e.g. "Sat, Jun 27" */
export function prettyDay(key: DayKey): string {
  return parseDayKey(key).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** A warm time-of-day greeting. */
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
