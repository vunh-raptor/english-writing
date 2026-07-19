"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ChatMessage,
  Entry,
  Mission,
  MissionProgress,
  NewsLevel,
  NewsSession,
  Phrase,
  Prompt,
  Settings,
  Store,
} from "@/types";
import { loadStore, saveStore, clearStore, defaultStore } from "@/lib/client/storage";
import { todayKey } from "@/lib/shared/date";
import {
  countWords,
  countChars,
  countSentences,
  tokenize,
  newWordCount,
  mergeVocab,
} from "@/lib/shared/stats";
import { applyWrite } from "@/lib/shared/streak";
import { reviewCard } from "@/lib/shared/srs";

interface FinishInput {
  promptId: string;
  promptText: string;
  text: string;
  durationMs: number;
}

/** What a completed News Chat mission hands the store (see docs/NEWS_CHAT_V2.md §9). */
interface MissionOutcome {
  /** The mission's targets with their final verdicts. */
  targets: { phrase: Phrase; verdict: "produced" | "assisted" | "missed" }[];
  /** Bonus phrases worth keeping from the chat. */
  keep: Phrase[];
  /** Rolling level, persisted so tomorrow's mission is planned at it. */
  level: NewsLevel;
}

/** A News Chat conversation snapshot to persist for the /news dashboard. */
interface NewsSessionInput {
  id: string;
  mission: Mission;
  messages: ChatMessage[];
  progress: MissionProgress;
  status: "active" | "complete";
  /** Only meaningful when status is "complete". */
  goalHit?: boolean;
}

interface StoreContextValue {
  store: Store;
  /** Commit a completed session. Returns the created entry for the celebrate screen. */
  finishSession(input: FinishInput): Entry;
  updateSettings(patch: Partial<Settings>): void;
  /** Add freshly AI-generated prompts to the local library (deduped, bounded). */
  addGeneratedPrompts(prompts: Prompt[]): void;
  /** Update the spaced-repetition schedule for reviewed phrases. */
  reviewPhrases(ids: string[], success: boolean): void;
  /** Fold a finished News Chat mission into the Coach's pool + SRS. */
  saveMissionOutcome(outcome: MissionOutcome): void;
  /** Create or update a saved News Chat conversation (keyed by id). */
  saveNewsSession(input: NewsSessionInput): void;
  /** Add a captured highlight to the phrase pool (deduped; new = due today). */
  collectPhrase(phrase: Phrase): void;
  /** Remove a phrase from the pool and drop its SRS schedule. */
  removePhrase(id: string): void;
  reset(): void;
}

/** Keep the on-device AI prompt library from growing without bound. */
const MAX_AI_PROMPTS = 120;
/** Keep the phrase pool bounded — it's the Phrasebook's library now, so
 *  roomier than the old mined-only pool, but still finite for localStorage. */
const MAX_MINED_PHRASES = 100;
/** Keep saved News Chat conversations bounded — the dashboard only shows recent. */
const MAX_NEWS_SESSIONS = 40;

