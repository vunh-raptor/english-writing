import type { Entry, Vocab, DayKey } from "@/types";
import { daysBetween } from "./date";

/**
 * Text measurements and vocabulary growth. These power the "reward real growth,
 * not hollow points" idea — we surface new words used, sentence length trends,
 * and total output rather than empty score numbers.
 */

const WORD_RE = /[A-Za-z][A-Za-z'-]*/g;

export function countWords(text: string): number {
  const m = text.trim().match(WORD_RE);
  return m ? m.length : 0;
}

export function countChars(text: string): number {
  return text.trim().length;
}

export function countSentences(text: string): number {
  const parts = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Math.max(parts.length, text.trim() ? 1 : 0);
}

/** Lowercased word tokens, used for vocabulary tracking. */
export function tokenize(text: string): string[] {
  const m = text.toLowerCase().match(WORD_RE);
  return m ?? [];
}

/** How many *distinct* words in this text have never appeared in the vocab. */
export function newWordCount(tokens: string[], vocab: Vocab): number {
  const seenNow = new Set<string>();
  let n = 0;
  for (const w of tokens) {
    if (seenNow.has(w)) continue;
    seenNow.add(w);
    if (!vocab[w]) n++;
  }
  return n;
}

/** Returns a *new* vocab with these tokens folded in (first-seen + counts). */
export function mergeVocab(vocab: Vocab, tokens: string[], day: DayKey): Vocab {
  const next: Vocab = { ...vocab };
  for (const w of tokens) {
    const existing = next[w];
    if (existing) {
      next[w] = { firstSeen: existing.firstSeen, count: existing.count + 1 };
    } else {
      next[w] = { firstSeen: day, count: 1 };
    }
  }
  return next;
}

export function vocabSize(vocab: Vocab): number {
  return Object.keys(vocab).length;
}

/** Distinct words first used within the last 7 days (inclusive of today). */
export function newWordsThisWeek(vocab: Vocab, today: DayKey): number {
  let n = 0;
  for (const w in vocab) {
    const age = daysBetween(vocab[w].firstSeen, today);
    if (age >= 0 && age < 7) n++;
  }
  return n;
}

export interface ProgressSummary {
  totalWords: number;
  totalEntries: number;
  totalMinutes: number;
  vocabulary: number;
  newWordsThisWeek: number;
  avgWordsPerEntry: number;
  avgSentenceLength: number;
  /** Avg words per session, oldest→newest, for a tiny trend sparkline. */
  recentLengths: number[];
}

export function summarize(
  entries: Entry[],
  vocab: Vocab,
  today: DayKey,
): ProgressSummary {
  const totalWords = entries.reduce((s, e) => s + e.words, 0);
  const totalMs = entries.reduce((s, e) => s + e.durationMs, 0);
  const totalSentences = entries.reduce((s, e) => s + e.sentences, 0);
  const n = entries.length;
  const ordered = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  return {
    totalWords,
    totalEntries: n,
    totalMinutes: Math.round(totalMs / 60_000),
    vocabulary: vocabSize(vocab),
    newWordsThisWeek: newWordsThisWeek(vocab, today),
    avgWordsPerEntry: n ? Math.round(totalWords / n) : 0,
    avgSentenceLength: totalSentences ? Math.round(totalWords / totalSentences) : 0,
    recentLengths: ordered.slice(-10).map((e) => e.words),
  };
}
