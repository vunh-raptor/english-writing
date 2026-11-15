import { describe, expect, it } from "vitest";
import type { ArenaStation, Phrase, SrsRecord } from "@/types";
import {
  CLOCK_SECONDS,
  NATIVE_LADDER,
  REMATCH_GAP,
  clockBeaten,
  comboPair,
  hasPartnerChunk,
  itemOutcome,
  ladderFor,
  marksFromLedger,
  nativeProgress,
  pickBoutItems,
  planBout,
  planStations,
  stationFromMode,
  stationMode,
  stationOutcome,
  withRematch,
} from "../arena";
import { talkApply, talkStart } from "../words";
import { itemMatcher } from "../phrases";

const TODAY = "2026-06-10";

describe("nativeProgress", () => {
  it("an item with no marks is nowhere near Native", () => {
    const p = nativeProgress(undefined, true);
    expect(p.native).toBe(false);
    expect(p.earned).toEqual([]);
    expect(p.needed).toEqual(NATIVE_LADDER);
  });

  it("one station short is not Native", () => {
    const p = nativeProgress(NATIVE_LADDER.filter((s) => s !== "register"), true);
    expect(p.native).toBe(false);
    expect(p.needed).toEqual(["register"]);
  });

  it("every station on the ladder is Native", () => {
    expect(nativeProgress(NATIVE_LADDER, true).native).toBe(true);
  });

  it("an item with nothing to gap is not asked for a partner it can't have", () => {
    const withoutPartner = NATIVE_LADDER.filter((s) => s !== "partner");
    expect(ladderFor(false)).toEqual(withoutPartner);
    expect(nativeProgress(withoutPartner, false).native).toBe(true);
    // ...but the same marks fall short for an item that does have one.
    expect(nativeProgress(withoutPartner, true).native).toBe(false);
  });
});

describe("planStations", () => {
  it("starts a fresh item at the bottom of the ladder and ends on the clock", () => {
    expect(planStations([], true)).toEqual(["recall", "partner", "clock"]);
  });

  it("takes the next unearned stations, in ladder order", () => {
    expect(planStations(["recall", "partner"], true)).toEqual(["shift", "register", "clock"]);
    expect(planStations(["recall", "shift"], false)).toEqual(["register", "native", "clock"]);
  });

  it("never sets the clock first or alone", () => {
    for (const marks of [[], ["recall"], NATIVE_LADDER] as ArenaStation[][]) {
      const plan = planStations(marks, true);
      expect(plan[0]).not.toBe("clock");
      expect(plan.indexOf("clock")).toBe(plan.length - 1);
    }
    // One station only: there is no untimed one for the clock to follow.
    expect(planStations([], true, 1)).toEqual(["recall"]);
  });

  it("brings the hardest earned stations back once everything is earned", () => {
    expect(planStations(NATIVE_LADDER, true)).toEqual(["register", "native", "clock"]);
  });
});

describe("planBout", () => {
  const items = [
    { id: "a", marks: [] as ArenaStation[], hasPartner: true },
    { id: "b", marks: ["recall", "partner"] as ArenaStation[], hasPartner: true },
  ];

  it("interleaves items, so no item is worked twice in a row", () => {
    const plan = planBout(items, 0);
    expect(plan.map((p) => p.itemId)).toEqual(["a", "b", "a", "b", "a", "b"]);
    for (let i = 1; i < plan.length; i++) expect(plan[i].itemId).not.toBe(plan[i - 1].itemId);
  });

  it("assigns a shape to shift stations and a listener to register stations", () => {
    const plan = planBout(items, 3);
    const shift = plan.find((p) => p.station === "shift")!;
    const reg = plan.find((p) => p.station === "register")!;
    expect(shift.shift).toBeTruthy();
    expect(reg.register).toBeTruthy();
    expect(plan.filter((p) => p.station === "recall").every((p) => !p.shift && !p.register)).toBe(true);
  });

  it("an empty bout plans nothing", () => {
    expect(planBout([], 0)).toEqual([]);
  });
});

