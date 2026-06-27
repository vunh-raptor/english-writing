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
import type { Entry, Settings, Store } from "../types";
import { loadStore, saveStore, clearStore, defaultStore } from "../lib/storage";
import { todayKey } from "../lib/date";
import {
  countWords,
  countChars,
  countSentences,
  tokenize,
  newWordCount,
  mergeVocab,
} from "../lib/stats";
import { applyWrite } from "../lib/streak";

interface FinishInput {
  promptId: string;
  promptText: string;
  text: string;
  durationMs: number;
}

interface StoreContextValue {
  store: Store;
  /** Commit a completed session. Returns the created entry for the celebrate screen. */
  finishSession(input: FinishInput): Entry;
  updateSettings(patch: Partial<Settings>): void;
  reset(): void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => loadStore());

  // The ref always holds the freshest committed store, so callbacks can read
  // and derive next-state synchronously without relying on setState timing or
  // capturing a stale closure.
  const storeRef = useRef(store);
  storeRef.current = store;

  // Persist on every change. Skip the very first run (nothing changed yet).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saveStore(store);
  }, [store]);

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

  const reset = useCallback(() => {
    clearStore();
    commit(defaultStore());
  }, [commit]);

  const value = useMemo(
    () => ({ store, finishSession, updateSettings, reset }),
    [store, finishSession, updateSettings, reset],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
