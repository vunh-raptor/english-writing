"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, Send } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type { DrillJudgment, NewsLevel, WordOutcome, WordPos, WordSeed } from "@/types";
import { fetchWordRounds, judgePhrase } from "@/lib/client/clientApi";
import {
  CURRICULUM_SIZE,
  LOCAL_WORD_SETUPS,
  LOCAL_WORD_TASKS,
  buildDaySet,
  isDailyWord,
  maskCollocation,
  recallMatches,
  usesWord,
  wordSeedById,
  wordToPhrase,
} from "@/lib/shared/words";
import { SRS_INTERVALS, srsSummary } from "@/lib/shared/srs";
import { countWords, newWordsThisWeek, vocabSize } from "@/lib/shared/stats";
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
 * few brand-new high-frequency words. Every item walks the same arc, and the
 * arc is the method:
 *
 *   MEET      (new words only) the card, once — form, meaning, a real example,
 *             the partners it travels with. The best first encounter we can give.
 *   RETRIEVE  the word disappears and they write it from its meaning. Recall,
 *             not recognition: pulling it back is what builds the memory.
 *   USE       a real-life moment that calls for it → they write their own
 *             sentence. Generating your own use in a new context is the single
 *             biggest lever on whether a word survives the week.
 *
 * Clean all the way through earns a longer interval; anything with help stays
 * due. Then the word joins the same pool the Phrasebook practices — one
 * curriculum, three surfaces.
 */

/** Seconds the card stays up on "meet" before the learner may hide it. Short
 *  enough not to nag, long enough that nobody skips the encounter blind. */
const MEET_SECONDS = 4;

type Beat = "meet" | "retrieve" | "use";

interface SessionItem {
  id: string;
  word: string;
  pos: WordPos;
  meaning: string;
  example: string;
  collocations: string[];
  /** New today (walks all three beats) or a scheduled review (retrieve → use). */
  isNew: boolean;
  /** The curriculum entry, for a new word — what joins the library once used. */
  seed?: WordSeed;
  /** The real-life moment for the "use" beat. */
  setup: string;
  task: string;
  /** Worked examples using the word elsewhere — inert input, never an answer. */
  examples: string[];
  /** True when the moment came from the local packs, not the round-builder. */
  offline: boolean;
  /** Leitner box before today — the debrief computes "returns in…" from it. */
  prevBox: number;
}

interface ItemResult {
  outcome: WordOutcome;
  sentence: string;
  prevBox: number;
}

