"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, Send } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type { NewsLevel, WordOutcome, WordPos, WordRound, WordSeed } from "@/types";
import { fetchWordSession, wordTurn } from "@/lib/client/clientApi";
import {
  TALK_ASKS_NEW,
  TALK_ASKS_REVIEW,
  bridgePair,
  buildDaySet,
  catalogById,
  judgeBridge,
  talkApply,
  talkCanLeave,
  talkDone,
  talkOutcome,
  talkStart,
  turnLedgerVerdict,
  wordToPhrase,
  type TalkState,
} from "@/lib/shared/words";
import { SRS_INTERVALS, srsSummary } from "@/lib/shared/srs";
import { newWordsThisWeek, vocabSize } from "@/lib/shared/stats";
import { addDays, parseDayKey, todayKey } from "@/lib/shared/date";
import { streakInfo } from "@/lib/shared/streak";
import { playChime } from "@/lib/client/sound";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";

/**
 * Daily words (docs/DAILY_WORDS.md) — the one mode that hands the learner
 * language instead of waiting for them to meet it.
 *
 * A day is a small set: the review words the schedule says are ripe, then a
 * few brand-new high-frequency words. Each word is a short conversation, and
 * the conversation is the method:
 *
 *   MEET   the card opens the thread — form, meaning, a real example, the
 *          partners it travels with. It closes on the first keystroke, so the
 *          first sentence is still pulled from memory rather than copied.
 *   SAY    someone says something that calls for the word; they answer in
 *          their own sentence. A sentence that isn't right yet keeps the same
 *          line open, with help that grows one notch per miss and stops at a
 *          frame with a gap — never the corrected sentence.
 *   AGAIN  the same person carries the scene on, and the word is wanted again
 *          in a different form. A new word takes three landed sentences.
 *
 * This replaced meet → drill → use, which asked for one typed word and one
 * sentence per word and moved on whatever the sentence looked like. Learners
 * told us that didn't feel like producing English, and they were right: the
 * production was a single line. The drill ladder (`pickDrill` and friends in
 * lib/shared/words) is parked, not deleted, until the conversation has been
 * lived with.
 *
 * Clean all the way through earns a longer interval; anything with help stays
 * due. Then the word joins the same pool the Phrasebook practices — one
 * curriculum, three surfaces.
 */

/** One thing the partner says, and the instruction that goes with the first. */
interface Ask {
  said: string;
  task?: string;
}

interface SessionItem {
  id: string;
  word: string;
  pos: WordPos;
  meaning: string;
  example: string;
  collocations: string[];
  /** New today, or a scheduled review (fewer asks, and the card starts shut). */
  isNew: boolean;
  /** The curriculum entry, for a new word — what joins the library once used. */
  seed?: WordSeed;
  /** The script: the opening moment, then the lines that carry it on. */
  asks: Ask[];
  /** Worked examples using the word elsewhere — inert input, never an answer. */
  examples: string[];
  /** Leitner box before today — the debrief computes "returns in…" from it. */
  prevBox: number;
}

interface ItemResult {
  outcome: WordOutcome;
  /** Every sentence that landed for this word, in order. */
  sentences: string[];
  prevBox: number;
}

/**
 * The thread is one running manuscript for the whole day: each word's card,
 * what was said, what they answered, and the note that came back.
 */
type Entry =
  | { t: "word"; i: number }
  | { t: "said"; text: string; task?: string }
  | { t: "you"; text: string }
  | { t: "landed"; reply: string }
  | { t: "note"; missing: boolean; reply: string; quote?: string; hint?: string }
  | { t: "closed"; i: number; outcome: WordOutcome }
  | { t: "error"; text: string };

type View =
  | { kind: "home" }
  | { kind: "loading" }
  | { kind: "session" }
  | { kind: "bridge" }
  | { kind: "done" };

const OUTCOME_TILE: Record<WordOutcome, { mark: string; cls: string }> = {
  clean: { mark: "✓", cls: "border-brand bg-brand-muted text-brand-ink" },
  helped: { mark: "✓", cls: "border-ochre-line bg-ochre-tint text-gold" },
  missed: { mark: "—", cls: "border-input bg-muted text-muted-foreground" },
};

const OUTCOME_LABEL: Record<WordOutcome, { text: string; cls: string }> = {
  clean: { text: "yours", cls: "text-brand-ink" },
  helped: { text: "used · with help", cls: "text-gold" },
  missed: { text: "not yet", cls: "text-muted-foreground" },
};

/** "returns in…" copy for the next interval a clean word earned. */
function intervalLabel(days: number): string {
  if (days <= 0) return "stays due — today";
  if (days === 1) return "comes back tomorrow";
  if (days === 7) return "comes back in a week";
  return `comes back in ${days} days`;
}

