"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Eye, Flame, Send, Sparkles } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type { NewsLevel, TalkEntry, WordDay, WordDayItem, WordOutcome } from "@/types";
import { openWordDay, peekWordDay, wordMove, type WordMove } from "@/lib/client/clientApi";
import { bridgePair, buildDaySet, catalogById, talkCanLeave } from "@/lib/shared/words";
import { SRS_INTERVALS, srsSummary } from "@/lib/shared/srs";
import { newWordsThisWeek, vocabSize } from "@/lib/shared/stats";
import { addDays, parseDayKey, todayKey } from "@/lib/shared/date";
import { streakInfo } from "@/lib/shared/streak";
import { playChime } from "@/lib/client/sound";
import { cn } from "@/lib/utils";

/**
 * Daily words (docs/DAILY_WORDS.md) — the one mode that hands the learner
 * language instead of waiting for them to meet it.
 *
 * Each word is a short conversation: someone says something that calls for the
 * word, the learner answers in their own sentence, and the line stays open
 * until the sentence is right. Then the same person carries the scene on.
 *
 * **The server owns the session.** This component holds no progress of its
 * own: it asks for today's `WordDay`, shows it, and sends moves (`say`, `peek`,
 * `leave`, `bridge`, `finish`). Every move comes back as the whole day as the
 * server now has it. That is what makes leaving and returning — or switching
 * device — land exactly where the learner stopped; it used to be React state,
 * and quitting to the dashboard threw the conversation away.
 *
 * This screen is where the app's current look started (docs/DESIGN_SYSTEM.md);
 * it uses the `dw-*` primitives in globals.css most heavily.
 */

type View = "home" | "session" | "bridge" | "done";

const OUTCOME_COPY: Record<WordOutcome, { label: string; chip: string }> = {
  clean: { label: "Yours", chip: "dw-chip-good" },
  helped: { label: "With help", chip: "dw-chip-note" },
  missed: { label: "Not yet", chip: "" },
};

/** "comes back…" copy for a word, from the outcome it earned today. */
function returnsLabel(item: WordDayItem): string {
  if (item.outcome !== "clean") return "Comes back tomorrow";
  const days = SRS_INTERVALS[Math.min(SRS_INTERVALS.length - 1, item.prevBox + 1)];
  if (days <= 1) return "Comes back tomorrow";
  if (days === 7) return "Comes back in a week";
  return `Comes back in ${days} days`;
}

/** Has the learner said anything in this word's conversation yet? */
function started(item: WordDayItem): boolean {
  return item.thread.some((e) => e.t === "you");
}

/** The first word still open — where "Continue" lands. */
function firstOpen(day: WordDay): WordDayItem | undefined {
  return day.items.find((i) => i.outcome === null);
}

/** Small ring that fills as the day's words close. Drawn in CSS, no chart lib. */
function Ring({ done, total, size = 132 }: { done: number; total: number; size?: number }) {
  const p = total ? Math.round((done / total) * 100) : 0;
  return (
    <div
      className="dw-ring flex-none"
      style={{ width: size, height: size, ["--p" as string]: p }}
      role="img"
      aria-label={`${done} of ${total} words done`}
    >
      <div style={{ width: size - 18, height: size - 18 }}>
        <div className="text-center leading-none">
          <span className="text-[34px] font-bold tabular-nums">{done}</span>
          <span className="text-[17px] font-medium opacity-70">/{total}</span>
        </div>
      </div>
    </div>
  );
}

/** The word card: form, part of speech, meaning, a real example, its partners. */
function WordCard({ item }: { item: WordDayItem }) {
  const w = item.seed;
  return (
    <div className="dw-card dw-rise p-6 sm:p-7">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[32px] font-bold leading-none tracking-tight text-foreground">
          {w.word}
        </span>
        <span className="dw-chip dw-chip-accent">{w.pos}</span>
      </div>
      <p className="mt-3 text-[17px] leading-relaxed text-foreground/90">{w.meaning}</p>
      {/* Worked examples are input to read, never an answer to lift: they sit
          in other contexts, and they can't be selected. */}
      <ul className="mt-4 space-y-2">
        {item.examples.map((x, k) => (
          <li
            key={k}
            className="select-none rounded-[14px] bg-[hsl(var(--dw-accent-soft))] px-4 py-2.5 text-[15.5px] leading-relaxed text-foreground/85"
          >
            {x}
          </li>
        ))}
      </ul>
      {w.collocations.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-medium text-muted-foreground">Goes with</span>
          {w.collocations.map((c) => (
            <span key={c} className="dw-chip">
              {c}
            </span>
          ))}
        </div>
      )}
      <p className="mt-5 text-[13.5px] text-muted-foreground">
        Read it once. It closes when you start typing, so the sentence comes from memory.
      </p>
    </div>
  );
}

