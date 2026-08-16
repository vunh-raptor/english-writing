import { describe, expect, it } from "vitest";
import {
  CHUNK_SECONDS,
  PASS_LINE,
  cutIntoChunks,
  firstLetters,
  hardestWord,
  milestoneDue,
  normalizeWord,
  passageOf,
  passageRange,
  scoreDictation,
  stressWords,
} from "../transcribe";
import { clipDuration, cueProse } from "../clips";
import type { TranscribeCue } from "@/types";

/** The chunk the design was built around, and the attempt it was built around. */
const REFERENCE =
  "Coral reefs cover less than one percent of the ocean floor, yet they support a quarter of all marine species. When the water warms by a single degree, the algae that feed the coral are expelled, and the reef turns white.";

/** A generated passage stands in for the clips that used to be bundled. */
const PASSAGE = `${REFERENCE} A bleached reef is not a dead reef. It is a starving one. The coral animal is still there, still building, still holding its shape against the current. What has gone is the tenant. For most of the last ten thousand years, coral has run a quiet arrangement inside its own tissue.`;

const ATTEMPT =
  "Coral reefs cover less than one percent of the ocean floor, yet they support a quarter of all marine species. When the water warm by a single degree, the algy that feed the coral are expelled, and the reef turn white.";

describe("scoreDictation", () => {
  it("gives a perfect transcription 100%", () => {
    const score = scoreDictation(REFERENCE, REFERENCE);
    expect(score.accuracy).toBe(100);
    expect(score.passed).toBe(true);
    expect(score.missed).toEqual([]);
    expect(score.segments.every((s) => s.kind === "ok")).toBe(true);
  });

  it("scores the three-slip attempt at 93% and names all three", () => {
    const score = scoreDictation(REFERENCE, ATTEMPT);
    // 41 reference words, 3 wrong -> 38/41.
    expect(score.total).toBe(41);
    expect(score.accuracy).toBe(93);
    expect(score.passed).toBe(true);
    expect(score.missed).toEqual(["warms", "algae", "turns"]);
  });

  it("pairs each slip into one substitution rather than two marks", () => {
    const fixes = scoreDictation(REFERENCE, ATTEMPT).segments.filter((s) => s.kind === "fix");
    expect(fixes).toHaveLength(3);
    expect(fixes[0]).toMatchObject({ wrote: "warm", heard: "warms" });
    expect(fixes[1]).toMatchObject({ wrote: "algy", heard: "algae" });
    expect(fixes[2]).toMatchObject({ wrote: "turn", heard: "turns" });
  });

  it("hands back the sentence with its punctuation, not a list of tokens", () => {
    const rendered = scoreDictation(REFERENCE, ATTEMPT)
      .segments.map((s) => s.heard ?? s.wrote)
      .join(" ");
    expect(rendered).toContain("ocean floor, yet");
    expect(rendered).toContain("marine species.");
    expect(rendered.endsWith("white.")).toBe(true);
  });

  it("strips punctuation off the words it sends to the Phrasebook", () => {
    // "turns white." ends the sentence; the review card is for the word alone.
    expect(scoreDictation(REFERENCE, ATTEMPT).missed).toEqual(["warms", "algae", "turns"]);
  });

  it("returns zero for an empty attempt without dividing by zero", () => {
    const score = scoreDictation(REFERENCE, "");
    expect(score.accuracy).toBe(0);
    expect(score.passed).toBe(false);
    expect(score.segments.every((s) => s.kind === "miss")).toBe(true);
  });

  it("lists each missed word once, however often it was said", () => {
    const score = scoreDictation(REFERENCE, "");
    // "the" appears five times in the reference; it earns one review card.
    expect(score.missed.filter((w) => normalizeWord(w) === "the")).toHaveLength(1);
    const normalized = score.missed.map(normalizeWord);
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it("treats an empty reference as unscorable rather than a free pass", () => {
    const score = scoreDictation("", "anything at all");
    expect(score.total).toBe(0);
    expect(score.passed).toBe(false);
  });

  it("cannot be inflated by padding the attempt with words that were not said", () => {
    const padded = `${REFERENCE} ${"filler ".repeat(40)}`;
    const score = scoreDictation(REFERENCE, padded);
    // Every reference word matched, but the denominator grew with the padding.
    expect(score.accuracy).toBeLessThan(60);
    expect(score.passed).toBe(false);
    expect(score.segments.some((s) => s.kind === "extra")).toBe(true);
  });

  it("ignores case, punctuation and curly apostrophes", () => {
    const score = scoreDictation("It's the reef's own kitchen.", "its the reefs own kitchen");
    // "it's" -> "its" and "reef's" -> "reefs" are the same words, differently typed.
    expect(score.accuracy).toBe(60);
    expect(normalizeWord("It’s")).toBe(normalizeWord("it's"));
  });

  it("honours a caller's pass line, not just the default", () => {
    const score = scoreDictation(REFERENCE, ATTEMPT, 95);
    expect(score.accuracy).toBe(93);
    expect(score.passed).toBe(false);
    expect(PASS_LINE).toBe(90);
  });
});

describe("cutIntoChunks", () => {
  /** Cues of one second each, so duration is just the cue count. */
  function tick(lines: string[]): TranscribeCue[] {
    return lines.map((text, i) => ({ start: i, end: i + 1, text }));
  }

  it("returns nothing for an empty or blank transcript", () => {
    expect(cutIntoChunks([])).toEqual([]);
    expect(cutIntoChunks(tick(["  ", ""]))).toEqual([]);
  });

  it("cuts on the sentence boundary nearest the budget", () => {
    // A sentence ends at 12s; the budget is 15s. 12 >= 15 * 0.6, so the cut
    // takes the boundary rather than slicing the next sentence in half.
    const lines = Array.from({ length: 24 }, (_, i) => (i === 11 ? "end." : "word"));
    const chunks = cutIntoChunks(tick(lines), CHUNK_SECONDS);
    expect(chunks[0].end).toBe(12);
    expect(chunks[0].text.endsWith("end.")).toBe(true);
  });

  it("cuts on the clock when a sentence never ends", () => {
    const chunks = cutIntoChunks(tick(Array(40).fill("word")), CHUNK_SECONDS);
    expect(chunks[0].end).toBe(CHUNK_SECONDS);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("does not honour a boundary so early it makes a stub chunk", () => {
    // The only sentence end is at 2s — well under 15 * 0.6 — so it is ignored.
    const lines = Array.from({ length: 30 }, (_, i) => (i === 1 ? "no." : "word"));
    const chunks = cutIntoChunks(tick(lines), CHUNK_SECONDS);
    expect(chunks[0].end).toBe(CHUNK_SECONDS);
  });

  it("keeps the trailing remainder as a final chunk", () => {
    const chunks = cutIntoChunks(tick(Array(20).fill("word")), CHUNK_SECONDS);
    expect(chunks).toHaveLength(2);
    expect(chunks[1].end).toBe(20);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });

  it("covers every cue exactly once, in order", () => {
    const cues = cueProse(PASSAGE, 150);
    const chunks = cutIntoChunks(cues, CHUNK_SECONDS);
    const rebuilt = chunks.map((c) => c.text).join(" ");
    const original = cues.map((c) => c.text.trim()).join(" ");
    expect(rebuilt).toBe(original);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start).toBeGreaterThanOrEqual(chunks[i - 1].end);
    }
  });
});

describe("passages", () => {
  it("groups chunks in tens", () => {
    expect(passageOf(0)).toBe(0);
    expect(passageOf(9)).toBe(0);
    expect(passageOf(10)).toBe(1);
    expect(passageRange(1, 34)).toEqual({ from: 10, to: 19 });
  });

  it("clamps the last passage to the clip's real end", () => {
    expect(passageRange(3, 34)).toEqual({ from: 30, to: 33 });
  });

  it("falls due on the last chunk of a passage, including a short final one", () => {
    expect(milestoneDue(8, 34)).toBe(false);
    expect(milestoneDue(9, 34)).toBe(true);
    expect(milestoneDue(33, 34)).toBe(true);
  });
});

describe("scaffolds", () => {
  it("reduces each word to its first letter and keeps the punctuation", () => {
    expect(firstLetters("The reef turns white.")).toBe("T r t w.");
  });

  it("picks a content word, never a long function word", () => {
    expect(hardestWord("When the water warms, the algae are expelled.")).toBe("expelled");
    expect(hardestWord("there is that which")).toBe("");
  });

  it("spreads stress across the chunk instead of clustering it at the front", () => {
    const stress = stressWords(REFERENCE);
    expect(stress.length).toBeLessThanOrEqual(7);
    expect(stress).toContain("Coral");
    expect(stress.some((w) => REFERENCE.indexOf(w) > REFERENCE.length / 2)).toBe(true);
  });
});

describe("cueing a generated passage", () => {
  it("keeps every word of the prose, in order", () => {
    const cues = cueProse(PASSAGE, 150);
    expect(cues.map((c) => c.text).join(" ")).toBe(PASSAGE.replace(/\s+/g, " ").trim());
  });

  it("runs the clock forward without gaps or overlaps", () => {
    const cues = cueProse(PASSAGE, 150);
    expect(cues[0].start).toBe(0);
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].start).toBe(cues[i - 1].end);
    }
  });

  it("makes a slower reading take longer, which is the whole point of wpm", () => {
    expect(clipDuration(cueProse(PASSAGE, 120))).toBeGreaterThan(
      clipDuration(cueProse(PASSAGE, 180)),
    );
  });

  it("lands line breaks on sentence ends, so chunks cut on sentences", () => {
    const cues = cueProse("One two three. Four five six.", 150);
    expect(cues.map((c) => c.text)).toEqual(["One two three.", "Four five six."]);
  });

  it("has nothing to cue from empty prose", () => {
    expect(cueProse("", 150)).toEqual([]);
    expect(clipDuration([])).toBe(0);
  });
});
