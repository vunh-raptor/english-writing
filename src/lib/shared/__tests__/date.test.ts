import { describe, expect, it } from "vitest";
import { addDays, dayKeyFromDate, daysBetween, parseDayKey } from "../date";

describe("dayKeyFromDate", () => {
  it("formats as YYYY-MM-DD with zero padding", () => {
    expect(dayKeyFromDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dayKeyFromDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("round-trips through parseDayKey", () => {
    expect(dayKeyFromDate(parseDayKey("2026-07-04"))).toBe("2026-07-04");
  });
});

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween("2026-01-01", "2026-01-05")).toBe(4);
  });

  it("is zero for the same day and negative going backwards", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
    expect(daysBetween("2026-01-05", "2026-01-01")).toBe(-4);
  });

  it("crosses month and year boundaries", () => {
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
  });

  it("survives a DST transition (day math must stay in local days)", () => {
    // A streak must not silently break because a 23-hour day rounded down.
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });
});

describe("addDays", () => {
  it("moves forward across a month boundary", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });

  it("moves backward and handles zero", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-06-15", 0)).toBe("2026-06-15");
  });
});
