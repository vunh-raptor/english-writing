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
  Mission,
  MissionProgress,
  NewsLevel,
  Phrase,
  RespondSession,
  Settings,
  Store,
  TranscribeSession,
} from "@/types";
import type { StateAction } from "@/lib/server/db/state";

/**
 * The learner's durable state, held in Postgres and reached over `/api/state`.
 *
 * This used to be a `localStorage` blob, and the app used to be guest-first.
 * It is now account-only: nothing durable is written on the device, so a
 * learner's streak, vocabulary, phrasebook and unfinished sessions follow them
 * to whatever they next sit down at, and a shared or wiped browser costs them
 * nothing.
 *
 * Every mutation is a server action that returns the WHOLE fresh store. That is
 * deliberate: one clean production moves the schedule, the streak and the day's
 * tally at once, and a client reconstructing that from a patch would eventually
 * disagree with the database. The cost is a round trip per write; the benefit is
 * that the two can never drift.
 *
 * Note the `StateAction` import is type-only, so nothing from `lib/server`
 * reaches the bundle — the `server-only` boundary still holds.
 */

/** What a finished Daily Words session hands the store (docs/DAILY_WORDS.md). */
interface WordSessionInput {
  sentences: string[];
  lines: Record<string, string>;
  durationMs: number;
}

/** What a completed News Chat mission hands the store (docs/NEWS_CHAT_V2.md §9). */
interface MissionOutcome {
  targets: { phrase: Phrase; verdict: "produced" | "assisted" | "missed" }[];
  keep: Phrase[];
  level: NewsLevel;
}

interface NewsSessionInput {
  id: string;
  mission: Mission;
  messages: ChatMessage[];
  progress: MissionProgress;
  status: "active" | "complete";
  goalHit?: boolean;
}

interface StoreContextValue {
  store: Store;
  /** True while a write is in flight — surfaces "saving" without blocking. */
  saving: boolean;
  /** Set when the last write failed; the UI can say so rather than lie. */
  error: string;
  updateSettings(patch: Partial<Settings>): void;
  setLevel(level: NewsLevel): void;
  issueWordDay(ids: string[]): void;
  finishWordSession(input: WordSessionInput): void;
  reviewPhrases(ids: string[], success: boolean): void;
  saveMissionOutcome(outcome: MissionOutcome): void;
  saveNewsSession(input: NewsSessionInput): void;
  saveRespondSession(session: RespondSession): void;
  removeRespondSession(id: string): void;
  saveTranscribeSession(session: TranscribeSession): void;
  removeTranscribeSession(id: string): void;
  collectPhrase(phrase: Phrase): void;
  removePhrase(id: string): void;
  keepMisheard(words: { text: string; heard: string }[]): void;
  reset(): void;
}

