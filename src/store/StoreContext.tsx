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
  NewsSession,
  Phrase,
  RespondSession,
  Settings,
  Store,
  TranscribeSession,
} from "@/types";
import { loadStore, saveStore, clearStore, defaultStore } from "@/lib/client/storage";
import { daysBetween, todayKey } from "@/lib/shared/date";
import { countWords, tokenize, mergeVocab } from "@/lib/shared/stats";
import { applyWrite } from "@/lib/shared/streak";
import { reviewCard } from "@/lib/shared/srs";

/** What a finished Daily Words session hands the store (docs/DAILY_WORDS.md). */
interface WordSessionInput {
  /** Every sentence the learner produced this session — the day's real output. */
  sentences: string[];
  /** The keeper per item: the sentence they wrote with it, for a later `echo`. */
  lines: Record<string, string>;
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
  updateSettings(patch: Partial<Settings>): void;
  /** Set the working level by hand (missions also move it on their own). */
  setLevel(level: NewsLevel): void;
  /** Record which curated words today's set introduced, so it stays stable. */
  issueWordDay(ids: string[]): void;
  /** Commit a finished Daily Words session: streak, totals, vocabulary growth. */
  finishWordSession(input: WordSessionInput): void;
  /** Update the spaced-repetition schedule for reviewed phrases. */
  reviewPhrases(ids: string[], success: boolean): void;
  /** Fold a finished News Chat mission into the Coach's pool + SRS. */
  saveMissionOutcome(outcome: MissionOutcome): void;
  /** Create or update a saved News Chat conversation (keyed by id). */
  saveNewsSession(input: NewsSessionInput): void;
  /** Create or update a Respond session — the reading, the thinking, the ideas. */
  saveRespondSession(session: RespondSession): void;
  /** Drop a saved Respond session and the unwritten ideas it held. */
  removeRespondSession(id: string): void;
  /** Create or update a Transcribe session — where in the clip the ear got to. */
  saveTranscribeSession(session: TranscribeSession): void;
  /** Drop a saved Transcribe session. */
  removeTranscribeSession(id: string): void;
  /** Fold a finished chunk into the pool: words misheard twice become tomorrow's
   *  review, and the day's clean applications are tallied. */
  keepMisheard(words: { text: string; heard: string }[]): void;
  /** Add a captured highlight to the phrase pool (deduped; new = due today). */
  collectPhrase(phrase: Phrase): void;
  /** Remove a phrase from the pool and drop its SRS schedule. */
  removePhrase(id: string): void;
  reset(): void;
}

/** Keep the lexical pool bounded — it's the Phrasebook's library and the daily
 *  words' destination, so roomy, but still finite for localStorage. */
const MAX_MINED_PHRASES = 400;
/** How many days of issued word-sets to remember (only today's is ever read;
 *  the rest are history the "this week" strips can lean on). */
const WORD_DAYS_KEEP = 70;
/** Keep saved News Chat conversations bounded — the dashboard only shows recent. */
const MAX_NEWS_SESSIONS = 40;
/** Respond sessions carry a copy of their source text, so keep fewer of them. */
const MAX_RESPOND_SESSIONS = 20;
/** Transcribe sessions carry a whole frozen clip + transcript — keep fewer still. */
const MAX_TRANSCRIBE_SESSIONS = 12;

/** Count targets the learner produced or produced-with-help — the phrase tally. */
function countProduced(progress: MissionProgress): number {
  return Object.values(progress.targets).filter(
    (s) => s === "produced" || s === "assisted",
  ).length;
}

/** Keep the day-keyed application log small — the UI only reads recent weeks. */
const APPLIED_KEEP_DAYS = 70;

