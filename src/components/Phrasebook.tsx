"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, Send, Trash2 } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type { DrillJudgment, Phrase, SrsRecord } from "@/types";
import { drillPhrases, judgePhrase } from "@/lib/client/clientApi";
import { phraseMatcher } from "@/lib/shared/phrases";
import { isDue, phraseState, srsSummary } from "@/lib/shared/srs";
import { countWords } from "@/lib/shared/stats";
import { prettyDay, todayKey } from "@/lib/shared/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";

/**
 * The Phrasebook (docs/PHRASEBOOK.md) — the learner's own collection of
 * language: highlights captured across the app plus phrases mined from News
 * Chat missions. Two views:
 *
 *   library — every saved phrase with its SRS state and where it was captured.
 *   drill   — the practice mode. Production-first by design: each due phrase
 *             gets a real-life situation that CALLS FOR it, and the learner
 *             answers in their own sentence. Never a flashcard flip. Recall
 *             fades in with the schedule: a phrase past box 1 starts hidden
 *             (meaning only — retrieve it, then apply it); peeking is recorded
 *             and the phrase simply stays due instead of earning an interval.
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

type View =
  | { kind: "library" }
  | { kind: "drill" }
  | { kind: "done"; produced: number; total: number };

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

function StateChip({ rec }: { rec: SrsRecord | undefined }) {
  const state = phraseState(rec);
  const due = isDue(rec);
  return (
    <span
      className={cn(
        "flex-none border px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide",
        state === "mastered"
          ? "border-sage bg-sage-muted text-sage-ink"
          : due
            ? "border-gold bg-ochre-tint text-gold"
            : "border-input bg-muted text-muted-foreground",
      )}
    >
      {due ? (state === "new" ? "new · due" : "due") : state}
    </span>
  );
}

export function Phrasebook() {
  const { store, reviewPhrases, removePhrase } = useStore();
  const pool = store.minedPhrases;
  const srs = store.phraseSrs;
  const level = store.newsLevel;

  const [view, setView] = useState<View>({ kind: "library" });

  // Drill session state.
  const [rounds, setRounds] = useState<DrillRound[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [judging, setJudging] = useState(false);
  const [result, setResult] = useState<DrillJudgment | null>(null);
  const [producedCount, setProducedCount] = useState(0);
  const [loadingDrill, setLoadingDrill] = useState(false);

  const due = useMemo(() => dueOrder(pool, srs), [pool, srs]);
  const stats = useMemo(() => srsSummary(pool.map((p) => p.id), srs), [pool, srs]);

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
    setProducedCount(0);
    setLoadingDrill(false);
    setView({ kind: "drill" });
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
    const clean = j.used && !revealed;
    if (clean) reviewPhrases([round.phrase.id], true);
    else if (!j.used) reviewPhrases([round.phrase.id], false);
    if (clean) setProducedCount((n) => n + 1);
    setResult(j);
    setJudging(false);
  }

  function next() {
    if (idx + 1 >= rounds.length) {
      setView({ kind: "done", produced: producedCount, total: rounds.length });
      return;
    }
    setIdx((i) => i + 1);
    setAnswer("");
    setRevealed(false);
    setResult(null);
  }

  // ---- drill ----------------------------------------------------------------

  if (view.kind === "drill") {
    const round = rounds[idx];
    if (!round) return null;
    const rec = srs[round.phrase.id];
    const showPhrase = !round.recall || revealed || result !== null;

    return (
      <PageContainer width="narrow">
        <button
          type="button"
          onClick={() => setView({ kind: "library" })}
          className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
        >
          ‹ Phrasebook
        </button>

        <div className="mt-3 flex items-baseline justify-between">
          <span className="kicker">
            Round {idx + 1} of {rounds.length}
          </span>
          <span className="inline-flex gap-1">
            {rounds.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-2 rounded-full",
                  i < idx ? "bg-brand" : i === idx ? "bg-brand/40 ring-2 ring-brand/25" : "bg-muted-foreground/20",
                )}
              />
            ))}
          </span>
        </div>

        {/* The situation — the real-life moment to answer. */}
        <div className="mt-4 border-l-2 border-gold bg-secondary/40 py-3 pl-4 pr-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            The moment{round.offline ? " · offline" : ""}
          </div>
          <p className="mt-1.5 font-serif text-[16px] leading-relaxed text-foreground">
            {round.situation}
          </p>
        </div>

        {/* The phrase — shown as scaffold early, hidden for recall later. */}
        <div className="mt-3 border border-border bg-card p-3.5">
          {showPhrase ? (
            <>
              <div className="font-serif text-lg font-semibold">{round.phrase.text}</div>
              {round.phrase.meaning && (
                <div className="mt-0.5 text-sm text-muted-foreground">{round.phrase.meaning}</div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  From memory — your phrase for:
                </div>
                <div className="mt-1 text-sm text-foreground">
                  {round.phrase.meaning || "…this situation. You saved it — it's in there."}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRevealed(true)}
                title="Peeking is fine — the phrase just stays due for next time"
              >
                <Eye /> Peek
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
                    void submit();
                  }
                }}
                placeholder="Answer the moment — in your own sentence…"
                autoComplete="off"
                className="w-full resize-none bg-transparent font-serif text-[15.5px] leading-relaxed text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70"
              />
            </div>
            <div className="mt-2.5 flex items-center justify-end">
              <Button size="sm" onClick={() => void submit()} disabled={!answer.trim() || judging}>
                <Send /> {judging ? "Checking…" : "Send"}
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "mt-4 border p-3.5",
              result.used ? "border-sage bg-sage-muted text-sage-ink" : "border-border bg-secondary/50",
            )}
          >
            <div className="text-sm font-medium">
              {result.used
                ? revealed
                  ? "✓ Applied — with a peek"
                  : "✓ Applied, your own words"
                : "Not this time"}
            </div>
            <div className="mt-1 text-sm opacity-90">{result.note}</div>
            {result.upgrade && (
              <div className="mt-2.5 border-t border-current/20 pt-2.5 text-sm">
                <span className="opacity-70">You wrote:</span> “{result.upgrade.you}”
                <br />
                <span className="opacity-70">Try:</span> <b>“{result.upgrade.upgrade}”</b>
                {result.upgrade.why && <span className="opacity-70"> — {result.upgrade.why}</span>}
              </div>
            )}
            {!result.used && rec && (
              <div className="mt-2 font-mono text-[11px] opacity-70">
                Back to the front of the queue — you&apos;ll see it again soon.
              </div>
            )}
            <Button size="sm" className="mt-3" onClick={next}>
              {idx + 1 >= rounds.length ? "Finish" : "Next"} <ArrowRight />
            </Button>
          </div>
        )}
      </PageContainer>
    );
  }

  // ---- done -----------------------------------------------------------------

  if (view.kind === "done") {
    return (
      <PageContainer width="narrow">
        <div className="border border-border bg-sage-muted p-5 text-sage-ink">
          <div className="kicker">Session done</div>
          <div className="mt-2 font-serif text-2xl font-medium">
            {view.produced} of {view.total} applied in real situations.
          </div>
          <p className="mt-2 text-sm opacity-90">
            Clean applications moved up the schedule; the rest stay due — your
            Phrase Coach and tomorrow&apos;s session will bring them back.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => setView({ kind: "library" })}>
            ‹ Back to your Phrasebook
          </Button>
        </div>
      </PageContainer>
    );
  }

  // ---- library --------------------------------------------------------------

  return (
    <PageContainer width="wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Practice · Phrasebook</div>
          <h1 className="mt-1.5 text-[28px] tracking-tight">Say it, don&apos;t just know it.</h1>
        </div>
        <Button size="lg" onClick={() => void startDrill()} disabled={due.length === 0 || loadingDrill}>
          {loadingDrill ? "Setting up…" : `Practice now${due.length ? ` (${Math.min(due.length, SESSION_SIZE)})` : ""}`}
        </Button>
      </div>

      {/* Stats strip */}
      <div className="mt-7 flex flex-wrap items-baseline gap-x-10 gap-y-5 border-y border-input py-4">
        {(
          [
            [stats.dueToday, "Due today", true],
            [stats.new, "New"],
            [stats.learning, "Learning"],
            [stats.mastered, "Mastered"],
          ] as [number, string, boolean?][]
        ).map(([value, label, accent]) => (
          <div key={label} className="flex flex-col">
            <span
              className={cn(
                "font-serif text-[26px] font-semibold leading-none",
                accent ? "text-gold" : "text-foreground",
              )}
            >
              {value}
            </span>
            <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {label}
            </span>
          </div>
        ))}
      </div>

      {pool.length === 0 ? (
        <div className="mt-10 border border-border bg-card p-8 text-center">
          <div className="kicker">Nothing collected yet</div>
          <p className="mx-auto mt-3 max-w-md font-serif text-lg leading-snug text-muted-foreground">
            Highlight any word, phrase, or sentence in a{" "}
            <Link href="/news" className="border-b border-input text-brand hover:border-brand">
              News Chat
            </Link>{" "}
            — the briefing, your partner&apos;s replies, even the Ask margin —
            and save it here. Then practice it the only way that sticks:
            by using it.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col">
          {due.length === 0 && (
            <div className="border-b border-input pb-3 font-serif text-sm italic text-muted-foreground">
              All caught up — nothing due right now. New saves are due the same day.
            </div>
          )}
          {[...pool].reverse().map((p) => {
            const rec = srs[p.id];
            return (
              <div key={p.id} className="group flex items-start gap-3 border-b border-border py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-serif text-[15.5px] font-medium text-foreground">
                      {p.text}
                    </span>
                    <StateChip rec={rec} />
                  </div>
                  {p.meaning && (
                    <div className="mt-0.5 text-[13px] text-muted-foreground">{p.meaning}</div>
                  )}
                  {p.captured && (
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/80">
                      Saved from {p.captured.module} · {prettyDay(p.captured.day)}
                      {p.captured.context && (
                        <span className="normal-case tracking-normal font-serif italic">
                          {" "}
                          — “{p.captured.context.slice(0, 80)}
                          {p.captured.context.length > 80 ? "…" : ""}”
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removePhrase(p.id)}
                  aria-label={`Remove “${p.text}”`}
                  title="Remove from your Phrasebook"
                  className="mt-1 flex-none text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
        Your{" "}
        <Link href="/coach" className="border-b border-input text-brand hover:border-brand">
          Phrase Coach
        </Link>{" "}
        practices this same pool in conversation.
      </p>
    </PageContainer>
  );
}