export function DailyWords() {
  const { store, refresh } = useStore();
  const level: NewsLevel = store.newsLevel;
  const perDay = store.settings.wordsPerDay;
  const today = todayKey();

  /** Today's session as the server has it; null until it has been opened. */
  const [day, setDay] = useState<WordDay | null>(null);
  /** The first look at whether a session already exists. */
  const [checking, setChecking] = useState(true);
  /** Today's session is being generated — the one slow step, once a day. */
  const [building, setBuilding] = useState(false);
  const [homeError, setHomeError] = useState("");
  const [view, setView] = useState<View>("home");
  const [sel, setSel] = useState<string>("");
  const [input, setInput] = useState("");
  /** A sentence that has been sent and is being read. Shown at once, so the
   *  wait belongs to the partner rather than to the learner. */
  const [pending, setPending] = useState<string | null>(null);
  const [turnError, setTurnError] = useState("");
  const [cardOpen, setCardOpen] = useState(false);
  const [bridgeText, setBridgeText] = useState("");
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // What's already stored for today — never generates, so it is safe on mount.
  useEffect(() => {
    let live = true;
    peekWordDay()
      .then((d) => live && setDay(d))
      .catch(() => {
        // The dashboard still works from the store; Start will surface a real error.
      })
      .finally(() => live && setChecking(false));
    return () => {
      live = false;
    };
  }, []);

  // Before a session exists, the dashboard previews today's draw from the store.
  const catalog = store.wordCatalog;
  const preview = useMemo(
    () =>
      buildDaySet({
        catalog,
        wordDays: store.wordDays,
        pool: store.minedPhrases,
        srs: store.phraseSrs,
        level,
        perDay,
        today,
      }),
    [catalog, store.wordDays, store.minedPhrases, store.phraseSrs, level, perDay, today],
  );

  const inCatalog = useMemo(() => catalogById(catalog), [catalog]);
  const stats = useMemo(
    () =>
      srsSummary(
        store.minedPhrases.filter((p) => inCatalog.has(p.id)).map((p) => p.id),
        store.phraseSrs,
      ),
    [store.minedPhrases, inCatalog, store.phraseSrs],
  );
  const info = streakInfo(store.profile, today);
  const week = useMemo(() => {
    const monday = addDays(today, -((parseDayKey(today).getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const counts = days.map((d) => store.phraseApplied[d] ?? 0);
    return { days, counts, total: counts.reduce((a, b) => a + b, 0), max: Math.max(...counts, 1) };
  }, [store.phraseApplied, today]);

  const item = day?.items.find((i) => i.seed.id === sel);
  const doneCount = day ? day.items.filter((i) => i.outcome !== null).length : 0;
  const allClosed = !!day && day.items.length > 0 && doneCount === day.items.length;

  /** Put a word on the table. Its card starts open only on a true first meeting. */
  const select = useCallback((it: WordDayItem) => {
    setSel(it.seed.id);
    setInput("");
    setTurnError("");
    setCardOpen(it.isNew && it.outcome === null && !started(it) && !it.talk.peeked);
  }, []);

  /** Enter the session at the right place for where the day stands. */
  function enter(d: WordDay, wordId?: string) {
    if (d.finishedAt) return setView("done");
    const target = d.items.find((i) => i.seed.id === wordId) ?? firstOpen(d);
    if (!target) return setView(bridgePair(d.items.map((i) => i.seed)) ? "bridge" : "done");
    select(target);
    setView("session");
  }

  /** Start or continue today. Building is the only slow step, and it is once. */
  async function start(wordId?: string) {
    if (building) return;
    setHomeError("");
    if (day && day.items.length > 0) return enter(day, wordId);
    setBuilding(true);
    try {
      const d = await openWordDay();
      setDay(d);
      refresh();
      if (d.items.length > 0) enter(d, wordId);
    } catch (e) {
      setHomeError(
        e instanceof Error && e.message
          ? e.message
          : "Couldn't build today's words. Have another go in a moment.",
      );
    } finally {
      setBuilding(false);
    }
  }

  // Keep the newest line in view, and the writing field as tall as its text.
  useEffect(() => {
    if (view === "session") endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [view, sel, pending, item?.thread.length, item?.outcome]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input, view, sel]);

  /** Make a move and take the day back as the server now has it. */
  async function move(m: WordMove): Promise<WordDay | null> {
    try {
      const d = await wordMove(m);
      setDay(d);
      return d;
    } catch (e) {
      setTurnError(
        e instanceof Error && e.message ? e.message : "That didn't go through — try again.",
      );
      return null;
    }
  }

  /** Send the sentence in the composer. */
  async function send() {
    const sentence = input.trim();
    if (!item || item.outcome !== null || !sentence || pending !== null) return;
    setTurnError("");
    setPending(sentence);
    setInput("");
    setCardOpen(false);

    const before = item.talk.landed.length;
    const d = await move({ move: "say", wordId: item.seed.id, sentence });
    setPending(null);
    if (!d) {
      // Nothing was judged or saved: hand the sentence back rather than make
      // them type it twice.
      setInput((cur) => cur || sentence);
      return;
    }
    const now = d.items.find((i) => i.seed.id === item.seed.id);
    if (now && now.outcome !== null) {
      // Closing a word moved the schedule and the library server-side.
      refresh();
      if (store.settings.sound && now.talk.landed.length > before) playChime();
    }
    inputRef.current?.focus();
  }

  /** Reopen the card. Free to do, but the word no longer counts as clean. */
  function peek() {
    if (!item || cardOpen) return;
    setCardOpen(true);
    if (!item.talk.peeked) void move({ move: "peek", wordId: item.seed.id });
  }

  async function leave() {
    if (!item || pending !== null) return;
    const d = await move({ move: "leave", wordId: item.seed.id });
    if (d) refresh();
  }

  /** On from a finished word: the next open one, else the day's close. */
  function next() {
    if (!day) return;
    const open = firstOpen(day);
    if (open) select(open);
    else setView(bridgePair(day.items.map((i) => i.seed)) ? "bridge" : "done");
  }

  async function finish() {
    const d = await move({ move: "finish" });
    if (!d) return;
    refresh();
    if (store.settings.sound) playChime();
    setView("done");
  }

  async function sendBridge() {
    const sentence = bridgeText.trim();
    if (!sentence || bridgeBusy) return;
    setBridgeBusy(true);
    await move({ move: "bridge", sentence });
    setBridgeBusy(false);
  }

  // Arriving at the debrief closes the day if it isn't closed yet. Idempotent
  // server-side, so a reload here can't count the streak twice.
  useEffect(() => {
    if (view === "done" && day && !day.finishedAt && allClosed) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ---- session — one word, one conversation ------------------------------------

  if (view === "session" && day && item) {
    const closed = item.outcome !== null;
    const canLeave = !closed && talkCanLeave(item.talk);
    const landedHere = item.talk.landed.length;
    const showCard = !closed && cardOpen;
    const thread: TalkEntry[] = pending ? [...item.thread, { t: "you", text: pending }] : item.thread;

    return (
      <div className="dw min-h-full">
        <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col px-4 sm:px-6 lg:min-h-full">
          {/* Top bar: the way back, and every word of the day one tap away. */}
          <div className="flex items-center gap-2 pt-5 lg:pt-7">
            <button
              type="button"
              onClick={() => setView("home")}
              className="dw-btn-quiet flex-none"
              aria-label="Back to today's words"
            >
              <ArrowLeft className="size-4" /> Today
            </button>
            <div className="-mr-4 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 pr-4 [scrollbar-width:none] sm:-mr-6 sm:pr-6">
              {day.items.map((it, i) => {
                const reveal = !it.isNew || started(it) || it.outcome !== null;
                return (
                  <button
                    key={it.seed.id}
                    type="button"
                    onClick={() => select(it)}
                    aria-current={it.seed.id === sel}
                    className="dw-pill"
                  >
                    {it.outcome !== null ? (
                      <Check className="size-3.5" />
                    ) : (
                      <span className="tabular-nums opacity-70">{i + 1}</span>
                    )}
                    {/* A new word stays unnamed in the rail until it has been
                        met — the first look belongs to its card. */}
                    {reveal ? it.seed.word : "new"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 pb-8 pt-5">
            {/* The word itself: open card, or just its meaning once shut. */}
            {showCard ? (
              <WordCard item={item} />
            ) : (
              <div className="dw-card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-0">
                  {closed ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[20px] font-bold tracking-tight">{item.seed.word}</span>
                      <span className="dw-chip dw-chip-accent">{item.seed.pos}</span>
                    </div>
                  ) : (
                    // Shut: the meaning stays, the word doesn't. Finding it
                    // again is the retrieval the whole method leans on.
                    <div className="text-[12.5px] font-semibold uppercase tracking-wide text-[hsl(var(--dw-accent-ink))]">
                      {item.isNew ? "New word" : "Coming back"} · the {item.seed.pos} that means
                    </div>
                  )}
                  <div className="mt-0.5 text-[15.5px] leading-snug text-foreground/90">
                    {item.seed.meaning}
                  </div>
                </div>
                {!closed && (
                  <button type="button" onClick={peek} className="dw-btn-quiet flex-none">
                    <Eye className="size-4" /> Peek
                  </button>
                )}
              </div>
            )}

            {/* The conversation. */}
            <div className="mt-6 flex flex-col gap-3.5">
              {thread.map((e, n) => {
                if (e.t === "said") {
                  return (
                    <div key={n} className="dw-rise">
                      <div className="dw-bubble-them">
                        <p className="whitespace-pre-line text-[17px] leading-[1.6] text-foreground">
                          {e.text}
                        </p>
                      </div>
                      {e.task && (
                        <p className="mt-1.5 pl-1 text-[13px] text-muted-foreground">{e.task}</p>
                      )}
                    </div>
                  );
                }
                if (e.t === "you") {
                  return (
                    <div key={n} className="dw-bubble-you dw-rise">
                      <p className="whitespace-pre-wrap text-[17px] leading-[1.55]">{e.text}</p>
                    </div>
                  );
                }
                if (e.t === "landed") {
                  return (
                    <div key={n} className="dw-rise">
                      <div className="flex justify-end">
                        <span className="dw-chip dw-chip-good dw-pop">
                          <Check className="size-3.5" /> That one&apos;s right
                        </span>
                      </div>
                      {e.reply && (
                        <div className="dw-bubble-them mt-3">
                          <p className="text-[17px] leading-[1.6] text-foreground">{e.reply}</p>
                        </div>
                      )}
                    </div>
                  );
                }
                // The tutor's pencil: ochre, beside their sentence, never the fix.
                return (
                  <div key={n} className="dw-note dw-rise">
                    <div className="text-[12.5px] font-semibold uppercase tracking-wide">
                      {e.missing ? "The word isn't in there yet" : "Almost — one thing"}
                    </div>
                    {e.reply && <p className="mt-1.5 text-[15.5px] leading-relaxed">{e.reply}</p>}
                    {e.quote && (
                      <p className="mt-1.5 text-[15.5px] leading-relaxed">
                        Look at <span className="annot-issue font-semibold">“{e.quote}”</span>
                      </p>
                    )}
                    {e.hint && <p className="mt-1.5 text-[15.5px] leading-relaxed">{e.hint}</p>}
                    <p className="mt-2 text-[13px] font-medium opacity-80">Say it again below.</p>
                  </div>
                );
              })}

              {pending !== null && (
                <div className="dw-bubble-them flex w-fit items-center gap-1.5" aria-label="Reading your sentence">
                  <span className="typing-dot" />
                  <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
                  <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
                </div>
              )}

              {closed && (
                <div className="dw-card dw-rise mt-2 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-full bg-[hsl(var(--dw-good-soft))] text-[hsl(var(--dw-good))]">
                      <Check className="size-5" />
                    </span>
                    <span className="text-[19px] font-bold tracking-tight">{item.seed.word}</span>
                    <span className={cn("dw-chip", OUTCOME_COPY[item.outcome!].chip)}>
                      {OUTCOME_COPY[item.outcome!].label}
                    </span>
                  </div>
                  <p className="mt-2 text-[14.5px] text-muted-foreground">
                    {landedHere > 0
                      ? `${landedHere} ${landedHere === 1 ? "sentence" : "sentences"} of your own. `
                      : "Left for tomorrow, no penalty. "}
                    {returnsLabel(item)}.
                  </p>
                </div>
              )}

              {turnError && <p className="note note-warning">{turnError}</p>}
            </div>
          </div>

          {/* The writing desk: docked, roomy, and never locked. */}
          <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 pb-4 lg:bottom-0 lg:pb-6">
            {closed ? (
              <div className="dw-glass flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <span className="text-[14.5px] text-muted-foreground">
                  {doneCount} of {day.items.length} words done today
                </span>
                <button type="button" className="dw-btn" onClick={next} autoFocus>
                  {firstOpen(day)
                    ? "Next word"
                    : bridgePair(day.items.map((i) => i.seed))
                      ? "One last thing"
                      : "See your day"}
                  <ArrowRight className="size-4" />
                </button>
              </div>
            ) : (
              <div className="dw-glass px-4 pb-3 pt-3.5 sm:px-5">
                <textarea
                  ref={inputRef}
                  autoFocus
                  rows={2}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // The card shuts on the first keystroke, so what gets
                    // written is recalled rather than copied.
                    if (cardOpen && e.target.value.trim()) setCardOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Answer in your own sentence…"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="block max-h-[38vh] min-h-[3.6rem] w-full resize-none bg-transparent px-1 text-[18px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="flex items-center gap-1" aria-hidden>
                      {item.asks.map((_, k) => (
                        <span
                          key={k}
                          className={cn(
                            "h-1.5 w-6 rounded-full transition-colors",
                            k < landedHere ? "bg-[hsl(var(--dw-good))]" : "bg-muted",
                          )}
                        />
                      ))}
                    </span>
                    <span className="text-[12.5px] font-medium text-muted-foreground">
                      {landedHere} of {item.asks.length} right
                    </span>
                    {canLeave && (
                      <button type="button" onClick={() => void leave()} className="dw-btn-quiet -my-1">
                        Leave it for tomorrow
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="dw-btn flex-none"
                    onClick={() => void send()}
                    disabled={!input.trim() || pending !== null}
                  >
                    <Send className="size-4" /> Send
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Below the desk, not above it: scrolling here brings the newest
              line to rest just over the composer instead of underneath it. */}
          <div ref={endRef} />
        </div>
      </div>
    );
  }

  // ---- the bridge — the day's closing bonus -------------------------------------
  //
  // Two of today's words, one sentence. The set is drawn from different
  // semantic fields on purpose, so joining them is a genuine stretch. It never
  // moves the schedule: a bonus that could lapse a word would make the honest
  // scheduling everywhere else a lie.

  if (view === "bridge" && day) {
    const pair = bridgePair(day.items.map((i) => i.seed));
    const ok = day.bridge?.ok === true;
    const tried = day.bridge !== null && !ok;
    if (!pair) return null;
    const [a, b] = pair;

    return (
      <div className="dw min-h-full">
        <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:py-12">
          <div className="flex items-center justify-between gap-3">
            <span className="dw-chip dw-chip-accent">
              <Sparkles className="size-3.5" /> Bonus round
            </span>
            <button type="button" className="dw-btn-quiet" onClick={() => setView("done")}>
              Skip <ArrowRight className="size-4" />
            </button>
          </div>
          <h2 className="mt-5 text-[30px] font-bold leading-tight tracking-tight">
            One sentence. Both words.
          </h2>
          <p className="mt-2 text-[15.5px] text-muted-foreground">
            They have nothing to do with each other, and that&apos;s the point. Making the link is
            what makes them stick.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[a, b].map((w) => (
              <div key={w.id} className="dw-card p-5">
                <div className="text-[22px] font-bold tracking-tight">{w.word}</div>
                <div className="mt-1 text-[14px] text-muted-foreground">{w.meaning}</div>
              </div>
            ))}
          </div>

          {ok ? (
            <div className="dw-card dw-rise mt-5 p-6">
              <span className="dw-chip dw-chip-good dw-pop">
                <Check className="size-3.5" /> Both, in one sentence
              </span>
              <p className="mt-3 text-[17px] leading-relaxed">{day.bridge!.text}</p>
              <button type="button" className="dw-btn mt-5" onClick={() => setView("done")}>
                See your day <ArrowRight className="size-4" />
              </button>
            </div>
          ) : (
            <>
              {tried && (
                <div className="dw-note mt-5">
                  Not quite both of them yet. Have another go, or skip — the bridge never costs you
                  anything.
                </div>
              )}
              <div className="dw-glass mt-5 px-4 pb-3 pt-3.5 sm:px-5">
                <textarea
                  autoFocus
                  rows={2}
                  value={bridgeText}
                  onChange={(e) => setBridgeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendBridge();
                    }
                  }}
                  placeholder={`Use “${a.word}” and “${b.word}” in one sentence…`}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="block min-h-[3.6rem] w-full resize-none bg-transparent px-1 text-[18px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="dw-btn"
                    onClick={() => void sendBridge()}
                    disabled={!bridgeText.trim() || bridgeBusy}
                  >
                    <Send className="size-4" /> Send
                  </button>
                </div>
              </div>
              {turnError && <p className="note note-warning mt-3">{turnError}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- the day's debrief ----------------------------------------------------------

  if (view === "done" && day) {
    const clean = day.items.filter((i) => i.outcome === "clean").length;
    const sentences = day.items.reduce((n, i) => n + i.talk.landed.length, 0);
    return (
      <div className="dw min-h-full">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
          <button type="button" className="dw-btn-quiet" onClick={() => setView("home")}>
            <ArrowLeft className="size-4" /> Today
          </button>

          <div className="dw-hero dw-rise mt-4 p-7 sm:p-9">
            <div className="text-[13px] font-semibold uppercase tracking-wider opacity-80">
              Your day
            </div>
            <h2 className="mt-2 text-[32px] font-bold leading-tight tracking-tight sm:text-[38px]">
              {sentences} {sentences === 1 ? "sentence" : "sentences"} of your own.
            </h2>
            <p className="mt-2 max-w-xl text-[15.5px] leading-relaxed opacity-90">
              {clean} of {day.items.length} words came out right first time, from memory. The rest
              come back sooner — that spacing is what makes them stay.
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {day.items.map((it) => (
              <div key={it.seed.id} className="dw-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[19px] font-bold tracking-tight">{it.seed.word}</span>
                  <span className="dw-chip dw-chip-accent">{it.seed.pos}</span>
                  {it.outcome && (
                    <span className={cn("dw-chip", OUTCOME_COPY[it.outcome].chip)}>
                      {OUTCOME_COPY[it.outcome].label}
                    </span>
                  )}
                  <span className="ml-auto text-[12.5px] text-muted-foreground">
                    {returnsLabel(it)}
                  </span>
                </div>
                {it.talk.landed.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {it.talk.landed.map((line, k) => (
                      <li key={k} className="text-[15.5px] leading-relaxed text-foreground/85">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {day.bridge?.ok && (
              <div className="dw-card p-5">
                <span className="dw-chip dw-chip-accent">
                  <Sparkles className="size-3.5" /> The bridge
                </span>
                <p className="mt-3 text-[15.5px] leading-relaxed text-foreground/85">
                  {day.bridge.text}
                </p>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] text-muted-foreground">
              Tomorrow: {perDay} new ones, plus whatever the schedule says is ripe.
            </p>
            <Link href="/phrasebook" className="dw-btn">
              Open your Phrasebook <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---- home — today at a glance ----------------------------------------------------

  const hasDay = !!day && day.items.length > 0;
  const total = hasDay ? day!.items.length : preview.remainingNew.length + preview.reviews.length;
  const finished = !!day?.finishedAt;
  // Until the catalogue exists there is nothing to count, and the server mints
  // it on the first session — so an empty catalogue means "not started yet",
  // never "finished for today".
  const nothingDue = !hasDay && catalog.length > 0 && total === 0;
  const inProgress = hasDay && !finished && (doneCount > 0 || day!.items.some(started));
  const minutes = Math.max(2, Math.round((total - doneCount) * 2));

  const heroTitle = finished
    ? "Done for today."
    : nothingDue
      ? "Nothing due today."
      : allClosed
        ? "Every word is done."
        : inProgress
          ? "Pick up where you left off."
          : "Today's words are ready.";
  const heroBody = finished
    ? "Coming back tomorrow is the whole trick."
    : nothingDue
      ? "Spacing does the work while you're away. Your Phrasebook is open if you want more."
      : allClosed
        ? "One small thing left to close the day."
        : inProgress
          ? "Everything you've said so far is saved — the conversation is exactly as you left it."
          : "Each word is a short conversation. You answer in your own sentence, and you say it until it's right.";

  return (
    <div className="dw min-h-full">
      <div className="mx-auto w-full max-w-[1080px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Hero: where today stands, and the one thing to do next. */}
          <div className="dw-hero dw-rise flex flex-col justify-between gap-6 p-7 sm:flex-row sm:items-center sm:p-9 lg:col-span-2">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold uppercase tracking-wider opacity-80">
                Daily words
              </div>
              <h1 className="mt-2 text-[32px] font-bold leading-[1.1] tracking-tight text-white sm:text-[40px]">
                {heroTitle}
              </h1>
              <p className="mt-2.5 max-w-md text-[15.5px] leading-relaxed opacity-90">{heroBody}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {checking ? (
                  <span className="text-[14px] opacity-80">Checking where you are…</span>
                ) : nothingDue ? (
                  <Link href="/phrasebook" className="dw-btn dw-btn-onhero">
                    Practise your Phrasebook <ArrowRight className="size-4" />
                  </Link>
                ) : finished ? (
                  <button type="button" className="dw-btn dw-btn-onhero" onClick={() => setView("done")}>
                    See your day <ArrowRight className="size-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dw-btn dw-btn-onhero"
                    onClick={() => void start()}
                    disabled={building}
                  >
                    {building ? "Writing your conversations…" : inProgress || allClosed ? "Continue" : "Start"}
                    {!building && <ArrowRight className="size-4" />}
                  </button>
                )}
                {!checking && !finished && !nothingDue && !building && (
                  <span className="text-[13.5px] opacity-80">about {minutes} minutes</span>
                )}
              </div>
              {homeError && (
                <p className="mt-4 rounded-[14px] bg-white/15 px-4 py-2.5 text-[14px]">{homeError}</p>
              )}
            </div>
            <Ring done={doneCount} total={total} />
          </div>

          {/* Streak. */}
          <div className="dw-card dw-rise p-6">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                Streak
              </span>
              <span className="grid size-9 place-items-center rounded-full bg-[hsl(var(--dw-accent-soft))] text-[hsl(var(--dw-accent-ink))]">
                <Flame className="size-[18px]" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[44px] font-bold leading-none tracking-tight tabular-nums">
                {info.streak}
              </span>
              <span className="text-[14px] text-muted-foreground">
                {info.streak === 1 ? "day in a row" : "days in a row"}
              </span>
            </div>
            <div className="mt-5 flex h-20 items-end gap-2">
              {week.counts.map((v, i) => (
                <div key={week.days[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div
                    className={cn(
                      "w-full rounded-[7px]",
                      week.days[i] === today
                        ? "bg-[hsl(var(--dw-accent))]"
                        : v
                          ? "bg-[hsl(var(--dw-accent)/0.35)]"
                          : "bg-muted",
                    )}
                    style={{ height: v ? `${Math.max(22, Math.round((v / week.max) * 100))}%` : "6px" }}
                  />
                  <span className="text-[10.5px] font-medium text-muted-foreground">
                    {"MTWTFSS"[i]}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground">
              {week.total} right first time this week
              {info.freezes > 0 && ` · ${info.freezes} ${info.freezes === 1 ? "freeze" : "freezes"} in hand`}
            </p>
          </div>
        </div>

        {/* Today's set: every word, where it stands, one tap from its conversation. */}
        {!nothingDue && (
          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[19px] font-bold tracking-tight">Today&apos;s set</h2>
              <span className="text-[13px] text-muted-foreground">
                {hasDay
                  ? "Tap a word to open its conversation"
                  : "New words stay hidden until you meet them"}
              </span>
            </div>

            {building ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: Math.max(3, total || perDay) }, (_, i) => (
                  <div key={i} className="dw-tile p-5">
                    <div className="dw-shimmer h-6 w-28" />
                    <div className="dw-shimmer mt-3 h-4 w-full" />
                    <div className="dw-shimmer mt-2 h-4 w-2/3" />
                  </div>
                ))}
              </div>
            ) : hasDay ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {day!.items.map((it) => {
                  const reveal = !it.isNew || started(it) || it.outcome !== null;
                  const said = it.talk.landed.length;
                  return (
                    <button
                      key={it.seed.id}
                      type="button"
                      className="dw-tile dw-rise p-5"
                      onClick={() => enter(day!, it.seed.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[20px] font-bold tracking-tight">
                          {reveal ? it.seed.word : "· · · · ·"}
                        </span>
                        {it.outcome !== null ? (
                          <span className={cn("dw-chip flex-none", OUTCOME_COPY[it.outcome].chip)}>
                            <Check className="size-3.5" /> {OUTCOME_COPY[it.outcome].label}
                          </span>
                        ) : started(it) ? (
                          <span className="dw-chip dw-chip-accent flex-none">In progress</span>
                        ) : (
                          <span className="dw-chip flex-none">{it.isNew ? "New" : "Review"}</span>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 min-h-[2.6em] text-[14px] leading-snug text-muted-foreground">
                        {it.seed.meaning}
                      </p>
                      <div className="mt-4 flex items-center gap-1.5">
                        {it.asks.map((_, k) => (
                          <span
                            key={k}
                            className={cn(
                              "h-1.5 flex-1 rounded-full",
                              k < said ? "bg-[hsl(var(--dw-good))]" : "bg-muted",
                            )}
                          />
                        ))}
                        <span className="ml-1.5 text-[12px] font-medium tabular-nums text-muted-foreground">
                          {said}/{it.asks.length}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {preview.reviews.map((p) => (
                  <div key={p.id} className="dw-tile p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[20px] font-bold tracking-tight">{p.text}</span>
                      <span className="dw-chip flex-none">Review</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[14px] leading-snug text-muted-foreground">
                      {p.meaning}
                    </p>
                  </div>
                ))}
                {(catalog.length === 0
                  ? Array.from({ length: perDay }, (_, i) => `first-${i}`)
                  : preview.remainingNew.map((w) => w.id)
                ).map((id) => (
                  <div key={id} className="dw-tile p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[20px] font-bold tracking-tight text-muted-foreground/60">
                        · · · · ·
                      </span>
                      <span className="dw-chip dw-chip-accent flex-none">New</span>
                    </div>
                    <p className="mt-2 text-[14px] leading-snug text-muted-foreground">
                      {catalog.length === 0
                        ? "Written for you when you start."
                        : "You'll meet it in its conversation."}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Growth, and how the mode works — the quiet half of the page. */}
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="dw-card p-6">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Real growth
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(
                [
                  [stats.new + stats.learning + stats.mastered, "Met"],
                  [stats.mastered, "Mastered"],
                  [newWordsThisWeek(store.vocab, today), "This week"],
                ] as [number, string][]
              ).map(([value, label]) => (
                <div key={label} className="rounded-[16px] bg-[hsl(var(--dw-accent-soft))] px-2 py-3 text-center">
                  <div className="text-[24px] font-bold leading-none tabular-nums text-[hsl(var(--dw-accent-ink))]">
                    {value}
                  </div>
                  <div className="mt-1.5 text-[11.5px] font-medium text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground">
              {vocabSize(store.vocab)} distinct words in sentences you actually wrote — the only
              vocabulary count that means anything.
            </p>
          </div>

          <div className="dw-card p-6 lg:col-span-2">
            <div className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              How a word becomes yours
            </div>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["Meet it", "The card, once. It closes when you start typing, so the sentence comes from memory."],
                  ["Say it", "Someone says something that needs the word. You answer in your own sentence."],
                  ["Until it's right", "A sentence that's off stays open. You get a pointer, never the answer, and say it again."],
                ] as [string, string][]
              ).map(([title, body], i) => (
                <li key={title}>
                  <span className="grid size-8 place-items-center rounded-full bg-[hsl(var(--dw-accent-soft))] text-[13px] font-bold text-[hsl(var(--dw-accent-ink))]">
                    {i + 1}
                  </span>
                  <div className="mt-2.5 text-[15.5px] font-semibold">{title}</div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-[13px] text-muted-foreground">
              Every word you meet lands in your{" "}
              <Link href="/phrasebook" className="font-semibold text-[hsl(var(--dw-accent-ink))] hover:underline">
                Phrasebook
              </Link>{" "}
              and comes back on a spaced schedule.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