type View =
  | { kind: "home" }
  | { kind: "session" }
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
  const { store, issueWordDay, finishWordSession, reviewPhrases, collectPhrase } = useStore();
  const pool = store.minedPhrases;
  const srs = store.phraseSrs;
  const level: NewsLevel = store.newsLevel;
  const perDay = store.settings.wordsPerDay;

  const [view, setView] = useState<View>({ kind: "home" });
  const [items, setItems] = useState<SessionItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [beat, setBeat] = useState<Beat>("meet");
  const [meetLeft, setMeetLeft] = useState<number | null>(null);
  const [guess, setGuess] = useState("");
  const [recalled, setRecalled] = useState<null | boolean>(null);
  const [helped, setHelped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [judging, setJudging] = useState(false);
  const [result, setResult] = useState<DrillJudgment | null>(null);
  const [results, setResults] = useState<ItemResult[]>([]);
  const [loading, setLoading] = useState(false);
  const startedAt = useRef<number>(0);

  const today = todayKey();

  // Today's set is drawn once and then fixed: reopening never reshuffles it,
  // and finishing tomorrow's words early is not a thing you can do. Reviews
  // come from the curriculum only — captured highlights and mission targets
  // are the Phrasebook's business, not this mode's.
  const { todaysNew, remainingNew, reviews } = useMemo(
    () =>
      buildDaySet({
        wordDays: store.wordDays,
        pool,
        srs,
        level,
        perDay,
        today,
      }),
    [store.wordDays, pool, srs, level, perDay, today],
  );

  const sessionSize = remainingNew.length + reviews.length;
  const doneToday = sessionSize === 0;

  const stats = useMemo(
    () => srsSummary(pool.filter((p) => isDailyWord(p.id)).map((p) => p.id), srs),
    [pool, srs],
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
  function itemFromSeed(seed: WordSeed, isNew: boolean): SessionItem {
    return {
      id: seed.id,
      word: seed.word,
      pos: seed.pos,
      meaning: seed.meaning,
      example: seed.example,
      collocations: seed.collocations,
      isNew,
      ...(isNew ? { seed } : {}),
      setup: "",
      task: LOCAL_WORD_TASKS[seed.pos],
      examples: [],
      offline: true,
      prevBox: srs[seed.id]?.box ?? 0,
    };
  }

  async function start() {
    if (loading || sessionSize === 0) return;
    setLoading(true);

    // Reviews first: a warm, winnable start before the unfamiliar words.
    const base = [
      ...reviews
        .map((p) => wordSeedById(p.id))
        .filter((s): s is WordSeed => !!s)
        .map((s) => itemFromSeed(s, false)),
      ...remainingNew.map((s) => itemFromSeed(s, true)),
    ];

    let byId = new Map<string, { setup: string; task: string; examples: string[] }>();
    try {
      const rounds = await fetchWordRounds(
        level,
        base.map((i) => ({
          id: i.id,
          word: i.word,
          pos: i.pos,
          meaning: i.meaning,
          collocations: i.collocations,
        })),
      );
      byId = new Map(rounds.map((r) => [r.id, r]));
    } catch {
      // Offline or no AI — every item falls back to a local moment below.
    }

    const built = base.map((item, i) => {
      const r = byId.get(item.id);
      const examples = [...(r?.examples ?? []), item.example]
        .filter((e) => e && e.trim())
        .filter((e, n, arr) => arr.findIndex((x) => x.trim() === e.trim()) === n)
        .slice(0, 3);
      return {
        ...item,
        setup: r?.setup ?? LOCAL_WORD_SETUPS[i % LOCAL_WORD_SETUPS.length],
        task: r?.task ?? item.task,
        examples,
        offline: !r,
      };
    });

    // Fix today's set now, so a reload mid-session shows the same words.
    issueWordDay(todaysNew.map((w) => w.id));

    setItems(built);
    setIdx(0);
    setBeat(built[0].isNew ? "meet" : "retrieve");
    setMeetLeft(null);
    setGuess("");
    setRecalled(null);
    setHelped(false);
    setAnswer("");
    setExamplesOpen(false);
    setResult(null);
    setResults([]);
    setLoading(false);
    startedAt.current = Date.now();
    setView({ kind: "session" });
  }

  // The "meet" beat holds the card for a few seconds — long enough to actually
  // read it, which is the encounter the rest of the arc leans on.
  useEffect(() => {
    if (view.kind !== "session" || beat !== "meet") {
      setMeetLeft(null);
      return;
    }
    setMeetLeft(MEET_SECONDS);
    const iv = setInterval(() => {
      setMeetLeft((s) => (s === null ? s : s <= 1 ? null : s - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [view.kind, beat, idx]);

  // ---- the beats ------------------------------------------------------------

  function submitGuess() {
    const item = items[idx];
    if (!item || recalled !== null) return;
    const ok = recallMatches(item.word, guess);
    setRecalled(ok);
    if (!ok) setHelped(true);
  }

  function peek() {
    if (recalled !== null) return;
    setRecalled(false);
    setHelped(true);
  }

  async function submitSentence() {
    const item = items[idx];
    const sentence = answer.trim();
    if (!item || !sentence || judging || result) return;
    setJudging(true);

    let j: DrillJudgment;
    try {
      j = await judgePhrase(
        level,
        { text: item.word, meaning: item.meaning },
        `${item.setup}\n${item.task}`.trim(),
        sentence,
      );
      // A model that misses a real inflection ("relies" for "rely") must never
      // erase a real production — union its judgment with our own check.
      if (!j.used && usesWord(item.word, sentence) && countWords(sentence) >= 4) {
        j = { ...j, used: true, note: "You worked it into your own sentence — that's the whole game." };
      }
    } catch {
      const used = countWords(sentence) >= 4 && usesWord(item.word, sentence);
      j = {
        used,
        note: used
          ? "You worked it into your own sentence — that's the whole game."
          : "I couldn't spot it in there — look where it would fit, and it'll come back around.",
      };
    }

    const clean = j.used && !helped;
    const outcome: WordOutcome = clean ? "clean" : j.used ? "helped" : "missed";

    // A new word joins the library the moment it's been used — that's when it
    // stops being the app's word and starts being theirs.
    if (item.seed) collectPhrase(wordToPhrase(item.seed, today));

    // Honest scheduling. Clean → an earned interval. Helped → no change, so it
    // stays due. Missed → a first meeting is never punished; a review lapses.
    if (clean) reviewPhrases([item.id], true);
    else if (outcome === "missed" && !item.isNew) reviewPhrases([item.id], false);

    setResults((rs) => [...rs, { outcome, sentence, prevBox: item.prevBox }]);
    setResult(j);
    setJudging(false);
  }

  function next() {
    if (idx + 1 >= items.length) {
      const sentences = results.map((r) => r.sentence).filter(Boolean);
      finishWordSession({ sentences, durationMs: Date.now() - startedAt.current });
      if (store.settings.sound) playChime();
      setView({ kind: "done" });
      return;
    }
    const nextItem = items[idx + 1];
    setIdx((i) => i + 1);
    setBeat(nextItem.isNew ? "meet" : "retrieve");
    setGuess("");
    setRecalled(null);
    setHelped(false);
    setAnswer("");
    setExamplesOpen(false);
    setResult(null);
  }

  // ---- session --------------------------------------------------------------

  if (view.kind === "session") {
    const item = items[idx];
    if (!item) return null;
    const cue = item.collocations
      .map((c) => maskCollocation(c, item.word))
      .filter((c) => c.includes("___"))[0];

    return (
      <PageContainer width="narrow">
        <div className="flex items-center justify-between gap-3">
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

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="kicker">
            {item.isNew ? "New word" : "Coming back"} · {idx + 1} of {items.length}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {beat === "meet" ? "meet it" : beat === "retrieve" ? "from memory" : "use it"}
          </span>
        </div>

        {/* 1 — MEET. The one deliberate encounter: read it properly, once. */}
        {beat === "meet" && (
          <>
            <div className="mt-3 border border-border bg-card p-5">
              <WordCard item={item} />
            </div>
            <p className="mt-3 text-[13.5px] text-muted-foreground">
              Read it once — out loud if you can. In a moment it disappears and
              you write it from memory.
            </p>
            <Button
              size="lg"
              className="mt-3 w-full"
              disabled={meetLeft !== null}
              onClick={() => setBeat("retrieve")}
            >
              {meetLeft !== null ? `Got it (${meetLeft})` : "Got it — hide it"}
            </Button>
          </>
        )}

        {/* 2 — RETRIEVE. Recall, not recognition: they type it themselves. */}
        {beat === "retrieve" && (
          <>
            <div className="mt-3 border border-border bg-card p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Which word means
              </div>
              <p className="mt-1.5 font-serif text-[19px] leading-snug text-foreground">
                {item.meaning}
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <span className="uppercase tracking-wide">{item.pos}</span>
                {cue && <span>· it goes in “{cue}”</span>}
              </div>

              {recalled === null ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={guess}
                    onChange={(e) => setGuess(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitGuess();
                      }
                    }}
                    placeholder="type the word…"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-w-[180px] flex-1 border-b-2 border-input bg-transparent py-1.5 font-serif text-[18px] text-foreground outline-none transition-colors focus:border-brand placeholder:text-[15px] placeholder:italic placeholder:text-muted-foreground/60"
                  />
                  <Button size="sm" onClick={submitGuess} disabled={!guess.trim()}>
                    Check
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={peek}
                    title="Peeking is fine — the word just stays due for a clean try next time"
                  >
                    <Eye /> Show me
                  </Button>
                </div>
              ) : (
                <div
                  className={cn(
                    "mt-4 border p-3",
                    recalled
                      ? "border-brand bg-brand-muted text-brand-ink"
                      : "border-ochre-line bg-ochre-tint text-gold",
                  )}
                >
                  <div className="text-sm font-medium">
                    {recalled ? "✓ That's the one." : `It was “${item.word}”.`}
                  </div>
                  <div className="mt-1 text-sm opacity-90">
                    {recalled
                      ? "Pulling it back from memory is what makes it stick. Now go use it."
                      : "No cost — you'll see it again. Use it now and it starts settling in."}
                  </div>
                </div>
              )}
            </div>
            {recalled !== null && (
              <Button size="lg" className="mt-3 w-full" onClick={() => setBeat("use")}>
                Use it in your own sentence <ArrowRight />
              </Button>
            )}
          </>
        )}

        {/* 3 — USE. A real moment, their own sentence. The round that counts. */}
        {beat === "use" && (
          <>
            <div className="mt-3 border-l-2 border-gold bg-secondary/40 py-3 pl-4 pr-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                The moment{item.offline ? " · offline" : ""}
              </div>
              <p className="mt-1.5 whitespace-pre-line font-serif text-[16px] leading-relaxed text-foreground">
                {item.setup}
              </p>
              <p className="mt-2 text-[12.5px] text-muted-foreground">{item.task}</p>
            </div>

            <div className="mt-3 border border-border bg-card p-3.5">
              <WordCard item={item} muted />
            </div>

            {item.examples.length > 0 && (
              <div className="mt-2">
                {!examplesOpen ? (
                  <button
                    type="button"
                    onClick={() => setExamplesOpen(true)}
                    className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
                  >
                    See it used ({item.examples.length}) ↓
                  </button>
                ) : (
                  <div className="border border-border bg-secondary/40 p-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      In action — now write your own
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {item.examples.map((e, i) => (
                        <li
                          key={i}
                          className="select-none font-serif text-[14px] italic leading-relaxed text-foreground/90"
                        >
                          “{e}”
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {result === null ? (
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <span className="kicker text-gold">You — writing</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    ⏎ send
                  </span>
                </div>
                <div className="mt-1.5 bg-oxford-tint px-3 py-2">
                  <textarea
                    rows={2}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitSentence();
                      }
                    }}
                    placeholder="Answer in your own sentence…"
                    autoComplete="off"
                    className="w-full resize-none bg-transparent font-serif text-[15.5px] leading-relaxed text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70"
                  />
                </div>
                <div className="mt-2.5 flex items-center justify-end">
                  <Button
                    size="sm"
                    onClick={() => void submitSentence()}
                    disabled={!answer.trim() || judging}
                  >
                    <Send /> {judging ? "Reading…" : "Send"}
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "mt-4 border p-3.5",
                  result.used
                    ? helped
                      ? "border-ochre-line bg-ochre-tint text-gold"
                      : "border-brand bg-brand-muted text-brand-ink"
                    : "border-border bg-secondary/50",
                )}
              >
                <div className="text-sm font-medium">
                  {result.used
                    ? helped
                      ? "✓ Used it — with a little help"
                      : "✓ Yours now — memory to sentence, first try"
                    : "Not this time"}
                </div>
                <div className="mt-1 text-sm opacity-90">{result.note}</div>
                {result.upgrade && (
                  <div className="mt-2.5 border-t border-current/20 pt-2.5 text-sm">
                    <span className="opacity-70">You wrote:</span> “{result.upgrade.you}”
                    <br />
                    <span className="opacity-70">Try:</span> <b>“{result.upgrade.upgrade}”</b>
                    {result.upgrade.why && (
                      <span className="opacity-70"> — {result.upgrade.why}</span>
                    )}
                  </div>
                )}
                <Button size="sm" className="mt-3" onClick={next}>
                  {idx + 1 >= items.length ? "See your day" : "Next word"} <ArrowRight />
                </Button>
              </div>
            )}
          </>
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
            {clean} of {items.length} went from memory into your own sentence.
          </h2>
          <p className="mt-2 text-pretty text-[14.5px] text-muted-foreground">
            Every word here now lives in your Phrasebook on its own schedule —
            the clean ones rest a while, the rest come back sooner. That
            spacing is the part that makes them permanent.
          </p>

          <div className="mt-6 flex flex-col">
            {items.map((item, i) => {
              const r = results[i] ?? { outcome: "missed" as WordOutcome, sentence: "", prevBox: 0 };
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
                    {r.sentence && (
                      <p className="mt-1 font-serif text-[15px] italic leading-normal text-muted-foreground">
                        “{r.sentence}”
                      </p>
                    )}
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

  const minutes = Math.max(1, Math.round(sessionSize * 0.8));

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
            {todaysNew.length > 0
              ? `${todaysNew.length} new ${todaysNew.length === 1 ? "word" : "words"} met, and nothing is due for review. Coming back tomorrow is the whole trick.`
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
            New words stay hidden until you meet them — the first look is worth
            more when it isn&apos;t your fifth.
          </p>
          <Button size="lg" className="mt-3.5 w-full" onClick={() => void start()} disabled={loading}>
            {loading ? "Setting up…" : `Start today's words (${sessionSize})`}
          </Button>
          <p className="mt-2.5 text-center font-mono text-[10.5px] text-muted-foreground">
            ≈ {minutes} {minutes === 1 ? "minute" : "minutes"} · meet · from memory · your sentence
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
          High-frequency words first, one small set a day. You meet each one,
          write it back from memory, then use it in a real moment — the order
          that makes words stay.
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
                  "The card, once: the word, what it means, a real sentence, and the words it travels with. One good encounter beats five distracted ones.",
                ],
                [
                  "Write it from memory",
                  "The word disappears and you type it back from its meaning. Recalling is what builds the memory — recognizing it in a list doesn't.",
                ],
                [
                  "Use it for real",
                  "A moment from ordinary life that needs the word, answered in your own sentence. Making your own use is the strongest predictor that a word survives the week.",
                ],
                [
                  "Meet it again, later",
                  "It joins your Phrasebook on a spaced schedule: clean uses earn a longer rest, shaky ones come back sooner.",
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
              <span>Curriculum</span>
              <span className="tabular-nums">
                {stats.new + stats.learning + stats.mastered} / {CURRICULUM_SIZE}
              </span>
            </div>
            <div className="mt-1.5 h-1 bg-border">
              <div
                className="h-1 bg-brand"
                style={{
                  width: `${Math.round(
                    ((stats.new + stats.learning + stats.mastered) / CURRICULUM_SIZE) * 100,
                  )}%`,
                }}
              />
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
