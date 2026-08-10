import { describe, expect, it } from "vitest";
import type { Phrase, SrsRecord, WordSeed } from "@/types";
import {
  buildDaySet,
  gapPartner,
  gapSentence,
  judgeBridge,
  judgeFit,
  judgeRepair,
  maskCollocation,
  pickDailyWords,
  pickDrill,
  recallMatches,
  usesWord,
  wordToPhrase,
} from "../words";

const TODAY = "2026-06-10";
const YESTERDAY = "2026-06-09";

function seed(over: Partial<WordSeed> = {}): WordSeed {
  return {
    id: "w-test",
    word: "decide",
    pos: "verb",
    band: "B1",
    meaning: "choose what you are going to do",
    example: "We decided to stay home instead.",
    collocations: ["decide to", "hard to decide"],
    field: "choice",
    ...over,
  };
}

/**
 * A stand-in curriculum.
 *
 * The bundled `WORD_SEEDS` array these tests used to run against is gone — the
 * curriculum is generated per learner now — so the fixture below plays its
 * part: distinct semantic fields, a spread of bands, in queue order. That is a
 * better test subject anyway, because it exercises the rules against a
 * catalogue whose shape the test controls.
 */
const CATALOG: WordSeed[] = [
  seed({ id: "w-decide", word: "decide", band: "A2", field: "choice" }),
  seed({ id: "w-borrow", word: "borrow", band: "A2", field: "money" }),
  seed({ id: "w-tired", word: "tired", band: "A2", field: "energy", pos: "adjective" }),
  seed({ id: "w-afford", word: "afford", band: "B1", field: "money" }),
  seed({ id: "w-avoid", word: "avoid", band: "B1", field: "risk" }),
  seed({ id: "w-suggest", word: "suggest", band: "B1", field: "telling" }),
  seed({ id: "w-realize", word: "realize", band: "B1", field: "understanding" }),
  seed({ id: "w-scrutiny", word: "scrutiny", band: "C1", field: "attention", pos: "noun" }),
  seed({ id: "w-deliberate", word: "deliberate", band: "C1", field: "intention", pos: "adjective" }),
];

function poolItem(id: string): Phrase {
  const s = CATALOG.find((w) => w.id === id)!;
  return wordToPhrase(s, YESTERDAY);
}

