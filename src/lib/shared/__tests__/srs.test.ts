import { describe, expect, it } from "vitest";
import type { SrsRecord } from "@/types";
import { SRS_INTERVALS, isDue, phraseState, reviewCard, srsSummary } from "../srs";

const TODAY = "2026-06-10";
const MAX_BOX = SRS_INTERVALS.length - 1;

describe("reviewCard", () => {
  it("promotes a brand-new phrase into box 1", () => {
    expect(reviewCard(undefined, true, TODAY)).toEqual({
      box: 1,
      due: "2026-06-11",
      reps: 1,
      last: TODAY,
    });
  });

  it("schedules each box at its interval", () => {
    const rec = reviewCard({ box: 2, due: TODAY, reps: 2, last: TODAY }, true, TODAY);
    expect(rec.box).toBe(3);
    expect(rec.due).toBe("2026-06-17"); // +7 days
  });

  it("caps promotion at the last box", () => {
    const rec = reviewCard({ box: MAX_BOX, due: TODAY, reps: 9, last: TODAY }, true, TODAY);
    expect(rec.box).toBe(MAX_BOX);
  });

  it("resets to box 0 and re-queues today on a lapse", () => {
    const rec = reviewCard({ box: 4, due: TODAY, reps: 4, last: TODAY }, false, TODAY);
    expect(rec).toMatchObject({ box: 0, due: TODAY, reps: 4 });
  });

  it("only counts reps on success", () => {
    expect(reviewCard(undefined, false, TODAY).reps).toBe(0);
  });
});

describe("isDue", () => {
  it("treats a phrase with no record as due", () => {
    expect(isDue(undefined, TODAY)).toBe(true);
  });

  it("is due on and after the due date, not before", () => {
    const rec = (due: string): SrsRecord => ({ box: 1, due, reps: 1, last: TODAY });
    expect(isDue(rec("2026-06-11"), TODAY)).toBe(false);
    expect(isDue(rec(TODAY), TODAY)).toBe(true);
    expect(isDue(rec("2026-06-01"), TODAY)).toBe(true);
  });
});

describe("phraseState", () => {
  it("maps box position to a learner-facing state", () => {
    expect(phraseState(undefined)).toBe("new");
    expect(phraseState({ box: 0, due: TODAY, reps: 0, last: TODAY })).toBe("learning");
    expect(phraseState({ box: 3, due: TODAY, reps: 3, last: TODAY })).toBe("learning");
    expect(phraseState({ box: 4, due: TODAY, reps: 4, last: TODAY })).toBe("mastered");
  });
});

describe("srsSummary", () => {
  it("counts states and today's queue across a phrase set", () => {
    const srs: Record<string, SrsRecord> = {
      b: { box: 1, due: "2026-06-20", reps: 1, last: TODAY }, // learning, not due
      c: { box: 5, due: "2026-06-01", reps: 8, last: TODAY }, // mastered, overdue
    };
    expect(srsSummary(["a", "b", "c"], srs, TODAY)).toEqual({
      new: 1,
      learning: 1,
      mastered: 1,
      dueToday: 2,
    });
  });

  it("returns zeros for an empty library", () => {
    expect(srsSummary([], {}, TODAY)).toEqual({
      new: 0,
      learning: 0,
      mastered: 0,
      dueToday: 0,
    });
  });
});
