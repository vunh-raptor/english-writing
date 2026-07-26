import { describe, expect, it } from "vitest";
import type { Profile } from "@/types";
import { MAX_FREEZES, applyWrite, streakInfo } from "../streak";

function profile(over: Partial<Profile> = {}): Profile {
  return {
    streak: 0,
    longestStreak: 0,
    lastWriteDay: null,
    freezes: 2,
    totalWords: 0,
    totalEntries: 0,
    totalMs: 0,
    ...over,
  };
}

const TODAY = "2026-06-10";

describe("streakInfo", () => {
  it("reports 'none' before the first session", () => {
    expect(streakInfo(profile(), TODAY)).toMatchObject({ streak: 0, status: "none" });
  });

  it("reports 'today' when they already wrote today", () => {
    const p = profile({ streak: 7, lastWriteDay: TODAY });
    expect(streakInfo(p, TODAY)).toMatchObject({ streak: 7, status: "today", freezesNeeded: 0 });
  });

  it("reports 'safe' the day after a session", () => {
    const p = profile({ streak: 7, lastWriteDay: "2026-06-09" });
    expect(streakInfo(p, TODAY)).toMatchObject({ status: "safe", freezesNeeded: 0 });
  });

  it("reports 'at-risk' when freezes can still cover the gap", () => {
    const p = profile({ streak: 7, lastWriteDay: "2026-06-08", freezes: 2 });
    expect(streakInfo(p, TODAY)).toMatchObject({
      streak: 7,
      status: "at-risk",
      freezesNeeded: 1,
    });
  });

  it("only breaks once the gap outruns the freezes", () => {
    const p = profile({ streak: 30, lastWriteDay: "2026-06-01", freezes: 2 });
    expect(streakInfo(p, TODAY)).toMatchObject({ streak: 0, status: "broken" });
  });

  it("does not mutate the profile it inspects", () => {
    const p = profile({ streak: 7, lastWriteDay: "2026-06-08", freezes: 2 });
    const snapshot = { ...p };
    streakInfo(p, TODAY);
    expect(p).toEqual(snapshot);
  });
});

describe("applyWrite", () => {
  it("starts the streak at 1 on the very first session", () => {
    expect(applyWrite(profile(), TODAY)).toMatchObject({ streak: 1, lastWriteDay: TODAY });
  });

  it("extends the streak on a consecutive day", () => {
    const p = profile({ streak: 3, longestStreak: 3, lastWriteDay: "2026-06-09" });
    expect(applyWrite(p, TODAY)).toMatchObject({ streak: 4, longestStreak: 4 });
  });

  it("holds steady when they write twice in one day", () => {
    const p = profile({ streak: 4, longestStreak: 9, freezes: 1, lastWriteDay: TODAY });
    expect(applyWrite(p, TODAY)).toEqual({
      streak: 4,
      longestStreak: 9,
      freezes: 1,
      lastWriteDay: TODAY,
    });
  });

  it("spends freezes to forgive missed days instead of resetting", () => {
    const p = profile({ streak: 6, longestStreak: 6, freezes: 2, lastWriteDay: "2026-06-08" });
    expect(applyWrite(p, TODAY)).toMatchObject({ streak: 7, freezes: 1 });
  });

  it("resets to 1 once the gap outruns the freezes", () => {
    const p = profile({ streak: 30, longestStreak: 30, freezes: 1, lastWriteDay: "2026-06-01" });
    expect(applyWrite(p, TODAY)).toMatchObject({ streak: 1, freezes: 1, longestStreak: 30 });
  });

  it("awards a freeze every fifth day of streak", () => {
    const p = profile({ streak: 4, longestStreak: 4, freezes: 0, lastWriteDay: "2026-06-09" });
    expect(applyWrite(p, TODAY)).toMatchObject({ streak: 5, freezes: 1 });
  });

  it("caps freezes at MAX_FREEZES", () => {
    const p = profile({
      streak: 9,
      longestStreak: 9,
      freezes: MAX_FREEZES,
      lastWriteDay: "2026-06-09",
    });
    expect(applyWrite(p, TODAY)).toMatchObject({ streak: 10, freezes: MAX_FREEZES });
  });

  it("never lowers longestStreak", () => {
    const p = profile({ streak: 2, longestStreak: 40, lastWriteDay: "2026-06-09" });
    expect(applyWrite(p, TODAY).longestStreak).toBe(40);
  });

  it("does not mutate the profile it is given", () => {
    const p = profile({ streak: 6, longestStreak: 6, freezes: 2, lastWriteDay: "2026-06-08" });
    const snapshot = { ...p };
    applyWrite(p, TODAY);
    expect(p).toEqual(snapshot);
  });
});
