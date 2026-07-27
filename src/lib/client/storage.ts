import type { Store, Settings, NewsLevel } from "@/types";
import { STARTING_FREEZES } from "@/lib/shared/streak";

/**
 * Local-first persistence. Private by default: the learner's practice lives
 * only in this browser. No account, no server, no audience.
 */

const STORAGE_KEY = "flowrite.v1";
const SCHEMA_VERSION = 2;

/** Five a day: enough to be real progress, few enough to always finish. */
export const DEFAULT_WORDS_PER_DAY = 5;

export const defaultSettings: Settings = {
  name: "",
  wordsPerDay: DEFAULT_WORDS_PER_DAY,
  sound: true,
};

export function defaultStore(): Store {
  return {
    version: SCHEMA_VERSION,
    profile: {
      streak: 0,
      longestStreak: 0,
      lastWriteDay: null,
      freezes: STARTING_FREEZES,
      totalWords: 0,
      totalEntries: 0,
      totalMs: 0,
    },
    settings: defaultSettings,
    vocab: {},
    phraseSrs: {},
    phraseApplied: {},
    minedPhrases: [],
    wordDays: {},
    myLines: {},
    newsSessions: [],
    newsLevel: "B1",
    hasWritten: false,
  };
}

export function loadStore(): Store {
  // SSR-safe: there's no localStorage on the server.
  if (typeof window === "undefined") return defaultStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw) as Partial<Store>;
    const base = defaultStore();
    // Shallow-merge so new fields added in future versions get sane defaults,
    // and fields dropped in v2 (entries, aiPrompts, the writing-goal settings)
    // simply fall away.
    return {
      ...base,
      ...parsed,
      version: SCHEMA_VERSION,
      profile: { ...base.profile, ...parsed.profile },
      settings: { ...base.settings, ...parsed.settings },
      vocab: parsed.vocab ?? {},
      phraseSrs: parsed.phraseSrs ?? {},
      phraseApplied: parsed.phraseApplied ?? {},
      minedPhrases: parsed.minedPhrases ?? [],
      wordDays: parsed.wordDays ?? {},
      myLines: parsed.myLines ?? {},
      newsSessions: parsed.newsSessions ?? [],
      newsLevel: (["A2", "B1", "B2", "C1"] as NewsLevel[]).includes(
        parsed.newsLevel as NewsLevel,
      )
        ? (parsed.newsLevel as NewsLevel)
        : "B1",
    };
  } catch {
    return defaultStore();
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable (private mode) — fail quietly; the app still
    // works for the current session.
  }
}

export function clearStore(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