describe("comboPair", () => {
  it("joins the two items furthest from Native, in bout order", () => {
    const pair = comboPair([
      { id: "a", marks: ["recall", "partner", "shift"] as ArenaStation[] },
      { id: "b", marks: [] as ArenaStation[] },
      { id: "c", marks: ["recall"] as ArenaStation[] },
    ]);
    expect(pair?.map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("has no combo with fewer than two items", () => {
    expect(comboPair([])).toBeNull();
    expect(comboPair([{ id: "a" }])).toBeNull();
  });
});

describe("withRematch", () => {
  const t = (itemId: string, station = "recall", rematch?: boolean) => ({ itemId, station, rematch });
  const turns = [t("a"), t("b"), t("c"), t("a", "shift"), t("b", "shift"), t("a+b", "combo")];
  const spare = t("a");

  it("brings a slipped item back a few turns later, not straight away", () => {
    const out = withRematch(turns, 0, spare);
    expect(out).toHaveLength(turns.length + 1);
    const at = out.findIndex((x) => x.rematch);
    expect(at).toBe(1 + REMATCH_GAP);
    expect(out[at].itemId).toBe("a");
    expect(out[at - 1].itemId).not.toBe("a");
  });

  it("never lands after the combo that closes the bout", () => {
    const out = withRematch(turns, 4, t("b"));
    const at = out.findIndex((x) => x.rematch);
    expect(at).toBeLessThan(out.findIndex((x) => x.station === "combo"));
  });

  it("gives each item one second try per bout, not two", () => {
    const once = withRematch(turns, 0, spare);
    const slipAgain = once.findIndex((x) => x.rematch);
    expect(withRematch(once, slipAgain, spare)).toBe(once);
  });

  it("adds nothing without a scene, or for the combo", () => {
    expect(withRematch(turns, 0, null)).toBe(turns);
    expect(withRematch(turns, 5, t("a+b", "combo"))).toBe(turns);
  });
});

describe("the clock", () => {
  const start = 1_000_000;
  it("is beaten inside the time, with a little grace for the round trip", () => {
    expect(clockBeaten(start, start + CLOCK_SECONDS * 1000)).toBe(true);
    expect(clockBeaten(start, start + CLOCK_SECONDS * 1000 + 2000)).toBe(true);
  });

  it("is not beaten when late, or never started", () => {
    expect(clockBeaten(start, start + (CLOCK_SECONDS + 30) * 1000)).toBe(false);
    expect(clockBeaten(null, start)).toBe(false);
  });

  it("a right sentence that came in late is help, not a mark", () => {
    const talk = talkApply(talkStart(1), { type: "turn", verdict: "landed", sentence: "x y z" });
    expect(stationOutcome({ station: "clock", talk, clockBeaten: false })).toBe("helped");
    expect(stationOutcome({ station: "clock", talk, clockBeaten: true })).toBe("clean");
    expect(stationOutcome({ station: "recall", talk })).toBe("clean");
  });
});

describe("itemOutcome", () => {
  it("is clean only when every station was", () => {
    expect(itemOutcome(["clean", "clean", "clean"])).toBe("clean");
    expect(itemOutcome(["clean", "helped", "clean"])).toBe("helped");
  });

  it("one slip in a hard bout is not forgetting", () => {
    expect(itemOutcome(["missed", "clean", "clean"])).toBe("helped");
    expect(itemOutcome(["missed", "clean"])).toBe("helped");
  });

  it("lapses when it slipped at more stations than it landed", () => {
    expect(itemOutcome(["missed", "missed", "clean"])).toBe("missed");
  });

  it("an item with nothing finished neither earns nor lapses", () => {
    expect(itemOutcome([])).toBe("helped");
  });
});

describe("the ledger is the record", () => {
  it("round-trips a station through its ledger mode", () => {
    for (const s of NATIVE_LADDER) expect(stationFromMode(stationMode(s))).toBe(s);
    expect(stationFromMode(stationMode("combo"))).toBeNull();
  });

  it("does not count the old Phrasebook modes, which never held a sentence", () => {
    expect(stationFromMode("recall")).toBeNull();
    expect(stationFromMode(null)).toBeNull();
  });

  it("counts only clean arena rows, once each, in ladder order", () => {
    const marks = marksFromLedger([
      { itemSlug: "a", mode: "arena-shift", verdict: "clean" },
      { itemSlug: "a", mode: "arena-recall", verdict: "clean" },
      { itemSlug: "a", mode: "arena-recall", verdict: "clean" },
      { itemSlug: "a", mode: "arena-clock", verdict: "helped" },
      { itemSlug: "b", mode: "recall", verdict: "clean" },
      { itemSlug: null, mode: "arena-recall", verdict: "clean" },
    ]);
    expect(marks).toEqual({ a: ["recall", "shift"] });
  });

  it("an empty ledger has no marks", () => {
    expect(marksFromLedger([])).toEqual({});
  });
});

describe("pickBoutItems", () => {
  const phrase = (id: string, collocations?: string[]): Phrase => ({
    id,
    text: id,
    meaning: "",
    example: "",
    collocations,
  });
  const later = (box: number): SrsRecord => ({ box, due: "2026-07-01", reps: 1, last: TODAY });
  const dueNow: SrsRecord = { box: 1, due: TODAY, reps: 1, last: "2026-06-08" };

  it("takes new items, then due ones, then the furthest from Native", () => {
    const pool = [phrase("native"), phrase("far"), phrase("due"), phrase("new"), phrase("near")];
    const srs = { native: later(4), far: later(1), due: dueNow, near: later(2) };
    const marks = {
      native: NATIVE_LADDER.filter((s) => s !== "partner"),
      far: [] as ArenaStation[],
      near: ["recall", "shift", "register"] as ArenaStation[],
    };
    expect(pickBoutItems(pool, srs, marks, 4, TODAY).map((p) => p.id)).toEqual([
      "new",
      "due",
      "far",
      "near",
    ]);
  });

  it("an empty book makes an empty bout", () => {
    expect(pickBoutItems([], {}, {}, 4, TODAY)).toEqual([]);
  });

  it("knows which items have a partner chunk to gap", () => {
    expect(hasPartnerChunk(["make a decision"], "decision")).toBe(true);
    expect(hasPartnerChunk(["decision maker"], "decision")).toBe(false);
    expect(hasPartnerChunk(undefined, "decision")).toBe(false);
  });
});

describe("itemMatcher", () => {
  it("finds a single word in any normal form", () => {
    expect(itemMatcher("arrange").test("I'm arranging a meeting")).toBe(true);
    expect(itemMatcher("arrange", "word").test("we arranged it")).toBe(true);
    expect(itemMatcher("arrange").test("a range of options")).toBe(false);
  });

  it("finds a phrase through its gaps", () => {
    expect(itemMatcher("it's worth ___").test("its worth trying, honestly")).toBe(true);
    expect(itemMatcher("make a decision", "collocation").test("we made the call")).toBe(false);
  });
});