/** Count targets the learner produced or produced-with-help — the phrase tally. */
function countProduced(progress: MissionProgress): number {
  return Object.values(progress.targets).filter(
    (s) => s === "produced" || s === "assisted",
  ).length;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // Start from a deterministic default so the server and the first client paint
  // agree (no hydration mismatch); the real persisted store loads on mount.
  const [store, setStore] = useState<Store>(defaultStore);
  const [hydrated, setHydrated] = useState(false);

  // The ref always holds the freshest committed store, so callbacks can read
  // and derive next-state synchronously without relying on setState timing or
  // capturing a stale closure.
  const storeRef = useRef(store);
  storeRef.current = store;

  // Load persisted state on the client only (localStorage is unavailable on the
  // server). This replaces the old `dynamic(ssr:false)` wrapper.
  useEffect(() => {
    const loaded = loadStore();
    storeRef.current = loaded;
    setStore(loaded);
    setHydrated(true);
  }, []);

  // Persist on every change — but only after we've hydrated, so we never
  // overwrite storage with the placeholder default.
  useEffect(() => {
    if (!hydrated) return;
    saveStore(store);
  }, [store, hydrated]);

  const commit = useCallback((next: Store) => {
    storeRef.current = next;
    setStore(next);
  }, []);

  const finishSession = useCallback(
    (input: FinishInput): Entry => {
      const prev = storeRef.current;
      const day = todayKey();
      const text = input.text;
      const tokens = tokenize(text);

      const entry: Entry = {
        id: makeId(),
        day,
        createdAt: Date.now(),
        promptId: input.promptId,
        promptText: input.promptText,
        text,
        words: countWords(text),
        chars: countChars(text),
        sentences: countSentences(text),
        newWords: newWordCount(tokens, prev.vocab),
        durationMs: input.durationMs,
      };

      const streakFields = applyWrite(prev.profile, day);
      commit({
        ...prev,
        entries: [...prev.entries, entry],
        vocab: mergeVocab(prev.vocab, tokens, day),
        hasWritten: true,
        profile: {
          ...prev.profile,
          ...streakFields,
          totalWords: prev.profile.totalWords + entry.words,
          totalEntries: prev.profile.totalEntries + 1,
          totalMs: prev.profile.totalMs + entry.durationMs,
        },
      });

      return entry;
    },
    [commit],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const prev = storeRef.current;
      commit({
        ...prev,
        settings: {
          ...prev.settings,
          ...patch,
          ai: { ...prev.settings.ai, ...patch.ai },
        },
      });
    },
    [commit],
  );

  const addGeneratedPrompts = useCallback(
    (prompts: Prompt[]) => {
      if (prompts.length === 0) return;
      const prev = storeRef.current;
      const seen = new Set(prev.aiPrompts.map((p) => p.id));
      const merged = [...prev.aiPrompts, ...prompts.filter((p) => !seen.has(p.id))];
      commit({ ...prev, aiPrompts: merged.slice(-MAX_AI_PROMPTS) });
    },
    [commit],
  );

  const reviewPhrases = useCallback(
    (ids: string[], success: boolean) => {
      if (ids.length === 0) return;
      const prev = storeRef.current;
      const day = todayKey();
      const next = { ...prev.phraseSrs };
      for (const id of ids) next[id] = reviewCard(next[id], success, day);
      commit({ ...prev, phraseSrs: next });
    },
    [commit],
  );

  const saveMissionOutcome = useCallback(
    (outcome: MissionOutcome) => {
      const prev = storeRef.current;
      const day = todayKey();

      // Pool: every phrase the mission touched joins the Coach's practice pool
      // (deduped — a repeat target keeps its first saved version).
      const seen = new Set(prev.minedPhrases.map((p) => p.id));
      const incoming = [...outcome.targets.map((t) => t.phrase), ...outcome.keep];
      const fresh = incoming.filter((p) => p.id && !seen.has(p.id));
      const minedPhrases = [...prev.minedPhrases, ...fresh].slice(-MAX_MINED_PHRASES);

      // SRS: a clean production earns an interval; an assisted or missed target
      // stays due now so the Phrase Coach picks up what the mission couldn't land.
      const phraseSrs = { ...prev.phraseSrs };
      for (const { phrase, verdict } of outcome.targets) {
        if (!phrase.id) continue;
        if (verdict === "produced") {
          phraseSrs[phrase.id] = reviewCard(phraseSrs[phrase.id], true, day);
        } else if (phraseSrs[phrase.id]) {
          phraseSrs[phrase.id] = reviewCard(phraseSrs[phrase.id], false, day);
        }
        // No record yet + not produced → leave it absent: "new" is already due.
      }

      commit({ ...prev, minedPhrases, phraseSrs, newsLevel: outcome.level });
    },
    [commit],
  );

  const saveNewsSession = useCallback(
    (input: NewsSessionInput) => {
      const prev = storeRef.current;
      const now = Date.now();
      const { mission, progress } = input;
      const existing = prev.newsSessions.find((s) => s.id === input.id);

      const session: NewsSession = {
        id: input.id,
        day: mission.day,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        level: mission.level,
        title: mission.title,
        source: mission.source,
        url: mission.url,
        goal: mission.goal,
        status: input.status,
        wordsProduced: progress.wordsProduced,
        targetsProduced: countProduced(progress),
        targetsTotal: mission.targets.length,
        goalHit: input.status === "complete" ? input.goalHit ?? existing?.goalHit : existing?.goalHit,
        mission,
        messages: input.messages,
        progress,
      };

      // Upsert by id, newest first, bounded.
      const rest = prev.newsSessions.filter((s) => s.id !== input.id);
      const newsSessions = [session, ...rest].slice(0, MAX_NEWS_SESSIONS);
      commit({ ...prev, newsSessions });
    },
    [commit],
  );

  const collectPhrase = useCallback(
    (phrase: Phrase) => {
      if (!phrase.id || !phrase.text) return;
      const prev = storeRef.current;
      // First save wins — re-capturing the same phrase keeps its history.
      if (prev.minedPhrases.some((p) => p.id === phrase.id)) return;
      const minedPhrases = [...prev.minedPhrases, phrase].slice(-MAX_MINED_PHRASES);
      // No SRS record on purpose: "new" is already due today, so the drill and
      // the Phrase Coach pick it up immediately.
      commit({ ...prev, minedPhrases });
    },
    [commit],
  );

  const removePhrase = useCallback(
    (id: string) => {
      const prev = storeRef.current;
      if (!prev.minedPhrases.some((p) => p.id === id)) return;
      const phraseSrs = { ...prev.phraseSrs };
      delete phraseSrs[id];
      commit({
        ...prev,
        minedPhrases: prev.minedPhrases.filter((p) => p.id !== id),
        phraseSrs,
      });
    },
    [commit],
  );

  const reset = useCallback(() => {
    clearStore();
    commit(defaultStore());
  }, [commit]);

  const value = useMemo(
    () => ({
      store,
      finishSession,
      updateSettings,
      addGeneratedPrompts,
      reviewPhrases,
      saveMissionOutcome,
      saveNewsSession,
      collectPhrase,
      removePhrase,
      reset,
    }),
    [
      store,
      finishSession,
      updateSettings,
      addGeneratedPrompts,
      reviewPhrases,
      saveMissionOutcome,
      saveNewsSession,
      collectPhrase,
      removePhrase,
      reset,
    ],
  );

  // Until the persisted store is loaded, render the calm boot placeholder. The
  // server emits the same markup, so hydration stays clean.
  if (!hydrated) return <div className="app-boot" aria-hidden="true" />;

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