/** The shape rendered before the first load lands. Never persisted anywhere. */
function emptyStore(): Store {
  return {
    version: 3,
    profile: {
      streak: 0,
      longestStreak: 0,
      lastWriteDay: null,
      freezes: 2,
      totalWords: 0,
      totalEntries: 0,
      totalMs: 0,
    },
    settings: { name: "", wordsPerDay: 5, sound: true },
    vocab: {},
    phraseSrs: {},
    phraseApplied: {},
    minedPhrases: [],
    wordDays: {},
    myLines: {},
    newsSessions: [],
    respondSessions: [],
    transcribeSessions: [],
    newsLevel: "B1",
    hasWritten: false,
  };
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(emptyStore);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Writes are serialized through one promise chain. Two mutations racing on
  // the same row would otherwise let the slower response overwrite the faster
  // one's result — and both return the whole store, so the loser would roll
  // state backwards.
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let live = true;
    fetch("/api/state")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: Store) => {
        if (live) setStore(data);
      })
      .catch(() => {
        // Middleware bounces an unauthenticated page request to /sign-in, so a
        // failure here means the API is genuinely unreachable, not a guest.
        if (live) setError("Couldn't reach your work. Check your connection.");
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const dispatch = useCallback((action: StateAction) => {
    queue.current = queue.current.then(async () => {
      setSaving(true);
      try {
        const res = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        if (!res.ok) throw new Error(String(res.status));
        setStore((await res.json()) as Store);
        setError("");
      } catch {
        setError("That didn't save. Your last change may not have stuck.");
      } finally {
        setSaving(false);
      }
    });
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => dispatch({ type: "updateSettings", patch }),
    [dispatch],
  );

  const setLevel = useCallback(
    (level: NewsLevel) => dispatch({ type: "setLevel", level }),
    [dispatch],
  );

  const issueWordDay = useCallback(
    (ids: string[]) => dispatch({ type: "issueWordDay", ids }),
    [dispatch],
  );

  const finishWordSession = useCallback(
    (input: WordSessionInput) =>
      dispatch({
        type: "finishWordSession",
        sentences: input.sentences,
        lines: input.lines,
        durationMs: input.durationMs,
      }),
    [dispatch],
  );

  const reviewPhrases = useCallback(
    (ids: string[], success: boolean) => {
      if (ids.length === 0) return;
      dispatch({ type: "reviewPhrases", ids, success });
    },
    [dispatch],
  );

  const collectPhrase = useCallback(
    (phrase: Phrase) => dispatch({ type: "collectPhrase", phrase }),
    [dispatch],
  );

  const removePhrase = useCallback(
    (id: string) => dispatch({ type: "removePhrase", id }),
    [dispatch],
  );

  const keepMisheard = useCallback(
    (words: { text: string; heard: string }[]) => {
      if (words.length === 0) return;
      dispatch({ type: "keepMisheard", words });
    },
    [dispatch],
  );

  const saveRespondSession = useCallback(
    (session: RespondSession) => dispatch({ type: "saveRespondSession", session }),
    [dispatch],
  );

  const removeRespondSession = useCallback(
    (id: string) => dispatch({ type: "removeRespondSession", id }),
    [dispatch],
  );

  const saveTranscribeSession = useCallback(
    (session: TranscribeSession) => dispatch({ type: "saveTranscribeSession", session }),
    [dispatch],
  );

  const removeTranscribeSession = useCallback(
    (id: string) => dispatch({ type: "removeTranscribeSession", id }),
    [dispatch],
  );

  /**
   * A finished mission folds into the same pool and schedule as everything
   * else: each target joins the library, a clean production earns an interval,
   * and an assisted or missed one stays due so the Phrasebook picks up what the
   * mission couldn't land.
   */
  const saveMissionOutcome = useCallback(
    (outcome: MissionOutcome) => {
      for (const { phrase } of outcome.targets) dispatch({ type: "collectPhrase", phrase });
      for (const phrase of outcome.keep) dispatch({ type: "collectPhrase", phrase });

      const produced = outcome.targets.filter((t) => t.verdict === "produced").map((t) => t.phrase.id);
      const lapsed = outcome.targets.filter((t) => t.verdict !== "produced").map((t) => t.phrase.id);
      if (produced.length > 0) dispatch({ type: "reviewPhrases", ids: produced, success: true });
      if (lapsed.length > 0) dispatch({ type: "reviewPhrases", ids: lapsed, success: false });
      dispatch({ type: "setLevel", level: outcome.level });
    },
    [dispatch],
  );

  /**
   * News Chat conversations are not yet server-backed — `news_sessions` exists
   * in the schema but the conversation writer still needs porting, so this is
   * a no-op rather than a silent local write. Tracked in docs/ARCHITECTURE.md.
   */
  const saveNewsSession = useCallback((_input: NewsSessionInput) => {
    void _input;
  }, []);

  const reset = useCallback(() => dispatch({ type: "reset" }), [dispatch]);

  const value = useMemo(
    () => ({
      store,
      saving,
      error,
      updateSettings,
      setLevel,
      issueWordDay,
      finishWordSession,
      reviewPhrases,
      saveMissionOutcome,
      saveNewsSession,
      saveRespondSession,
      removeRespondSession,
      saveTranscribeSession,
      removeTranscribeSession,
      collectPhrase,
      removePhrase,
      keepMisheard,
      reset,
    }),
    [
      store,
      saving,
      error,
      updateSettings,
      setLevel,
      issueWordDay,
      finishWordSession,
      reviewPhrases,
      saveMissionOutcome,
      saveNewsSession,
      saveRespondSession,
      removeRespondSession,
      saveTranscribeSession,
      removeTranscribeSession,
      collectPhrase,
      removePhrase,
      keepMisheard,
      reset,
    ],
  );

  // Until the first load lands, render the calm boot placeholder — the same
  // markup the server emits, so hydration stays clean.
  if (!loaded) return <div className="app-boot" aria-hidden="true" />;

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