/** Record `n` clean applications on `day`, pruning entries past the window. */
function bumpApplied(
  counts: Record<string, number>,
  day: string,
  n: number,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [k, v] of Object.entries(counts)) {
    if (daysBetween(k, day) < APPLIED_KEEP_DAYS) next[k] = v;
  }
  next[day] = (next[day] ?? 0) + n;
  return next;
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

  const issueWordDay = useCallback(
    (ids: string[]) => {
      const prev = storeRef.current;
      const day = todayKey();
      const existing = prev.wordDays[day];
      // Today's set is drawn once and then fixed — reopening never reshuffles it.
      if (existing && existing.length > 0) return;
      const wordDays: Record<string, string[]> = { [day]: ids };
      for (const [k, v] of Object.entries(prev.wordDays)) {
        if (k !== day && daysBetween(k, day) < WORD_DAYS_KEEP) wordDays[k] = v;
      }
      commit({ ...prev, wordDays });
    },
    [commit],
  );

  const finishWordSession = useCallback(
    (input: WordSessionInput) => {
      const prev = storeRef.current;
      const day = todayKey();
      const text = input.sentences.join("\n");
      const words = countWords(text);

      // Their sentences are kept per item, newest wins: weeks from now the
      // `echo` drill gaps their own words back to them, which beats any
      // sentence we could generate as a retrieval cue.
      const myLines = { ...prev.myLines };
      for (const [id, line] of Object.entries(input.lines)) {
        if (line.trim()) myLines[id] = line.trim().slice(0, 300);
      }

      // The streak lives on the daily words: showing up and producing IS the
      // habit. Vocabulary grows from the learner's own sentences, so "your
      // words" always means words they actually wrote.
      const streakFields = applyWrite(prev.profile, day);
      commit({
        ...prev,
        myLines,
        vocab: mergeVocab(prev.vocab, tokenize(text), day),
        hasWritten: true,
        profile: {
          ...prev.profile,
          ...streakFields,
          totalWords: prev.profile.totalWords + words,
          totalEntries: prev.profile.totalEntries + 1,
          totalMs: prev.profile.totalMs + input.durationMs,
        },
      });
    },
    [commit],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const prev = storeRef.current;
      commit({ ...prev, settings: { ...prev.settings, ...patch } });
    },
    [commit],
  );

  const setLevel = useCallback(
    (level: NewsLevel) => {
      const prev = storeRef.current;
      if (prev.newsLevel === level) return;
      commit({ ...prev, newsLevel: level });
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
      commit({
        ...prev,
        phraseSrs: next,
        phraseApplied: success
          ? bumpApplied(prev.phraseApplied, day, ids.length)
          : prev.phraseApplied,
      });
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

      const produced = outcome.targets.filter((t) => t.verdict === "produced").length;
      commit({
        ...prev,
        minedPhrases,
        phraseSrs,
        newsLevel: outcome.level,
        phraseApplied: produced
          ? bumpApplied(prev.phraseApplied, day, produced)
          : prev.phraseApplied,
      });
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

  const saveRespondSession = useCallback(
    (session: RespondSession) => {
      const prev = storeRef.current;
      const rest = prev.respondSessions.filter((s) => s.id !== session.id);
      const respondSessions = [
        { ...session, updatedAt: Date.now() },
        ...rest,
      ].slice(0, MAX_RESPOND_SESSIONS);
      commit({ ...prev, respondSessions });
    },
    [commit],
  );

  const removeRespondSession = useCallback(
    (id: string) => {
      const prev = storeRef.current;
      if (!prev.respondSessions.some((s) => s.id === id)) return;
      commit({
        ...prev,
        respondSessions: prev.respondSessions.filter((s) => s.id !== id),
      });
    },
    [commit],
  );

  const saveTranscribeSession = useCallback(
    (session: TranscribeSession) => {
      const prev = storeRef.current;
      const rest = prev.transcribeSessions.filter((s) => s.id !== session.id);
      const transcribeSessions = [
        { ...session, updatedAt: Date.now() },
        ...rest,
      ].slice(0, MAX_TRANSCRIBE_SESSIONS);
      commit({ ...prev, transcribeSessions });
    },
    [commit],
  );

  const removeTranscribeSession = useCallback(
    (id: string) => {
      const prev = storeRef.current;
      if (!prev.transcribeSessions.some((s) => s.id === id)) return;
      commit({
        ...prev,
        transcribeSessions: prev.transcribeSessions.filter((s) => s.id !== id),
      });
    },
    [commit],
  );

  const keepMisheard = useCallback(
    (words: { text: string; heard: string }[]) => {
      if (words.length === 0) return;
      const prev = storeRef.current;
      const day = todayKey();

      // A word misheard once is a slip; misheard twice it is a gap, and only
      // then does it earn a place in tomorrow's set. The first miss is recorded
      // by adding the item; the second is what knocks its schedule back.
      const known = new Map(prev.minedPhrases.map((p) => [p.id, p]));
      const fresh: Phrase[] = [];
      const phraseSrs = { ...prev.phraseSrs };

      for (const { text, heard } of words) {
        const id = `tr-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;
        if (!id || id === "tr-") continue;
        if (known.has(id) || fresh.some((p) => p.id === id)) {
          // Heard wrong again — send it back to the front of the queue.
          phraseSrs[id] = reviewCard(phraseSrs[id], false, day);
          continue;
        }
        fresh.push({
          id,
          text,
          meaning: "",
          // The sentence it was missed in is the retrieval cue that actually
          // works: their own moment of not hearing it.
          example: heard,
          kind: "word",
          captured: { module: "Transcribe", context: heard, day },
        });
      }

      const minedPhrases = [...prev.minedPhrases, ...fresh].slice(-MAX_MINED_PHRASES);
      commit({ ...prev, minedPhrases, phraseSrs });
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
      const myLines = { ...prev.myLines };
      delete myLines[id];
      commit({
        ...prev,
        minedPhrases: prev.minedPhrases.filter((p) => p.id !== id),
        phraseSrs,
        myLines,
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
      keepMisheard,
      collectPhrase,
      removePhrase,
      reset,
    }),
    [
      store,
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
      keepMisheard,
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
