"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type { DrillJudgment, Phrase, SrsRecord } from "@/types";
import { drillPhrases, judgePhrase } from "@/lib/client/clientApi";
import { phraseMatcher } from "@/lib/shared/phrases";
import { SRS_INTERVALS, isDue, phraseState, srsSummary } from "@/lib/shared/srs";
import { countWords } from "@/lib/shared/stats";
import { addDays, parseDayKey, prettyDay, todayKey } from "@/lib/shared/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";

/**
 * The Phrasebook (docs/PHRASEBOOK.md) — the learner's own collection of
 * language: highlights captured across the app plus phrases mined from News
 * Chat missions. Three views:
 *
 *   library — the commonplace book: searchable, filterable, grouped by SRS
 *             state (due / learning / mastered), each row expanding into the
 *             phrase's example, "similar ways" and provenance. A sticky rail
 *             carries today's session, the week's applications and the
 *             new → learning → mastered journey.
 *   drill   — the practice mode. Production-first by design: each due phrase
 *             gets a real-life situation that CALLS FOR it, and the learner
 *             answers in their own sentence. Never a flashcard flip. Recall
 *             fades in with the schedule: a phrase past box 1 starts hidden
 *             (meaning only — retrieve it, then apply it); peeking is recorded
 *             and the phrase simply stays due instead of earning an interval.
 *   done    — the session debrief: every round's outcome, the learner's own
 *             sentences, and when each phrase comes back.
 */

/** Rounds per session — enough to feel real, short enough to finish. */
const SESSION_SIZE = 6;
/** From this Leitner box up, the drill hides the phrase first (recall + apply). */
const RECALL_BOX = 2;

/** Offline/failure fallback — weaker than AI situations, still production. */
const LOCAL_SITUATIONS = [
  "A friend texts you: “how's everything going?” Reply about your week — and work your phrase in naturally.",
  "You're telling a colleague about something that happened yesterday. Tell it in a sentence or two, using your phrase.",
  "Someone in your family asks what you think about a plan they have. Answer them, using your phrase.",
  "You're messaging a friend about something you saw online today. Say your take, using your phrase.",
  "A neighbor asks how your day was. Answer honestly — and fit your phrase in.",
  "You're writing a quick reply in a group chat about weekend plans. Use your phrase in it.",
];

interface DrillRound {
  phrase: Phrase;
  situation: string;
  /** Phrase hidden at first — retrieve from meaning, then apply. */
  recall: boolean;
  /** True when the situation came from the local fallback, not the AI. */
  offline: boolean;
}

/** How one round ended — drives the rail, the result panel and the debrief. */
type Outcome = "clean" | "peek" | "miss";

interface RoundResult {
  outcome: Outcome;
  sentence: string;
  /** Leitner box before this round — the debrief computes "returns in…" from it. */
  prevBox: number;
}

type View = "library" | "drill" | "done";
type Filter = "all" | "due" | "learning" | "mastered";
type RowState = "due" | "learning" | "mastered";

/** Due-first (most overdue first), then newest saves — the session order. */
function dueOrder(pool: Phrase[], srs: Record<string, SrsRecord>): Phrase[] {
  const today = todayKey();
  return pool
    .filter((p) => isDue(srs[p.id], today))
    .sort((a, b) => {
      const ra = srs[a.id];
      const rb = srs[b.id];
      if (!ra !== !rb) return ra ? 1 : -1; // brand-new first
      return 0;
    });
}

/** "returns in…" copy for a clean application's next interval. */
function intervalLabel(days: number): string {
  if (days <= 0) return "stays due — today";
  if (days === 1) return "returns tomorrow";
  if (days === 7) return "returns in a week";
  return `returns in ${days} days`;
}

const OUTCOME_TILE: Record<Outcome, { mark: string; cls: string }> = {
  clean: { mark: "✓", cls: "border-brand bg-brand-muted text-brand-ink" },
  peek: { mark: "✓", cls: "border-ochre-line bg-ochre-tint text-gold" },
  miss: { mark: "—", cls: "border-input bg-muted text-muted-foreground" },
};

const OUTCOME_LABEL: Record<Outcome, { text: string; cls: string }> = {
  clean: { text: "applied", cls: "text-brand-ink" },
  peek: { text: "applied · peeked", cls: "text-gold" },
  miss: { text: "not yet", cls: "text-muted-foreground" },
};