describe("pickDailyWords", () => {
  it("never repeats a semantic field within one set (interference)", () => {
    const picked = pickDailyWords({ catalog: CATALOG, level: "B1", count: 5, met: new Set() });
    const fields = picked.map((w) => w.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("never re-issues a word already met", () => {
    const first = pickDailyWords({ catalog: CATALOG, level: "B1", count: 3, met: new Set() });
    const met = new Set(first.map((w) => w.id));
    const second = pickDailyWords({ catalog: CATALOG, level: "B1", count: 3, met });
    expect(second.some((w) => met.has(w.id))).toBe(false);
  });

  it("draws from the learner's own band first", () => {
    const picked = pickDailyWords({ catalog: CATALOG, level: "C1", count: 2, met: new Set() });
    expect(picked.every((w) => w.band === "C1")).toBe(true);
  });

  it("is deterministic — the same inputs give the same set", () => {
    const a = pickDailyWords({ catalog: CATALOG, level: "A2", count: 3, met: new Set() });
    const b = pickDailyWords({ catalog: CATALOG, level: "A2", count: 3, met: new Set() });
    expect(a.map((w) => w.id)).toEqual(b.map((w) => w.id));
  });

  it("returns nothing at all from an empty catalogue", () => {
    expect(pickDailyWords({ catalog: [], level: "B1", count: 5, met: new Set() })).toEqual([]);
  });

  it("returns what it can rather than nothing once the queue runs out", () => {
    const met = new Set(CATALOG.slice(0, CATALOG.length - 2).map((w) => w.id));
    expect(pickDailyWords({ catalog: CATALOG, level: "B1", count: 5, met })).toHaveLength(2);
  });

  it("relaxes the field rule only when it cannot otherwise fill the set", () => {
    // Only the two "money" words are left: a short set would be worse than two
    // related words, so the interference rule yields last.
    const money = CATALOG.filter((w) => w.field === "money");
    expect(money).toHaveLength(2);
    const met = new Set(CATALOG.filter((w) => !money.includes(w)).map((w) => w.id));
    const picked = pickDailyWords({ catalog: CATALOG, level: "B1", count: 2, met });
    expect(picked).toHaveLength(2);
  });
});

describe("usesWord — production detection", () => {
  it("accepts normal inflections", () => {
    expect(usesWord("decide", "Yesterday I decided to walk.")).toBe(true);
    expect(usesWord("worry", "She worries about it constantly.")).toBe(true);
    expect(usesWord("rely", "He relies on that bus.")).toBe(true);
    expect(usesWord("stop", "They stopped asking.")).toBe(true);
  });

  it("does not fire on a different word that merely starts the same", () => {
    // "afford" inside "affordable" is a different word; counting it would hand
    // out an interval the learner never earned.
    expect(usesWord("afford", "The rent is affordable now.")).toBe(false);
    expect(usesWord("man", "I read the manual twice.")).toBe(false);
  });

  it("is false when the word simply is not there", () => {
    expect(usesWord("decide", "I went home early and slept.")).toBe(false);
  });
});

describe("recallMatches — typing the word from its meaning", () => {
  it("accepts the word and any normal ending", () => {
    expect(recallMatches("decide", "decide")).toBe(true);
    expect(recallMatches("decide", "  Decided ")).toBe(true);
    expect(recallMatches("afford", "affords")).toBe(true);
  });

  it("rejects empty and unrelated answers", () => {
    expect(recallMatches("decide", "")).toBe(false);
    expect(recallMatches("decide", "   ")).toBe(false);
    expect(recallMatches("decide", "zzz")).toBe(false);
  });

  it("rejects a longer word that merely contains it", () => {
    expect(recallMatches("decide", "decidedly undecided")).toBe(false);
  });
});

describe("gapSentence", () => {
  it("cuts the gap and reports the surface form the sentence needs", () => {
    expect(gapSentence("We decided to stay home.", "decide")).toEqual({
      gapped: "We ___ to stay home.",
      answer: "decided",
    });
  });

  it("returns null when the word is not in the sentence — no empty rounds", () => {
    expect(gapSentence("We stayed home.", "decide")).toBeNull();
    expect(gapSentence("", "decide")).toBeNull();
    expect(gapSentence("We decided.", "")).toBeNull();
  });

  it("gaps only the first occurrence, so one blank has one answer", () => {
    const r = gapSentence("I decide, then I decide again.", "decide")!;
    expect(r.gapped).toBe("I ___, then I decide again.");
  });
});

describe("gapPartner — the collocate, not the word", () => {
  it("gaps the partner and answers with it", () => {
    expect(gapPartner(["make a decision", "tough decision"], "decision")).toEqual({
      gapped: "___ a decision",
      answer: "make",
    });
  });

  it("skips chunks that lead with the word itself — those make a weak round", () => {
    expect(gapPartner(["decide to", "hard to decide"], "decide")).toEqual({
      gapped: "___ to decide",
      answer: "hard",
    });
  });

  it("returns null when every chunk leads with the word", () => {
    expect(gapPartner(["borrow money", "borrow it from someone"], "borrow")).toBeNull();
  });

  it("returns null with no chunks, or only single-word ones", () => {
    expect(gapPartner([], "decide")).toBeNull();
    expect(gapPartner(["decide"], "decide")).toBeNull();
  });
});

describe("judgeFit — the gap-fill verdict", () => {
  it("calls the exact surface form exact", () => {
    expect(judgeFit("worry", "worried", "worried")).toBe("exact");
    expect(judgeFit("worry", "worried", "  Worried! ")).toBe("exact");
  });

  it("calls the right word in the wrong ending `form`, not a miss", () => {
    // Measured against the HEADWORD: "worried" cannot inflect back to its own
    // lemma, so judging against the surface form would score this wrong.
    expect(judgeFit("worry", "worried", "worry")).toBe("form");
    expect(judgeFit("decide", "decided", "deciding")).toBe("form");
  });

  it("calls anything else wrong", () => {
    expect(judgeFit("worry", "worried", "zzz")).toBe("wrong");
    expect(judgeFit("worry", "worried", "")).toBe("wrong");
  });
});

describe("judgeRepair", () => {
  const repair = {
    wrong: "I did a decision about the flat yesterday.",
    right: "I made a decision about the flat yesterday.",
  };

  it("accepts a fix that contains what the correction added", () => {
    expect(judgeRepair(repair, "decision", "I made a decision about the flat yesterday.")).toBe(true);
  });

  it("rejects a rewrite that misses the actual fix", () => {
    expect(judgeRepair(repair, "decision", "I did a decision about the flat last week.")).toBe(false);
  });

  it("rejects an answer that drops the word entirely", () => {
    expect(judgeRepair(repair, "decision", "I made my mind up yesterday.")).toBe(false);
  });
});

describe("pickDrill — the ladder, and how it degrades", () => {
  const full = {
    word: "decision",
    myLine: "The hardest decision I made last year was leaving that team.",
    cloze: "It was a tough decision to make.",
    repair: { wrong: "I did a decision.", right: "I made a decision." },
    collocations: ["make a decision", "tough decision"],
  };

  it("climbs with the box when every rung has material", () => {
    expect(pickDrill(0, { ...full, myLine: undefined })).toBe("recall");
    expect(pickDrill(1, { ...full, myLine: undefined })).toBe("fit");
    expect(pickDrill(2, { ...full, myLine: undefined })).toBe("partner");
    expect(pickDrill(3, { ...full, myLine: undefined })).toBe("repair");
  });

  it("lets the learner's own sentence outrank generated rungs from box 2", () => {
    expect(pickDrill(2, full)).toBe("echo");
    expect(pickDrill(4, full)).toBe("echo");
    // ...but not before the form-meaning link is established.
    expect(pickDrill(0, full)).toBe("recall");
  });

  it("walks down when the ideal rung has no material (no AI key)", () => {
    const offline = { ...full, repair: undefined, myLine: undefined };
    expect(pickDrill(3, offline)).toBe("partner");
  });

  it("walks down again when no partner chunk makes a usable gap", () => {
    // Every "borrow" chunk leads with the word, so `partner` is unavailable
    // even though collocations exist — the check has to run the real function.
    expect(
      pickDrill(3, {
        word: "borrow",
        cloze: "Can I borrow your charger?",
        collocations: ["borrow money", "borrow it from someone"],
      }),
    ).toBe("fit");
  });

  it("always lands on recall when there is nothing else at all", () => {
    expect(pickDrill(4, { word: "decide", collocations: [] })).toBe("recall");
  });
});

describe("buildDaySet", () => {
  const base = {
    catalog: CATALOG,
    pool: [] as Phrase[],
    srs: {} as Record<string, SrsRecord>,
    level: "B1" as const,
    perDay: 3,
    today: TODAY,
  };

  it("offers a full set of new words on a fresh install", () => {
    const day = buildDaySet({ ...base, wordDays: {} });
    expect(day.todaysNew).toHaveLength(3);
    expect(day.remainingNew).toHaveLength(3);
    expect(day.reviews).toHaveLength(0);
    expect(day.remaining).toBe(3);
    expect(day.done).toBe(0);
  });

  it("has nothing to offer before the curriculum has been generated", () => {
    const day = buildDaySet({ ...base, catalog: [], wordDays: {} });
    expect(day.todaysNew).toEqual([]);
    expect(day.remaining).toBe(0);
  });

  it("keeps a day's issued set fixed once drawn", () => {
    const issued = ["w-afford", "w-avoid", "w-suggest"];
    const day = buildDaySet({ ...base, wordDays: { [TODAY]: issued } });
    expect(day.todaysNew.map((w) => w.id)).toEqual(issued);
  });

  it("counts a word as done once it is in the pool, and resumes the rest", () => {
    const issued = ["w-afford", "w-avoid", "w-suggest"];
    const day = buildDaySet({
      ...base,
      wordDays: { [TODAY]: issued },
      pool: [poolItem("w-afford")],
      srs: { "w-afford": { box: 1, due: "2026-06-11", reps: 1, last: TODAY } },
    });
    expect(day.done).toBe(1);
    expect(day.remainingNew.map((w) => w.id)).toEqual(["w-avoid", "w-suggest"]);
  });

  it("adds due reviews on top of what is left to meet", () => {
    const day = buildDaySet({
      ...base,
      wordDays: {},
      pool: [poolItem("w-decide")],
      srs: { "w-decide": { box: 1, due: YESTERDAY, reps: 1, last: YESTERDAY } },
    });
    expect(day.reviews.map((p) => p.id)).toEqual(["w-decide"]);
    expect(day.remaining).toBe(day.remainingNew.length + 1);
  });

  it("ignores a due pool item that is not one of their curriculum words", () => {
    // Captured highlights and mission targets are the Phrasebook's business.
    const day = buildDaySet({
      ...base,
      wordDays: {},
      pool: [{ id: "p-worth-it", text: "it's worth it", meaning: "", example: "", kind: "phrase" }],
      srs: { "p-worth-it": { box: 1, due: YESTERDAY, reps: 1, last: YESTERDAY } },
    });
    expect(day.reviews).toHaveLength(0);
  });

  it("leaves a word that is not due out of the day", () => {
    const day = buildDaySet({
      ...base,
      wordDays: {},
      pool: [poolItem("w-decide")],
      srs: { "w-decide": { box: 2, due: "2026-07-01", reps: 2, last: TODAY } },
    });
    expect(day.reviews).toHaveLength(0);
  });

  it("reports nothing left when the set is met and nothing is due", () => {
    const issued = ["w-afford"];
    const day = buildDaySet({
      ...base,
      perDay: 1,
      wordDays: { [TODAY]: issued },
      pool: [poolItem("w-afford")],
      srs: { "w-afford": { box: 1, due: "2026-06-11", reps: 1, last: TODAY } },
    });
    expect(day.remaining).toBe(0);
  });
});

describe("wordToPhrase", () => {
  it("carries the word into the shared pool as a word-kind item", () => {
    const p = wordToPhrase(seed(), TODAY);
    expect(p).toMatchObject({
      id: "w-test",
      text: "decide",
      kind: "word",
      captured: { module: "Daily words", day: TODAY },
    });
    // The part of speech is NOT smuggled through `register` — the Phrasebook
    // renders that field as a register chip ("casual", "at work").
    expect(p.register).toBeUndefined();
  });
});

describe("maskCollocation", () => {
  it("hides the word so the cue helps without answering", () => {
    expect(maskCollocation("can't afford to", "afford")).toBe("can't ___ to");
  });
});

describe("judgeBridge", () => {
  it("needs both words in one real sentence", () => {
    expect(judgeBridge("avoid", "suggest", "I avoid meetings so I suggest we write it down.")).toBe(true);
  });

  it("rejects a sentence carrying only one of them", () => {
    expect(judgeBridge("avoid", "suggest", "I avoid meetings whenever I can honestly.")).toBe(false);
  });

  it("rejects two words bolted together with no sentence around them", () => {
    expect(judgeBridge("avoid", "suggest", "avoid suggest")).toBe(false);
  });
});
