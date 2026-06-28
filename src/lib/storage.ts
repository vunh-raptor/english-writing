import type { Store, Settings, AiSettings, AiProvider } from "../types";
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
  focuses: [], // empty = a bit of everything
  gentleNudge: true,
  sound: true,
  ai: {
    enabled: false,
    provider: "anthropic",
    providers: {
      // Haiku is the cheap default — fractions of a cent per session.
      anthropic: { apiKey: "", model: "claude-haiku-4-5" },
      gemini: { apiKey: "", model: "gemini-2.0-flash" },
      groq: { apiKey: "", model: "llama-3.3-70b-versatile" },
      openai: { apiKey: "", model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
    },
  },
};

/**
 * Merge a stored AI settings blob onto the current defaults, tolerating the
 * older single-key shape (`{ enabled, apiKey, model }`) by folding it into the
 * Anthropic provider slot.
 */
function migrateAi(stored: unknown): AiSettings {
  const base = defaultSettings.ai;
  if (!stored || typeof stored !== "object") return base;
  const s = stored as Record<string, unknown>;

  const providers = { ...base.providers };
  if (s.providers && typeof s.providers === "object") {
    for (const key of Object.keys(providers) as AiProvider[]) {
      const p = (s.providers as Record<string, unknown>)[key];
      if (p && typeof p === "object") {
        providers[key] = { ...providers[key], ...(p as object) };
      }
    }
  } else if (typeof s.apiKey === "string" || typeof s.model === "string") {
    // Legacy shape → Anthropic slot.
    providers.anthropic = {
      apiKey: typeof s.apiKey === "string" ? s.apiKey : "",
      model: typeof s.model === "string" ? s.model : base.providers.anthropic.model,
    };
  }

  const provider =
    typeof s.provider === "string" && s.provider in providers
      ? (s.provider as AiProvider)
      : base.provider;

  return {
    enabled: typeof s.enabled === "boolean" ? s.enabled : base.enabled,
    provider,
    providers,
  };
}

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
    aiPrompts: [],
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
        ai: migrateAi(parsed.settings?.ai),
      },
      entries: parsed.entries ?? [],
      vocab: parsed.vocab ?? {},
      aiPrompts: parsed.aiPrompts ?? [],
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
