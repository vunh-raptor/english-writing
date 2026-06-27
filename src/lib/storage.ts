import type { Store, Settings } from "../types";
import { STARTING_FREEZES } from "./streak";

/**
 * Local-first persistence. Private by default: the learner's writing lives only
 * in this browser. No account, no server, no audience.
 */

const STORAGE_KEY = "flowrite.v1";
const SCHEMA_VERSION = 1;

export const defaultSettings: Settings = {
  name: "",
  goalType: "time",
  goalValue: 300, // 5 minutes — momentum, not marathon
  difficulty: 1,
  gentleNudge: true,
  sound: true,
  ai: {
    enabled: false,
    apiKey: "",
    model: "claude-opus-4-8",
  },
};

export function defaultStore(): Store {
  return {
    version: SCHEMA_VERSION,
    entries: [],
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
    hasWritten: false,
  };
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw) as Partial<Store>;
    const base = defaultStore();
    // Shallow-merge so new fields added in future versions get sane defaults.
    return {
      ...base,
      ...parsed,
      profile: { ...base.profile, ...parsed.profile },
      settings: {
        ...base.settings,
        ...parsed.settings,
        ai: { ...base.settings.ai, ...parsed.settings?.ai },
      },
      entries: parsed.entries ?? [],
      vocab: parsed.vocab ?? {},
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