/** The word card: form, part of speech, meaning, a real example, its partners. */
function WordCard({ item, muted }: { item: SessionItem; muted?: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="font-serif text-[26px] font-semibold leading-none text-foreground">
          {item.word}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {item.pos}
        </span>
      </div>
      <div className="mt-2 text-[15px] text-foreground/90">{item.meaning}</div>
      {item.example && (
        <p
          className={cn(
            "mt-2.5 select-none border-l-2 border-oxford-line pl-3 font-serif text-[15px] italic",
            muted ? "text-muted-foreground" : "text-foreground/90",
          )}
        >
          “{item.example}”
        </p>
      )}
      {item.collocations.length > 0 && (
        <div className="mt-2.5 text-[12.5px] text-muted-foreground">
          travels with:{" "}
          <span className="text-foreground/80">{item.collocations.join(" · ")}</span>
        </div>
      )}
    </>
  );
}

export function DailyWords() {
  const {
    store,
    issueWordDay,
    finishWordSession,
    reviewPhrases,
    collectPhrase,
    recordProductions,
  } = useStore();
  const pool = store.minedPhrases;
  const srs = store.phraseSrs;
  const level: NewsLevel = store.newsLevel;
  const perDay = store.settings.wordsPerDay;

  const [view, setView] = useState<View>({ kind: "home" });
  const [items, setItems] = useState<SessionItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [talk, setTalk] = useState<TalkState>(() => talkStart(1));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  /** The partner is reading. Only Send waits on this — the composer never
   *  locks, so the next thought can be typed while the last one is judged. */
  const [busy, setBusy] = useState(false);
  /** The current word's card. Open on a first meeting, shut once they type. */
  const [cardOpen, setCardOpen] = useState(false);
  /** Every word has been through its conversation; the day can be closed. */
  const [dayOver, setDayOver] = useState(false);
  const [results, setResults] = useState<ItemResult[]>([]);
  /** Set when the day couldn't be built — shown instead of a silent retry. */
  const [startError, setStartError] = useState("");
  const [bridge, setBridge] = useState("");
  const [bridgeDone, setBridgeDone] = useState<null | boolean>(null);
  const startedAt = useRef<number>(0);
  /** The sentence kept per item for a future `echo`. */
  const lines = useRef<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const today = todayKey();

  // Today's set is drawn once and then fixed: reopening never reshuffles it,
  // and finishing tomorrow's words early is not a thing you can do. Reviews
  // come from the curriculum only — captured highlights and mission targets
  // are the Phrasebook's business, not this mode's.
  const catalog = store.wordCatalog;
  const { remainingNew, reviews } = useMemo(
    () =>
      buildDaySet({
        catalog,
        wordDays: store.wordDays,
        pool,
        srs,
        level,
        perDay,
        today,
      }),
    [catalog, store.wordDays, pool, srs, level, perDay, today],
  );

  // Until the catalogue exists there is nothing to count, and the server mints
  // it on the first session — so an empty catalogue means "not started yet",
  // never "finished for today".
  const sessionSize = remainingNew.length + reviews.length;
  const doneToday = catalog.length > 0 && sessionSize === 0;
  /** How many of today's issued words are already in the pool. */
  const metToday = (store.wordDays[today] ?? []).filter((id) =>
    pool.some((p) => p.id === id),
  ).length;

  const inCatalog = useMemo(() => catalogById(catalog), [catalog]);
  const stats = useMemo(
    () => srsSummary(pool.filter((p) => inCatalog.has(p.id)).map((p) => p.id), srs),
    [pool, inCatalog, srs],
  );
  const info = streakInfo(store.profile, today);

  // This week's clean applications, Monday-first.
  const week = useMemo(() => {
    const monday = addDays(today, -((parseDayKey(today).getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const counts = days.map((d) => store.phraseApplied[d] ?? 0);
    return { days, counts, total: counts.reduce((a, b) => a + b, 0), max: Math.max(...counts, 1) };
  }, [store.phraseApplied, today]);

  // ---- starting a session ---------------------------------------------------

  /** Both new words and reviews are curriculum entries, so both build from the
   *  seed — the pool row only supplies identity and the schedule. */
  function itemFromSeed(seed: WordSeed, isNew: boolean, round: WordRound): SessionItem {
    const examples = [...round.examples, seed.example]
      .filter((e) => e && e.trim())
      .filter((e, n, arr) => arr.findIndex((x) => x.trim() === e.trim()) === n)
      .slice(0, 3);
    // A round whose follow-ups didn't survive the server's checks is simply a
    // shorter conversation — never a padded one.
    const asks: Ask[] = [
      { said: round.setup, task: round.task },
      ...(round.followups ?? []).map((said) => ({ said })),
    ].slice(0, isNew ? TALK_ASKS_NEW : TALK_ASKS_REVIEW);
    return {
      id: seed.id,
      word: seed.word,
      pos: seed.pos,
      meaning: seed.meaning,
      example: seed.example,
      collocations: seed.collocations,
      isNew,
      ...(isNew ? { seed } : {}),
      asks,
      examples,
      prevBox: srs[seed.id]?.box ?? 0,
    };
  }

  /** Put a word on the table: its card, then the line that opens its scene. */
  function openWord(item: SessionItem, i: number): Entry[] {
    return [
      { t: "word", i },
      { t: "said", text: item.asks[0].said, task: item.asks[0].task },
    ];
  }

  /**
   * Open a session.
   *
   * The whole day arrives from one call: which words are due, whether the
   * curriculum needed topping up, and the script each word's conversation runs
   * on. There is no bundled curriculum behind a failure here, so a failure is
   * a real failure and says so rather than running a day of generic moments.
   */
  async function start() {
    if (view.kind === "loading") return;
    setStartError("");
    setView({ kind: "loading" });

    let session: Awaited<ReturnType<typeof fetchWordSession>>;
    try {
      session = await fetchWordSession();
    } catch {
      setStartError("Couldn't build today's words. Have another go in a moment.");
      setView({ kind: "home" });
      return;
    }

    const met = new Set(pool.map((p) => p.id));
    const byId = new Map(session.rounds.map((r) => [r.id, r]));
    // Reviews first: a warm, winnable start before the unfamiliar words.
    const ordered = [
      ...session.words.filter((w) => met.has(w.id)),
      ...session.words.filter((w) => !met.has(w.id)),
    ];
    const built = ordered
      .map((seed) => {
        const round = byId.get(seed.id);
        return round ? itemFromSeed(seed, !met.has(seed.id), round) : null;
      })
      .filter((i): i is SessionItem => !!i);

    if (built.length === 0) {
      setStartError("Couldn't build today's words. Have another go in a moment.");
      setView({ kind: "home" });
      return;
    }

    // Fix today's set now, so a reload mid-session shows the same words.
    issueWordDay(session.todaysNew.map((w) => w.id));

    setItems(built);
    setIdx(0);
    setTalk(talkStart(built[0].asks.length));
    setEntries(openWord(built[0], 0));
    setCardOpen(built[0].isNew);
    setInput("");
    setBusy(false);
    setDayOver(false);
    setResults([]);
    setBridge("");
    setBridgeDone(null);
    lines.current = {};
    startedAt.current = Date.now();
    setView({ kind: "session" });
  }

  // Keep the newest turn in view, and the writing field as tall as its text.
  useEffect(() => {
    if (view.kind === "session") endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, busy, view.kind]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input, view.kind]);

  // ---- the conversation -----------------------------------------------------

  /**
   * A word's conversation is over: schedule it honestly and bring on the next.
   *
   * Clean → an earned interval. Helped → no change, so it stays due. Missed →
   * a first meeting is never punished; a review lapses.
   */
  function closeWord(item: SessionItem, state: TalkState): Entry[] {
    const outcome = talkOutcome(state);

    // A new word joins the library once its conversation has happened — that's
    // when it stops being the app's word and starts being theirs.
    if (item.seed) collectPhrase(wordToPhrase(item.seed, today));
    if (outcome === "clean") reviewPhrases([item.id], true);
    else if (outcome === "missed" && !item.isNew) reviewPhrases([item.id], false);

    // Keep their first landed sentence for a future `echo`.
    if (state.landed[0]) lines.current[item.id] = state.landed[0];
    setResults((rs) => [...rs, { outcome, sentences: state.landed, prevBox: item.prevBox }]);

    const closing: Entry[] = [{ t: "closed", i: idx, outcome }];
    const nextItem = items[idx + 1];
    if (!nextItem) {
      setDayOver(true);
      return closing;
    }
    setIdx(idx + 1);
    setTalk(talkStart(nextItem.asks.length));
    setCardOpen(nextItem.isNew);
    return [...closing, ...openWord(nextItem, idx + 1)];
  }

  /** Send the sentence in the composer and take the partner's answer. */
  async function send() {
    const item = items[idx];
    const sentence = input.trim();
    if (!item || !sentence || busy || dayOver || talkDone(talk)) return;

    const ask = item.asks[talk.ask];
    // A follow-up is judged with the moment it grew out of, or "did it answer
    // what was said" has nothing to stand on.
    const said = talk.ask === 0 ? ask.said : `${item.asks[0].said}\n${ask.said}`;

    // Their words go up at once; the wait belongs to the partner, not to them.
    setEntries((es) => [...es.filter((e) => e.t !== "error"), { t: "you", text: sentence }]);
    setInput("");
    setCardOpen(false);
    setBusy(true);

    let turn: Awaited<ReturnType<typeof wordTurn>>;
    try {
      turn = await wordTurn(
        { word: item.word, pos: item.pos, meaning: item.meaning },
        said,
        sentence,
        talk.misses,
      );
    } catch {
      // Nothing was judged, so nothing is recorded or counted: hand the
      // sentence back rather than make them type it twice.
      setEntries((es) => [
        ...es.slice(0, -1),
        { t: "error", text: "Couldn't read that one just now — send it again." },
      ]);
      setInput((cur) => cur || sentence);
      setBusy(false);
      return;
    }

    // Every sent sentence is kept, landed or not, the moment it is judged —
    // and before the schedule writes, so closing the tab can cost a schedule
    // tick but never something they wrote.
    recordProductions([
      {
        surface: "words",
        itemSlug: item.id,
        mode: "talk",
        prompt: ask.said,
        text: sentence,
        verdict: turnLedgerVerdict(talk, turn.verdict),
        ...(turn.hint || turn.reply ? { note: turn.hint || turn.reply } : {}),
      },
    ]);

    const after = talkApply(talk, { type: "turn", verdict: turn.verdict, sentence });
    setTalk(after);

    if (turn.verdict === "landed") {
      const landed: Entry = { t: "landed", reply: turn.reply };
      const then = talkDone(after)
        ? closeWord(item, after)
        : [{ t: "said", text: item.asks[after.ask].said } as Entry];
      setEntries((es) => [...es, landed, ...then]);
    } else {
      setEntries((es) => [
        ...es,
        {
          t: "note",
          missing: turn.verdict === "missing",
          reply: turn.reply,
          ...(turn.quote ? { quote: turn.quote } : {}),
          ...(turn.hint ? { hint: turn.hint } : {}),
        },
      ]);
    }
    setBusy(false);
    inputRef.current?.focus();
  }

  /** Reopen the card. Free to do, but the word no longer counts as clean. */
  function peek() {
    if (cardOpen) return;
    setCardOpen(true);
    setTalk((t) => talkApply(t, { type: "peek" }));
  }

  /** The way out, offered only after real effort on one line. */
  function leave() {
    const item = items[idx];
    if (!item || busy || !talkCanLeave(talk)) return;
    const after = talkApply(talk, { type: "leave" });
    setTalk(after);
    setEntries((es) => [...es, ...closeWord(item, after)]);
  }

  /** The day's last word is done: on to the bridge, or straight to the debrief. */
  function closeDay() {
    if (bridgePair(items)) setView({ kind: "bridge" });
    else finish();
  }

  /**
   * Judge the day's closing bridge, and keep it.
   *
   * The bridge never touches the schedule — a bonus that could lapse a word
   * would make the honest scheduling everywhere else a lie — but it is still
   * production, so it still belongs in the ledger.
   */
  function submitBridge(a: SessionItem, b: SessionItem) {
    const sentence = bridge.trim();
    if (!sentence) return;
    const ok = judgeBridge(a.word, b.word, sentence);
    recordProductions([
      {
        surface: "bridge",
        mode: "bridge",
        prompt: `Use "${a.word}" and "${b.word}" in one sentence.`,
        text: sentence,
        verdict: ok ? "clean" : "missed",
      },
    ]);
    setBridgeDone(ok);
  }

  /** Close the day: streak, totals, vocabulary, and the lines kept for echo. */
  function finish(extraSentences: string[] = []) {
    const sentences = [...results.flatMap((r) => r.sentences), ...extraSentences].filter(Boolean);
    finishWordSession({
      sentences,
      lines: lines.current,
      durationMs: Date.now() - startedAt.current,
    });
    if (store.settings.sound) playChime();
    setView({ kind: "done" });
  }

  // ---- building the day ------------------------------------------------------
  //
  // The words and their conversations are written for this learner when they
  // start, which takes a few seconds. A disabled button for that long reads as
  // a frozen page; a thread taking shape reads as something being made.

  if (view.kind === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl animate-fade-in px-5 py-8 sm:px-6 lg:px-10 lg:py-12">
        <div className="kicker">Today&apos;s words</div>
        <p className="mt-3 font-serif text-[20px] leading-snug text-foreground">
          Writing today&apos;s conversations for you…
        </p>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          Nothing here comes off a list, so this takes a few seconds.
        </p>
        <div className="mt-8 flex flex-col gap-7" aria-hidden>
          {[72, 88, 54].map((w, i) => (
            <div key={i}>
              <div className="h-2.5 w-16 animate-pulse bg-muted" />
              <div className="mt-3 h-4 animate-pulse bg-muted" style={{ width: `${w}%` }} />
              <div className="mt-2 h-4 animate-pulse bg-muted" style={{ width: `${w - 28}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- session — one running conversation ------------------------------------

  if (view.kind === "session") {
    const item = items[idx];
    if (!item) return null;
    const canLeave = talkCanLeave(talk);
    const landedHere = Math.min(talk.ask, item.asks.length);

    return (
      <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col px-5 sm:px-6 lg:min-h-full lg:px-10">
        <div className="flex items-center justify-between gap-3 pt-6 lg:pt-8">
          <button
            type="button"
            onClick={() => setView({ kind: "home" })}
            className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
          >
            ‹ Today&apos;s words
          </button>
          <div className="flex items-center gap-1.5">
            {items.map((it, i) => {
              const done = results[i];
              const tile = done ? OUTCOME_TILE[done.outcome] : null;
              return (
                <span
                  key={it.id}
                  title={done ? `${it.word} — ${OUTCOME_LABEL[done.outcome].text}` : `Word ${i + 1}`}
                  className={cn(
                    "flex size-[22px] items-center justify-center border font-mono text-[11px]",
                    tile
                      ? tile.cls
                      : i === idx
                        ? "border-brand bg-card text-brand-ink"
                        : "border-border bg-transparent text-muted-foreground/60",
                  )}
                >
                  {tile ? tile.mark : i + 1}
                </span>
              );
            })}
          </div>
        </div>

        {/* The thread. Everything said today stays on the page above the line
            being written, the way a conversation does. */}
        <div className="flex-1 pb-8">
          {entries.map((e, n) => {
            if (e.t === "word") {
              const w = items[e.i];
              const current = e.i === idx && !dayOver;
              const open = current && cardOpen;
              return (
                <div key={n} className={cn("animate-fade-in", n === 0 ? "mt-6" : "mt-12 border-t border-border pt-8")}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="kicker">
                      {w.isNew ? "New word" : "Coming back"} · {e.i + 1} of {items.length}
                    </span>
                    {current && !open && (
                      <button
                        type="button"
                        onClick={peek}
                        className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand [&_svg]:size-3.5"
                      >
                        <Eye /> Peek at the card
                      </button>
                    )}
                  </div>
                  {open || !current ? (
                    <div className={cn("mt-3 border border-border bg-card", current ? "p-6" : "px-5 py-4")}>
                      {current ? (
                        <>
                          <WordCard item={w} />
                          {w.examples.length > 0 && (
                            <ul className="mt-3 space-y-1 border-t border-border pt-3">
                              {w.examples.map((x, k) => (
                                <li
                                  key={k}
                                  className="select-none font-serif text-[15px] italic leading-relaxed text-muted-foreground"
                                >
                                  “{x}”
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="mt-4 text-[13px] text-muted-foreground">
                            Read it once. It closes when you start typing — the sentence comes from memory.
                          </p>
                        </>
                      ) : (
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                          <span className="font-serif text-[18px] font-semibold text-foreground">{w.word}</span>
                          <span className="text-[13.5px] text-muted-foreground">{w.meaning}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Shut: the meaning stays, the word doesn't. Finding it
                    // again is the retrieval the whole method leans on.
                    <div className="mt-3 border border-dashed border-input px-5 py-4">
                      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        The word that means
                      </div>
                      <div className="mt-1 text-[16px] text-foreground">
                        {w.meaning}{" "}
                        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                          · {w.pos}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            if (e.t === "said") {
              return (
                <div key={n} className="mt-7 animate-fade-in">
                  <div className="kicker text-brand">They say</div>
                  <p className="mt-1.5 whitespace-pre-line font-serif text-[18px] leading-[1.6] text-foreground">
                    {e.text}
                  </p>
                  {e.task && <p className="mt-1.5 text-[13.5px] text-muted-foreground">{e.task}</p>}
                </div>
              );
            }

            if (e.t === "you") {
              return (
                <div key={n} className="mt-7 animate-fade-in border-l-2 border-oxford-line pl-4">
                  <div className="kicker">You</div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[18px] leading-[1.6] text-foreground">
                    {e.text}
                  </p>
                </div>
              );
            }

            if (e.t === "landed") {
              return (
                <div key={n} className="mt-4 animate-fade-in">
                  <div className="font-mono text-[11px] uppercase tracking-wide text-brand-ink">
                    ✓ That one&apos;s right
                  </div>
                  {e.reply && (
                    <p className="mt-1.5 font-serif text-[18px] leading-[1.6] text-foreground">{e.reply}</p>
                  )}
                </div>
              );
            }

            if (e.t === "note") {
              // The tutor's pencil: ochre, in the margin, and never the fix.
              return (
                <div
                  key={n}
                  className="mt-4 animate-fade-in border-l-2 border-ochre-line bg-ochre-tint px-4 py-3.5 text-gold"
                >
                  <div className="font-mono text-[11px] uppercase tracking-wide">
                    {e.missing ? "Not in there yet" : "Almost — one thing"}
                  </div>
                  {e.reply && <p className="mt-1.5 text-[15.5px] leading-relaxed">{e.reply}</p>}
                  {e.quote && (
                    <p className="mt-1.5 text-[15.5px] leading-relaxed">
                      Look at <span className="annot-issue font-medium">“{e.quote}”</span>
                    </p>
                  )}
                  {e.hint && <p className="mt-1.5 text-[15.5px] leading-relaxed">{e.hint}</p>}
                  <p className="mt-2 font-mono text-[10.5px] uppercase tracking-wide opacity-80">
                    Say it again ↓
                  </p>
                </div>
              );
            }

            if (e.t === "closed") {
              const w = items[e.i];
              const label = OUTCOME_LABEL[e.outcome];
              return (
                <div key={n} className="mt-7 flex animate-fade-in flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="font-serif text-[17px] font-semibold text-foreground">{w.word}</span>
                  <span className={cn("font-mono text-[10.5px] uppercase tracking-wide", label.cls)}>
                    {label.text}
                  </span>
                  <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
                    ·{" "}
                    {e.outcome === "clean"
                      ? intervalLabel(SRS_INTERVALS[Math.min(SRS_INTERVALS.length - 1, w.prevBox + 1)])
                      : "comes back tomorrow"}
                  </span>
                </div>
              );
            }

            return (
              <p key={n} className="note note-warning mt-4">
                {e.text}
              </p>
            );
          })}

          {busy && (
            <div className="mt-5 flex items-center gap-1" aria-label="Reading your sentence">
              <span className="typing-dot" />
              <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
              <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
            </div>
          )}
        </div>

        {/* The writing desk: docked, roomy, and never locked. */}
        <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 -mx-5 border-t border-border bg-background px-5 pb-4 pt-3 sm:-mx-6 sm:px-6 lg:bottom-0 lg:-mx-10 lg:px-10 lg:pb-6">
          {dayOver ? (
            <div className="flex flex-wrap items-center justify-between gap-3 py-2">
              <p className="text-[14.5px] text-muted-foreground">
                That&apos;s every word for today.
              </p>
              <Button size="lg" onClick={closeDay}>
                {bridgePair(items) ? "One last thing — the bridge" : "See your day"} <ArrowRight />
              </Button>
            </div>
          ) : (
            <>
              <div className="border border-input bg-card px-4 py-3 transition-colors focus-within:border-brand">
                <textarea
                  ref={inputRef}
                  autoFocus
                  rows={3}
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
                  className="block max-h-[40vh] min-h-[5.25rem] w-full resize-none bg-transparent text-[18px] leading-[1.65] text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/60"
                />
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1" aria-hidden>
                    {item.asks.map((_, k) => (
                      <span
                        key={k}
                        className={cn(
                          "size-[7px] border",
                          k < landedHere ? "border-brand bg-brand" : "border-input bg-transparent",
                        )}
                      />
                    ))}
                  </span>
                  <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
                    {landedHere} of {item.asks.length} landed
                  </span>
                  {canLeave && (
                    <button
                      type="button"
                      onClick={leave}
                      className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground underline-offset-4 transition-colors hover:text-brand hover:underline"
                    >
                      Leave it for tomorrow
                    </button>
                  )}
                </div>
                <div className="flex flex-none items-center gap-3">
                  <span className="hidden font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">
                    ⏎ send · ⇧⏎ new line
                  </span>
                  <Button onClick={() => void send()} disabled={!input.trim() || busy}>
                    <Send /> Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
        {/* Below the desk, not above it: scrolling here brings the newest line
            to rest just over the composer instead of underneath it. */}
        <div ref={endRef} />
      </div>
    );
  }

  // ---- the bridge — the day's closing bonus ----------------------------------
  //
  // Two of today's words, one sentence. The day's set is drawn from different
  // semantic fields on purpose, so joining them is a genuine stretch — and
  // elaborating a link between unrelated things is exactly the processing that
  // makes memories durable. It's a bonus: it never moves the schedule, because
  // a bonus that could lapse a word would make the honest scheduling a lie.

  if (view.kind === "bridge") {
    const pair = bridgePair(items);
    if (!pair) return null;
    const [a, b] = pair;
    const ok = bridgeDone === true;

    return (
      <PageContainer width="default">
        <div className="flex items-center justify-between gap-3">
          <span className="kicker">The bridge · bonus round</span>
          <button
            type="button"
            onClick={() => finish(bridge.trim() && ok ? [bridge.trim()] : [])}
            className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
          >
            Skip →
          </button>
        </div>

        <h2 className="mt-4 text-[22px] leading-snug">
          One sentence. Both words.
        </h2>
        <p className="mt-1.5 text-[14px] text-muted-foreground">
          They have nothing to do with each other — that&apos;s the point. Making
          the link is what makes them stick.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[a, b].map((w) => (
            <div key={w.id} className="border border-border bg-card p-3.5">
              <div className="font-serif text-[19px] font-semibold text-foreground">{w.word}</div>
              <div className="mt-1 text-[13px] text-muted-foreground">{w.meaning}</div>
            </div>
          ))}
        </div>

        {bridgeDone === null ? (
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <span className="kicker text-gold">You — writing</span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                ⏎ send
              </span>
            </div>
            <div className="mt-1.5 border border-input bg-card px-4 py-3 transition-colors focus-within:border-brand">
              <textarea
                autoFocus
                rows={3}
                value={bridge}
                onChange={(e) => setBridge(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitBridge(a, b);
                  }
                }}
                placeholder={`Use “${a.word}” and “${b.word}” in one sentence…`}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="block w-full resize-none bg-transparent text-[18px] leading-[1.65] text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="mt-2.5 flex items-center justify-end">
              <Button
                size="sm"
                onClick={() => submitBridge(a, b)}
                disabled={!bridge.trim()}
              >
                <Send /> Send
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "mt-4 border p-3.5",
              ok ? "border-brand bg-brand-muted text-brand-ink" : "border-border bg-secondary/50",
            )}
          >
            <div className="text-sm font-medium">
              {ok ? "✓ Both, in one sentence. That's the hard version." : "Not quite both of them."}
            </div>
            <div className="mt-1 text-sm opacity-90">
              {ok
                ? "Nothing to schedule here — this one was purely for the joins it made."
                : `Have another go, or move on — the bridge never costs you anything.`}
            </div>
            <div className="mt-3 flex gap-2">
              {!ok && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setBridgeDone(null);
                  }}
                >
                  Try again
                </Button>
              )}
              <Button size="sm" onClick={() => finish(ok ? [bridge.trim()] : [])}>
                See your day <ArrowRight />
              </Button>
            </div>
          </div>
        )}
      </PageContainer>
    );
  }

  // ---- the day's debrief ------------------------------------------------------

  if (view.kind === "done") {
    const clean = results.filter((r) => r.outcome === "clean").length;
    return (
      <PageContainer width="default">
        <button
          type="button"
          onClick={() => setView({ kind: "home" })}
          className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
        >
          ‹ Today&apos;s words
        </button>
        <div className="mt-5 bg-card p-6 sm:px-14 sm:py-12">
          <div className="kicker">Daily words · your day</div>
          <h2 className="mt-2.5 text-[26px]">
            {clean} of {items.length} came out right, first time, from memory.
          </h2>
          <p className="mt-2 text-pretty text-[14.5px] text-muted-foreground">
            Every word here now lives in your Phrasebook on its own schedule —
            the clean ones rest a while, the rest come back sooner. That
            spacing is the part that makes them permanent.
          </p>

          <div className="mt-6 flex flex-col">
            {items.map((item, i) => {
              const r: ItemResult = results[i] ?? { outcome: "missed", sentences: [], prevBox: 0 };
              const tile = OUTCOME_TILE[r.outcome];
              const label = OUTCOME_LABEL[r.outcome];
              const returns =
                r.outcome === "clean"
                  ? intervalLabel(SRS_INTERVALS[Math.min(SRS_INTERVALS.length - 1, r.prevBox + 1)])
                  : r.outcome === "helped"
                    ? "stays due — a clean try next time"
                    : item.isNew
                      ? "stays due — no penalty on a first meeting"
                      : "back to the front of the queue";
              return (
                <div key={item.id} className="flex items-start gap-4 border-t border-border py-3.5">
                  <span
                    className={cn(
                      "mt-0.5 flex size-[22px] flex-none items-center justify-center border font-mono text-[11px]",
                      tile.cls,
                    )}
                  >
                    {tile.mark}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <span className="font-serif text-[17px] font-semibold text-foreground">
                        {item.word}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {item.pos}
                      </span>
                      <span className={cn("font-mono text-[10px] uppercase tracking-wide", label.cls)}>
                        {label.text}
                      </span>
                    </div>
                    {r.sentences.map((line, k) => (
                      <p
                        key={k}
                        className="mt-1 font-serif text-[15px] italic leading-normal text-muted-foreground"
                      >
                        “{line}”
                      </p>
                    ))}
                    <div className="mt-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
                      {returns}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-input pt-5">
            <p className="text-pretty text-[13.5px] text-muted-foreground">
              Tomorrow: {perDay} new ones, plus whatever the schedule says is ripe.
            </p>
            <Button className="flex-none" onClick={() => setView({ kind: "home" })}>
              Back to today
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  // ---- home — today's set ------------------------------------------------------

  const minutes = Math.max(2, Math.round(sessionSize * 2));

  const todayCard = (
    <div className="bg-card p-6">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-gold">
        Today&apos;s set
      </div>
      {doneToday ? (
        <>
          <p className="mt-2.5 text-pretty font-serif text-[17px] leading-snug text-foreground">
            Done for today.
          </p>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            {metToday > 0
              ? `${metToday} new ${metToday === 1 ? "word" : "words"} met, and nothing is due for review. Coming back tomorrow is the whole trick.`
              : "Nothing due. Come back tomorrow — spacing does the work while you're away."}
          </p>
          <Button asChild variant="outline" className="mt-4 w-full">
            <Link href="/phrasebook">Practice your book instead</Link>
          </Button>
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-[6px]">
            {reviews.map((p) => (
              <div key={p.id} className="flex items-baseline gap-2">
                <span className="size-[5px] flex-none border border-brand bg-brand" />
                <span className="min-w-0 flex-1 truncate font-serif text-[15px] italic text-foreground">
                  {p.text}
                </span>
                <span className="flex-none font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
                  review
                </span>
              </div>
            ))}
            {remainingNew.map((w) => (
              <div key={w.id} className="flex items-baseline gap-2">
                <span className="size-[5px] flex-none border border-gold bg-ochre-line" />
                <span className="min-w-0 flex-1 truncate font-serif text-[15px] italic text-foreground">
                  {"·".repeat(Math.min(12, w.word.length))}
                </span>
                <span className="flex-none font-mono text-[9.5px] uppercase tracking-wide text-gold">
                  new
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] leading-snug text-muted-foreground">
            {catalog.length === 0
              ? "Your first words are written for you when you start — nothing here is off a list."
              : "New words stay hidden until you meet them — the first look is worth more when it isn't your fifth."}
          </p>
          <Button size="lg" className="mt-3.5 w-full" onClick={() => void start()}>
            {sessionSize > 0 ? `Start today's words (${sessionSize})` : "Start today's words"}
          </Button>
          {startError && <p className="note note-warning mt-3">{startError}</p>}
          <p className="mt-2.5 text-center font-mono text-[10.5px] text-muted-foreground">
            ≈ {minutes} {minutes === 1 ? "minute" : "minutes"} · meet it · say it · say it again
          </p>
        </>
      )}
    </div>
  );

  return (
    <PageContainer width="wide" className="max-w-[1120px]">
      <div>
        <div className="kicker">Learn · Daily words</div>
        <h1 className="mt-1.5 text-[30px] tracking-tight">
          {perDay} new words a day, said in your own sentences
        </h1>
        <p className="mt-1.5 max-w-[580px] text-pretty text-[15px] text-muted-foreground">
          High-frequency words first, one small set a day. Each one is a short
          conversation: someone says something, you answer with the word, and
          you say it again until it&apos;s right.
        </p>
      </div>

      <div className="mt-6 lg:hidden">{todayCard}</div>

      <div className="mt-6 grid items-start gap-10 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        <div className="min-w-0">
          <div className="border-b border-input pb-2.5">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              How a word becomes yours
            </span>
          </div>
          <ol className="mt-4 flex flex-col">
            {(
              [
                [
                  "Meet it",
                  "The card, once: the word, what it means, a real sentence, and the words it travels with. It closes when you start typing, so the sentence comes from memory.",
                ],
                [
                  "Say it in a real moment",
                  "Someone says something that calls for the word, and you answer in your own sentence. Nothing checks you while you type.",
                ],
                [
                  "Say it until it's right",
                  "A sentence that isn't right yet stays open. You get a pointer to what's off — never the fixed sentence — and you say it again. Then the conversation moves on and wants the word in a new form.",
                ],
                [
                  "Meet it again, later",
                  "It joins your Phrasebook on a spaced schedule: words that came out right first time rest longer, the others come back sooner.",
                ],
              ] as [string, string][]
            ).map(([title, body], i) => (
              <li key={title} className="flex items-start gap-4 border-b border-border py-4">
                <span className="mt-0.5 flex size-[22px] flex-none items-center justify-center border border-input font-mono text-[11px] text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-serif text-[16px] font-medium text-foreground">{title}</div>
                  <p className="mt-0.5 text-pretty text-[13.5px] leading-snug text-muted-foreground">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-6 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
            Every word you meet lands in your{" "}
            <Link href="/phrasebook" className="border-b border-input text-brand hover:border-brand">
              Phrasebook
            </Link>{" "}
            — same pool, same schedule.
          </p>
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-8">
          <div className="hidden lg:block">{todayCard}</div>

          <div className="bg-card p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Your streak
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="font-serif text-[26px] font-semibold leading-none text-gold">
                {info.streak}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {info.streak === 1 ? "day in a row" : "days in a row"}
              </span>
            </div>
            <div className="mt-3.5 flex h-11 items-end gap-1.5">
              {week.counts.map((v, i) => (
                <div key={week.days[i]} className="flex h-full flex-1 items-end">
                  <div
                    className={cn(
                      "w-full",
                      week.days[i] === today ? "bg-gold" : v ? "bg-oxford-line" : "bg-muted",
                    )}
                    style={{ height: v ? `${Math.round((v / week.max) * 100)}%` : "3px" }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1.5">
              {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                <span
                  key={i}
                  className="flex-1 text-center font-mono text-[9px] uppercase text-muted-foreground"
                >
                  {d}
                </span>
              ))}
            </div>
            <p className="mt-2.5 text-[12.5px] text-muted-foreground">
              {week.total} clean {week.total === 1 ? "use" : "uses"} this week
              {info.freezes > 0 && ` · ${info.freezes} streak ${info.freezes === 1 ? "freeze" : "freezes"} in hand`}
            </p>
          </div>

          <div className="bg-card p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              Real growth
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              {(
                [
                  [stats.new + stats.learning + stats.mastered, "Met"],
                  [stats.mastered, "Mastered"],
                  [newWordsThisWeek(store.vocab, today), "New this week"],
                ] as [number, string][]
              ).map(([value, label]) => (
                <div key={label} className="flex-1 text-center">
                  <div className="font-serif text-[22px] font-semibold leading-none text-foreground">
                    {value}
                  </div>
                  <div className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground">
                    {label}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-baseline justify-between font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
              <span>Words met</span>
              {/* No denominator: the curriculum is written for you a batch at a
                  time, so there is no fixed list to be a fraction of. */}
              <span className="tabular-nums">
                {stats.new + stats.learning + stats.mastered}
              </span>
            </div>
            <p className="mt-3 text-pretty text-[13px] text-muted-foreground">
              {vocabSize(store.vocab)} distinct words in sentences you actually
              wrote — the only vocabulary count that means anything.
            </p>
          </div>

          <p className="text-[12px] text-muted-foreground">
            Five clean uses, spaced further and further apart, and a word is
            yours for good.
          </p>
        </aside>
      </div>
    </PageContainer>
  );
}
