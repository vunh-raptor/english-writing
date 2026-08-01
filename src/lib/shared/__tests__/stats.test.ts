import { describe, expect, it } from "vitest";
import type { Vocab } from "@/types";
import {
  countChars,
  countSentences,
  countWords,
  mergeVocab,
  newWordCount,
  newWordsThisWeek,
  tokenize,
  vocabSize,
} from "../stats";

const TODAY = "2026-06-10";

describe("countWords", () => {
  it("counts words, not punctuation", () => {
    expect(countWords("Hello, world!")).toBe(2);
  });

  it("keeps contractions and hyphenated words whole", () => {
    expect(countWords("don't")).toBe(1);
    expect(countWords("a well-known writer")).toBe(3);
  });

  it("ignores bare numbers (a learner's output is words)", () => {
    expect(countWords("I have 3 cats")).toBe(3);
  });

  it("is zero for empty or whitespace-only text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n  ")).toBe(0);
  });
});

describe("countChars", () => {
  it("measures trimmed length", () => {
    expect(countChars("  hi  ")).toBe(2);
    expect(countChars("   ")).toBe(0);
  });
});

describe("countSentences", () => {
  it("splits on terminal punctuation", () => {
    expect(countSentences("One. Two! Three?")).toBe(3);
  });

  it("counts unpunctuated writing as one sentence, never zero", () => {
    // Learners mid-flow often write without punctuation — avgSentenceLength
    // must not divide by zero because of it.
    expect(countSentences("i just kept writing and never stopped")).toBe(1);
  });

  it("is zero only for empty text", () => {
    expect(countSentences("   ")).toBe(0);
  });
});

describe("tokenize", () => {
  it("lowercases so vocabulary is case-insensitive", () => {
    expect(tokenize("The the THE")).toEqual(["the", "the", "the"]);
  });
});

describe("newWordCount", () => {
  it("counts distinct unseen words once each", () => {
    const vocab: Vocab = { hello: { firstSeen: "2026-06-01", count: 3 } };
    expect(newWordCount(["hello", "brave", "brave", "world"], vocab)).toBe(2);
  });
});

describe("mergeVocab", () => {
  it("adds new words with today's first-seen day", () => {
    expect(mergeVocab({}, ["hello"], TODAY)).toEqual({
      hello: { firstSeen: TODAY, count: 1 },
    });
  });

  it("increments counts but preserves the original first-seen day", () => {
    const vocab: Vocab = { hello: { firstSeen: "2026-01-01", count: 2 } };
    expect(mergeVocab(vocab, ["hello", "hello"], TODAY).hello).toEqual({
      firstSeen: "2026-01-01",
      count: 4,
    });
  });

  it("returns a new object without mutating the input", () => {
    const vocab: Vocab = { hello: { firstSeen: "2026-01-01", count: 2 } };
    const next = mergeVocab(vocab, ["hello", "world"], TODAY);
    expect(vocab).toEqual({ hello: { firstSeen: "2026-01-01", count: 2 } });
    expect(next).not.toBe(vocab);
  });
});

describe("newWordsThisWeek", () => {
  it("counts words first seen in the last 7 days, inclusive of today", () => {
    const vocab: Vocab = {
      today: { firstSeen: TODAY, count: 1 },
      sixDaysAgo: { firstSeen: "2026-06-04", count: 1 },
      sevenDaysAgo: { firstSeen: "2026-06-03", count: 1 },
      lastYear: { firstSeen: "2025-06-10", count: 1 },
    };
    expect(newWordsThisWeek(vocab, TODAY)).toBe(2);
  });
});

describe("vocabSize", () => {
  it("counts distinct words", () => {
    expect(vocabSize({})).toBe(0);
    expect(vocabSize({ a: { firstSeen: TODAY, count: 9 } })).toBe(1);
  });
});