/** The five Leitner boxes as tiny square ticks — filled up to the current box. */
function Ticks({ box }: { box: number }) {
  return (
    <span
      className="inline-flex gap-[3px]"
      title={`Box ${box} of 5 — each clean use moves it up`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 border",
            i < box ? "border-brand bg-brand" : "border-input bg-transparent",
          )}
        />
      ))}
    </span>
  );
}

function PhraseRow({
  phrase,
  rec,
  state,
  open,
  onToggle,
  onRemove,
}: {
  phrase: Phrase;
  rec: SrsRecord | undefined;
  state: RowState;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const due = state === "due";
  const alts = phrase.alternatives ?? [];
  const ctx = phrase.captured?.context;
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-1 py-3 text-left transition-colors hover:bg-secondary/50"
      >
        <div className="min-w-0 flex-1">
          <div className="font-serif text-[16px] font-medium text-foreground">
            {phrase.text}
          </div>
          {phrase.meaning && (
            <div className="mt-px truncate text-[13px] text-muted-foreground">
              {phrase.meaning}
            </div>
          )}
        </div>
        <div className="flex flex-none items-center gap-4">
          <Ticks box={rec?.box ?? 0} />
          <span
            className={cn(
              "min-w-[76px] text-right font-mono text-[10px] uppercase tracking-wide",
              due ? "text-gold" : state === "mastered" ? "text-brand-ink" : "text-muted-foreground",
            )}
          >
            {due ? (rec ? "due" : "new · due") : state}
          </span>
        </div>
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 px-1 pb-4 pt-0.5">
          {phrase.example && (
            <div className="border-l-2 border-oxford-line pl-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                In another situation
              </div>
              <div className="mt-0.5 font-serif text-[15px] italic text-foreground">
                {phrase.example}
              </div>
            </div>
          )}
          {(alts.length > 0 || phrase.register) && (
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Similar ways
              </span>
              {alts.map((a) => (
                <span
                  key={a.text}
                  title={a.note}
                  className="bg-brand-muted px-2 py-px text-[12.5px] text-brand-ink"
                >
                  {a.text}
                </span>
              ))}
              {phrase.register && (
                <span className="bg-muted px-2 py-px font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {phrase.register}
                </span>
              )}
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/80">
              {phrase.captured ? (
                <>
                  Saved from {phrase.captured.module} · {prettyDay(phrase.captured.day)}
                  {ctx && (
                    <span className="font-serif normal-case italic tracking-normal">
                      {" "}
                      — “{ctx.slice(0, 90)}
                      {ctx.length > 90 ? "…" : ""}”
                    </span>
                  )}
                </>
              ) : (
                <>From a News Chat mission</>
              )}
            </div>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove “${phrase.text}”`}
              title="Remove from your Phrasebook"
              className="flex-none font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60 transition-colors hover:text-destructive"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Phrasebook() {
  const { store, reviewPhrases, removePhrase } = useStore();
  const pool = store.minedPhrases;
  const srs = store.phraseSrs;
  const level = store.newsLevel;

  const [view, setView] = useState<View>("library");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Drill session state.
  const [rounds, setRounds] = useState<DrillRound[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [judging, setJudging] = useState(false);
  const [result, setResult] = useState<DrillJudgment | null>(null);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [loadingDrill, setLoadingDrill] = useState(false);

  const due = useMemo(() => dueOrder(pool, srs), [pool, srs]);
  const stats = useMemo(() => srsSummary(pool.map((p) => p.id), srs), [pool, srs]);

  // This week's applications, Monday-first — the "This week" card.
  const week = useMemo(() => {
    const today = todayKey();
    const monday = addDays(today, -((parseDayKey(today).getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const counts = days.map((d) => store.phraseApplied[d] ?? 0);
    return {
      days,
      counts,
      today,
      total: counts.reduce((a, b) => a + b, 0),
      max: Math.max(...counts, 1),
    };
  }, [store.phraseApplied]);

  async function startDrill() {
    const items = due.slice(0, SESSION_SIZE);
    if (items.length === 0 || loadingDrill) return;
    setLoadingDrill(true);
    let bySituation = new Map<string, string>();
    let offline = false;
    try {
      const situations = await drillPhrases(
        level,
        items.map((p) => ({ id: p.id, text: p.text, meaning: p.meaning })),
      );
      bySituation = new Map(situations.map((s) => [s.id, s.situation]));
    } catch {
      offline = true; // every round falls back below
    }
    setRounds(
      items.map((p, i) => {
        const situation = bySituation.get(p.id);
        return {
          phrase: p,
          situation: situation ?? LOCAL_SITUATIONS[i % LOCAL_SITUATIONS.length],
          recall: (srs[p.id]?.box ?? 0) >= RECALL_BOX,
          offline: offline || !situation,
        };
      }),
    );
    setIdx(0);
    setAnswer("");
    setRevealed(false);
    setResult(null);
    setResults([]);
    setLoadingDrill(false);
    setView("drill");
  }

  async function submit() {
    const round = rounds[idx];
    const sentence = answer.trim();
    if (!round || !sentence || judging || result) return;
    setJudging(true);
    let j: DrillJudgment;
    try {
      j = await judgePhrase(
        level,
        { text: round.phrase.text, meaning: round.phrase.meaning },
        round.situation,
        sentence,
      );
    } catch {
      // Offline judging: the lenient matcher + a minimum of their own words.
      const used =
        countWords(sentence) >= 4 && phraseMatcher(round.phrase.text).test(sentence);
      j = {
        used,
        note: used
          ? "You worked it into your own sentence — that's the whole game."
          : "I couldn't spot it in there — look where it would fit, and it'll come back around.",
      };
    }
    // Honest scheduling: a clean application earns an interval; applied after a
    // peek stays due (no change — the Coach picks it up); a miss lapses.
    const prevBox = srs[round.phrase.id]?.box ?? 0;
    const clean = j.used && !revealed;
    if (clean) reviewPhrases([round.phrase.id], true);
    else if (!j.used) reviewPhrases([round.phrase.id], false);
    setResults((rs) => [
      ...rs,
      { outcome: clean ? "clean" : j.used ? "peek" : "miss", sentence, prevBox },
    ]);
    setResult(j);
    setJudging(false);
  }

  function next() {
    if (idx + 1 >= rounds.length) {
      setView("done");
      return;
    }
    setIdx((i) => i + 1);
    setAnswer("");
    setRevealed(false);
    setResult(null);
  }

  // ---- drill ----------------------------------------------------------------

  if (view === "drill") {
    const round = rounds[idx];
    if (!round) return null;
    const showPhrase = !round.recall || revealed || result !== null;
    const last = results[results.length - 1];
    const outcome: Outcome | null = result ? last?.outcome ?? null : null;
    const ctx = round.phrase.captured?.context;

    return (
      <PageContainer width="default">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView("library")}
            className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
          >
            ‹ Phrasebook
          </button>
          <div className="flex items-center gap-1.5">
            {rounds.map((r, i) => {
              const done = results[i];
              const tile = done ? OUTCOME_TILE[done.outcome] : null;
              return (
                <span
                  key={r.phrase.id}
                  title={
                    done
                      ? `${r.phrase.text} — ${
                          done.outcome === "clean"
                            ? "applied"
                            : done.outcome === "peek"
                              ? "applied with a peek"
                              : "not this time"
                        }`
                      : `Round ${i + 1}`
                  }
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

        <div className="mt-5 bg-card p-6 sm:px-14 sm:py-12">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="kicker">
              Round {idx + 1} of {rounds.length}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {round.recall
                ? "recall — the phrase starts hidden"
                : "scaffold — the phrase is beside you"}
              {round.offline ? " · offline" : ""}
            </span>
          </div>

          {/* The situation — the real-life moment to answer. */}
          <p className="mt-4 text-pretty font-serif text-[21px] leading-[1.45] text-foreground">
            {round.situation}
          </p>

          {/* The phrase — shown as scaffold early, hidden for recall later. */}
          <div
            className={cn(
              "mt-5 border-l-2 bg-ochre-tint px-4 py-3.5",
              showPhrase ? "border-ochre-line" : "border-ochre",
            )}
          >
            {showPhrase ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-serif text-[19px] font-semibold text-foreground">
                    {round.phrase.text}
                  </span>
                  <span className="flex-none font-mono text-[10px] uppercase tracking-[0.1em] text-gold">
                    Your phrase
                  </span>
                </div>
                {round.phrase.meaning && (
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {round.phrase.meaning}
                  </div>
                )}
                {ctx && (
                  <div className="mt-2.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/80">
                    Where you met it{" "}
                    <span className="font-serif normal-case italic tracking-normal">
                      — “{ctx.slice(0, 70)}
                      {ctx.length > 70 ? "…" : ""}”
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-gold">
                    From memory — your phrase for:
                  </div>
                  <div className="mt-1 text-[14.5px] text-foreground">
                    {round.phrase.meaning ||
                      "…this situation. You saved it — it's in there."}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setRevealed(true)}
                  title="Peeking is fine — the phrase just stays due for next time"
                >
                  Peek
                </Button>
              </div>
            )}
            {revealed && result === null && (
              <div className="mt-2 font-mono text-[11px] text-gold">
                Peeked — use it now and it&apos;ll stay due for a clean try next time.
              </div>
            )}
          </div>

          {/* Their sentence — production is the only way through. */}
          {result === null ? (
            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-brand">
                  You — writing
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  ⏎ send
                </span>
              </div>
              <div className="mt-2 border-b border-input">
                <textarea
                  rows={3}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  placeholder="Answer the moment — in your own sentence…"
                  autoComplete="off"
                  className="block w-full resize-none bg-transparent pb-3 pt-1 font-serif text-[17px] leading-[1.65] text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70"
                />
              </div>
              <div className="mt-3.5 flex items-center justify-end">
                <Button onClick={() => void submit()} disabled={!answer.trim() || judging}>
                  {judging ? "Checking…" : "Send"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <div
                className={cn(
                  "font-mono text-[10.5px] uppercase tracking-[0.1em]",
                  outcome === "clean"
                    ? "text-brand"
                    : outcome === "peek"
                      ? "text-gold"
                      : "text-muted-foreground",
                )}
              >
                {outcome === "clean"
                  ? "Applied — your own words"
                  : outcome === "peek"
                    ? "Applied — with a peek"
                    : "Not this time"}
              </div>
              <p className="mt-2 font-serif text-[16.5px] italic leading-normal text-foreground">
                “{last?.sentence}”
              </p>
              <div
                className={cn(
                  "mt-3 border-l-2 px-4 py-3",
                  result.used
                    ? "border-oxford-line bg-oxford-tint"
                    : "border-input bg-secondary/60",
                )}
              >
                <div className="text-sm text-foreground">{result.note}</div>
                {result.used && result.upgrade && (
                  <div className="mt-2.5 border-t border-oxford-line pt-2.5 text-sm text-foreground">
                    <span className="text-muted-foreground">Try:</span>{" "}
                    <b>“{result.upgrade.upgrade}”</b>
                    {result.upgrade.why && (
                      <span className="text-muted-foreground"> — {result.upgrade.why}</span>
                    )}
                  </div>
                )}
                {!result.used && (
                  <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                    Back to the front of the queue — you&apos;ll see it again soon.
                  </div>
                )}
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={next}>
                  {idx + 1 >= rounds.length ? "See your debrief" : "Next"} <ArrowRight />
                </Button>
              </div>
            </div>
          )}
        </div>
      </PageContainer>
    );
  }

  // ---- done — the session debrief -------------------------------------------

  if (view === "done") {
    const producedClean = results.filter((r) => r.outcome === "clean").length;
    return (
      <PageContainer width="default">
        <button
          type="button"
          onClick={() => setView("library")}
          className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
        >
          ‹ Phrasebook
        </button>
        <div className="mt-5 bg-card p-6 sm:px-14 sm:py-12">
          <div className="kicker">Session debrief</div>
          <h2 className="mt-2.5 text-[26px]">
            {producedClean} of {rounds.length} said in your own words.
          </h2>
          <p className="mt-2 text-pretty text-[14.5px] text-muted-foreground">
            These are your sentences — not the app&apos;s. Clean uses earned a longer
            rest; the rest come straight back.
          </p>
          <div className="mt-6 flex flex-col">
            {rounds.map((round, i) => {
              const r = results[i] ?? { outcome: "miss" as Outcome, sentence: "", prevBox: 0 };
              const tile = OUTCOME_TILE[r.outcome];
              const label = OUTCOME_LABEL[r.outcome];
              const returns =
                r.outcome === "clean"
                  ? intervalLabel(SRS_INTERVALS[Math.min(SRS_INTERVALS.length - 1, r.prevBox + 1)])
                  : r.outcome === "peek"
                    ? "stays due — a clean try next time"
                    : "stays due — back at the front of the queue";
              return (
                <div
                  key={round.phrase.id}
                  className="flex items-start gap-4 border-t border-border py-3.5"
                >
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
                      <span className="font-serif text-[16px] font-semibold text-foreground">
                        {round.phrase.text}
                      </span>
                      <span
                        className={cn(
                          "font-mono text-[10px] uppercase tracking-wide",
                          label.cls,
                        )}
                      >
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
              Your Phrase Coach picks up anything still due — same pool, in conversation.
            </p>
            <Button className="flex-none" onClick={() => setView("library")}>
              Back to your Phrasebook
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  // ---- library — the commonplace book ----------------------------------------

  const q = query.trim().toLowerCase();
  const matchesQuery = (p: Phrase) =>
    !q || p.text.toLowerCase().includes(q) || p.meaning.toLowerCase().includes(q);
  const stateOf = (p: Phrase): RowState => {
    const rec = srs[p.id];
    if (isDue(rec)) return "due";
    return phraseState(rec) === "mastered" ? "mastered" : "learning";
  };
  const visible = pool.filter((p) => matchesQuery(p) && (filter === "all" || stateOf(p) === filter));

  const groups = (
    [
      { key: "due", label: "Due today", cls: "text-gold", rows: visible.filter((p) => stateOf(p) === "due") },
      { key: "learning", label: "Learning", cls: "text-muted-foreground", rows: visible.filter((p) => stateOf(p) === "learning").reverse() },
      { key: "mastered", label: "Mastered", cls: "text-brand", rows: visible.filter((p) => stateOf(p) === "mastered").reverse() },
    ] as const
  ).filter((g) => g.rows.length > 0);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "due", label: "Due" },
    { id: "learning", label: "Learning" },
    { id: "mastered", label: "Mastered" },
  ];

  const sessionCount = Math.min(due.length, SESSION_SIZE);
  const sessionMinutes = Math.max(1, Math.round(sessionCount * 0.7));

  const sessionCard = (
    <div className="bg-card p-6">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-gold">
        Today&apos;s session
      </div>
      {pool.length === 0 ? (
        <p className="mt-2.5 text-pretty font-serif text-[16px] italic text-muted-foreground">
          Your first save unlocks a session — highlight anything in a News Chat.
        </p>
      ) : due.length > 0 ? (
        <>
          <div className="mt-2.5 flex items-baseline gap-2.5">
            <span className="font-serif text-[44px] font-medium leading-none text-foreground">
              {due.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {due.length === 1 ? "phrase" : "phrases"} waiting for you
            </span>
          </div>
          <div className="mt-3.5 flex flex-col gap-[5px]">
            {due.slice(0, SESSION_SIZE).map((p) => {
              const box = srs[p.id]?.box;
              const tag = box == null ? "new" : box >= RECALL_BOX ? "from memory" : "";
              return (
                <div key={p.id} className="flex items-baseline gap-2">
                  <span className="size-[5px] flex-none border border-gold bg-ochre-line" />
                  <span className="min-w-0 truncate font-serif text-[14.5px] italic text-foreground">
                    {p.text}
                  </span>
                  {tag && (
                    <span className="flex-none font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
                      {tag}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <Button
            size="lg"
            className="mt-[18px] w-full"
            onClick={() => void startDrill()}
            disabled={loadingDrill}
          >
            {loadingDrill ? "Setting up…" : "Start today's session"}
          </Button>
          <p className="mt-2.5 text-center font-mono text-[10.5px] text-muted-foreground">
            ≈ {sessionMinutes} {sessionMinutes === 1 ? "minute" : "minutes"} · one sentence each
          </p>
        </>
      ) : (
        <p className="mt-2.5 text-pretty font-serif text-[16px] italic text-muted-foreground">
          All caught up — nothing due right now. New saves come back the same day.
        </p>
      )}
    </div>
  );

  return (
    <PageContainer width="wide" className="max-w-[1120px]">
      <div>
        <div className="kicker">Practice · Phrasebook</div>
        <h1 className="mt-1.5 text-[30px] tracking-tight">Your commonplace book</h1>
        <p className="mt-1.5 max-w-[560px] text-pretty text-[15px] text-muted-foreground">
          Phrases you met in the wild, practiced the only way that sticks — by
          saying them yourself.
        </p>
      </div>

      <div className="mt-6 lg:hidden">{sessionCard}</div>

      <div className="mt-6 grid items-start gap-10 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
        <div className="min-w-0">
          {/* Search + state filters share one rule — the library's only chrome. */}
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-input pb-2.5">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your phrases…"
              aria-label="Search your phrases"
              className="min-w-[160px] flex-1 bg-transparent py-1 text-[15px] text-foreground outline-none placeholder:font-serif placeholder:italic placeholder:text-muted-foreground/60"
            />
            <div className="flex flex-none gap-4">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "border-b-2 pb-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors",
                    filter === f.id
                      ? "border-brand text-brand-ink"
                      : "border-transparent text-muted-foreground hover:text-brand-ink",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {pool.length === 0 ? (
            <div className="mt-10 bg-card px-8 py-12 text-center">
              <div className="kicker">Nothing collected yet</div>
              <p className="mx-auto mt-3 max-w-md font-serif text-lg leading-snug text-muted-foreground">
                Highlight any word, phrase, or sentence in a{" "}
                <Link href="/news" className="border-b border-input text-brand hover:border-brand">
                  News Chat
                </Link>{" "}
                — the briefing, your partner&apos;s replies, even the Ask margin —
                and save it here. It joins your practice rotation the same day.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <p className="mt-8 font-serif text-sm italic text-muted-foreground">
              Nothing matches — clear the search or pick another filter.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="mt-7">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "font-mono text-[11px] uppercase tracking-[0.08em]",
                      g.cls,
                    )}
                  >
                    {g.label}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    · {g.rows.length}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-col">
                  {g.rows.map((p) => (
                    <PhraseRow
                      key={p.id}
                      phrase={p}
                      rec={srs[p.id]}
                      state={g.key}
                      open={!!expanded[p.id]}
                      onToggle={() =>
                        setExpanded((x) => ({ ...x, [p.id]: !x[p.id] }))
                      }
                      onRemove={() => removePhrase(p.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}

          <p className="mt-6 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
            Your{" "}
            <Link href="/coach" className="border-b border-input text-brand hover:border-brand">
              Phrase Coach
            </Link>{" "}
            practices this same pool in conversation.
          </p>
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-8">
          <div className="hidden lg:block">{sessionCard}</div>

          <div className="bg-card p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              This week
            </div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="font-serif text-[26px] font-semibold leading-none text-foreground">
                {week.total}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {week.total === 1 ? "phrase" : "phrases"} applied in real situations
              </span>
            </div>
            <div className="mt-3.5 flex h-11 items-end gap-1.5">
              {week.counts.map((v, i) => (
                <div key={week.days[i]} className="flex h-full flex-1 items-end">
                  <div
                    className={cn(
                      "w-full",
                      week.days[i] === week.today
                        ? "bg-gold"
                        : v
                          ? "bg-oxford-line"
                          : "bg-muted",
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
          </div>

          <div className="bg-card p-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              The journey
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              {(
                [
                  [stats.new, "New", false],
                  [stats.learning, "Learning", false],
                  [stats.mastered, "Mastered", true],
                ] as [number, string, boolean][]
              ).map(([value, label, accent], i) => (
                <div key={label} className="contents">
                  {i > 0 && <span className="text-sm text-input">→</span>}
                  <div className="flex-1 text-center">
                    <div
                      className={cn(
                        "font-serif text-[22px] font-semibold leading-none",
                        accent ? "text-brand-ink" : "text-foreground",
                      )}
                    >
                      {value}
                    </div>
                    <div
                      className={cn(
                        "mt-1 font-mono text-[9.5px] uppercase tracking-[0.06em]",
                        accent ? "text-brand" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3.5 text-pretty text-[13px] text-muted-foreground">
              Every clean use moves a phrase one step right. Five in a row and
              it&apos;s yours.
            </p>
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
