"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, Send, Trash2 } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type {
  DrillJudgment,
  DrillMethod,
  DrillRoundSetup,
  LexKind,
  Phrase,
  PracticeMode,
  SrsRecord,
} from "@/types";
import { drillPhrases, judgePhrase } from "@/lib/client/clientApi";
import { DRILL_TASKS, phraseMatcher } from "@/lib/shared/phrases";
import { isDue, phraseState, srsSummary } from "@/lib/shared/srs";
import { countWords } from "@/lib/shared/stats";
import { prettyDay, todayKey } from "@/lib/shared/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";

/**
 * The Phrasebook (docs/PHRASEBOOK.md) — the learner's own collection of
 * language: words, phrases, idioms, patterns, collocations — captured across
 * the app or mined from News Chat missions.
 *
 * Practice is organized as four learner-chosen MODES, one per strand of a
 * balanced program (Nation's four strands):
 *
 *   mixed  — meaning-focused output: AI scenario rounds, methods interleaved
 *            (moments, replies, upgrades, partner-words for single words).
 *   recall — retrieval practice: the item starts hidden; pull it from memory,
 *            then apply it. Brand-new items get a timed study-flash first,
 *            then are written from memory (delayed copy).
 *   sprint — fluency development: timed rounds over FAMILIAR items only;
 *            misses never punish, clean uses still advance the schedule.
 *   study  — language-focused learning: the full card (meaning, examples,
 *            origin, alternatives, collocations), closed by writing your own
 *            example. Never moves the schedule — study isn't testing.
 *
 * Whatever the mode, the round always ends the same way: the learner writes
 * their own sentence. Production is the through-line, not an option.
 */

/** Rounds per session — enough to feel real, short enough to finish. */
const SESSION_SIZE = 6;
/** From this Leitner box up, mixed-mode rounds hide the phrase first. */
const RECALL_BOX = 2;
/** Seconds per sprint round. */
const SPRINT_SECONDS = 45;
/** Seconds a brand-new item is shown before writing it from memory. */
const FLASH_SECONDS = 7;

const MODE_META: Record<PracticeMode, { label: string; strand: string; desc: string }> = {
  mixed: {
    label: "Mixed",
    strand: "use it",
    desc: "Real-life rounds — moments, replies, upgrades — with the method changing every round.",
  },
  recall: {
    label: "Recall",
    strand: "remember it",
    desc: "The item starts hidden: pull it from memory, then use it. New items flash first, then you write them from memory.",
  },
  sprint: {
    label: "Sprint",
    strand: "speed it up",
    desc: `${SPRINT_SECONDS}s a round, familiar items only. Misses cost nothing; clean uses still count.`,
  },
  study: {
    label: "Study",
    strand: "understand it",
    desc: "The full card — meaning, examples, similar ways, partners — then write your own example. Doesn't move the schedule.",
  },
};

const MODE_ORDER: PracticeMode[] = ["mixed", "recall", "sprint", "study"];

/** How each method reads in the round header. */
const METHOD_META: Record<DrillMethod, { label: string }> = {
  situation: { label: "The moment" },
  reply: { label: "Reply to them" },
  rephrase: { label: "Upgrade it" },
  personal: { label: "Make it yours" },
  collocation: { label: "Word partners" },
};

const KIND_LABEL: Record<LexKind, string> = {
  word: "word",
  phrase: "phrase",
  idiom: "idiom",
  pattern: "pattern",
  collocation: "colloc.",
  sentence: "sentence",
};

/** Items saved before kinds existed default by shape. */
function kindOf(p: Phrase): LexKind {
  return p.kind ?? (p.text.includes("___") ? "pattern" : "phrase");
}

/** Offline/failure fallback packs — generic but still production, rotating
 *  through the methods that work without phrase-specific content (rephrase
 *  needs an AI-written plain sentence, so it's online-only). */
const LOCAL_PACKS: { method: DrillMethod; setup: string }[] = [
  {
    method: "situation",
    setup: "A friend texts you: “how's everything going?” — and they really want to know.",
  },
  {
    method: "reply",
    setup: "Alex: Did you see that thing everyone's talking about today?\nAlex: So — what do you think?",
  },
  {
    method: "personal",
    setup: "Think of one real moment from your week where this phrase fits.",
  },
  {
    method: "situation",
    setup: "You're telling a colleague about something that happened yesterday, and they ask for the details.",
  },
  {
    method: "reply",
    setup: "Sam: I can't decide if I should try it or not.\nSam: You know about this — what would you do?",
  },
  {
    method: "personal",
    setup: "Think of a place, a habit, or an opinion of yours this phrase is true about.",
  },
];

interface DrillRound {
  phrase: Phrase;
  method: DrillMethod;
  /** The scene: a moment, a "Name: line" mini-chat, or the plain sentence.
   *  Empty in study mode — the card itself is the scene. */
  setup: string;
  /** What to write. */
  task: string;
  /** Worked examples using the phrase in other contexts (inert input). */
  examples: string[];
  /** Phrase hidden at first — retrieve from meaning, then apply. */
  recall: boolean;
  /** Brand-new item in recall mode: show briefly, then write from memory. */
  flash: boolean;
  /** True when the setup came from the local fallback, not the AI. */
  offline: boolean;
}

type View =
  | { kind: "library" }
  | { kind: "drill" }
  | { kind: "done"; produced: number; total: number };

/** Due-first (brand-new first), then saved order — the session order. */
function dueOrder(pool: Phrase[], srs: Record<string, SrsRecord>): Phrase[] {
  const today = todayKey();
  return pool
    .filter((p) => isDue(srs[p.id], today))
    .sort((a, b) => {
      const ra = srs[a.id];
      const rb = srs[b.id];
      if (!ra !== !rb) return ra ? 1 : -1;
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

function KindTag({ kind }: { kind: LexKind }) {
  return (
    <span className="flex-none border border-input bg-muted px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
      {KIND_LABEL[kind]}
    </span>
  );
}

export function Phrasebook() {
  const { store, reviewPhrases, removePhrase } = useStore();
  const pool = store.minedPhrases;
  const srs = store.phraseSrs;
  const level = store.newsLevel;

  const [view, setView] = useState<View>({ kind: "library" });
  const [mode, setMode] = useState<PracticeMode>("mixed");
  const [kindFilter, setKindFilter] = useState<LexKind | "all">("all");

  // Drill session state.
  const [sessionMode, setSessionMode] = useState<PracticeMode>("mixed");
  const [rounds, setRounds] = useState<DrillRound[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [flashed, setFlashed] = useState(false);
  const [flashLeft, setFlashLeft] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [judging, setJudging] = useState(false);
  const [result, setResult] = useState<DrillJudgment | null>(null);
  const [producedCount, setProducedCount] = useState(0);
  const [loadingDrill, setLoadingDrill] = useState(false);

  const due = useMemo(() => dueOrder(pool, srs), [pool, srs]);
  const familiar = useMemo(
    () => pool.filter((p) => (srs[p.id]?.box ?? 0) >= 1),
    [pool, srs],
  );
  const stats = useMemo(() => srsSummary(pool.map((p) => p.id), srs), [pool, srs]);
  const kindsPresent = useMemo(
    () => [...new Set(pool.map(kindOf))] as LexKind[],
    [pool],
  );

  /** Which items a mode draws from (and how many are ready right now). */
  function itemsFor(m: PracticeMode): Phrase[] {
    switch (m) {
      case "mixed":
      case "recall":
        return due.slice(0, SESSION_SIZE);
      case "sprint": {
        const dueFam = familiar.filter((p) => isDue(srs[p.id]));
        const rest = familiar.filter((p) => !isDue(srs[p.id]));
        return [...dueFam, ...rest].slice(0, SESSION_SIZE);
      }
      case "study":
        return [...pool].reverse().slice(0, SESSION_SIZE);
    }
  }

  async function startDrill(m: PracticeMode) {
    const items = itemsFor(m);
    if (items.length === 0 || loadingDrill) return;
    setLoadingDrill(true);

    let byId = new Map<string, DrillRoundSetup>();
    if (m === "mixed") {
      // Only mixed mode needs the AI round-builder; the other modes run on
      // the item's own stored material — instant and offline-safe.
      try {
        const fetched = await drillPhrases(
          level,
          items.map((p) => ({
            id: p.id,
            text: p.text,
            meaning: p.meaning,
            example: p.example || undefined,
            kind: p.kind,
          })),
        );
        byId = new Map(fetched.map((r) => [r.id, r]));
      } catch {
        // Offline — every round falls back to a local pack below.
      }
    }

    setRounds(
      items.map((p, i) => {
        const r = byId.get(p.id);
        const local = LOCAL_PACKS[i % LOCAL_PACKS.length];
        const isNew = !srs[p.id];
        const method = m === "study" ? "personal" : (r?.method ?? local.method);
        const examples = [...(r?.examples ?? []), p.example]
          .filter((e): e is string => !!e && e.trim().length > 0)
          .filter((e) => e.trim().toLowerCase() !== p.text.trim().toLowerCase())
          .filter(
            (e, n, arr) =>
              arr.findIndex((x) => x.trim().toLowerCase() === e.trim().toLowerCase()) === n,
          )
          .slice(0, 3);
        return {
          phrase: p,
          method,
          setup: m === "study" ? "" : (r?.setup ?? local.setup),
          task:
            m === "study"
              ? "Make it yours — write your own example sentence, about your life."
              : (r?.task ?? DRILL_TASKS[method]),
          examples,
          recall:
            m === "recall" ? true : m === "mixed" ? (srs[p.id]?.box ?? 0) >= RECALL_BOX : false,
          flash: m === "recall" && isNew,
          offline: m === "mixed" ? !r : false,
        };
      }),
    );
    setSessionMode(m);
    setIdx(0);
    setAnswer("");
    setRevealed(false);
    setFlashed(false);
    setFlashLeft(null);
    setTimeLeft(null);
    setExamplesOpen(false);
    setResult(null);
    setProducedCount(0);
    setLoadingDrill(false);
    setView({ kind: "drill" });
  }

  // Study-flash for brand-new items in recall mode: show the card briefly,
  // then hide it — writing from memory is the round (delayed copy).
  useEffect(() => {
    if (view.kind !== "drill") return;
    const round = rounds[idx];
    if (!round?.flash) {
      setFlashLeft(null);
      return;
    }
    setFlashLeft(FLASH_SECONDS);
    const iv = setInterval(() => {
      setFlashLeft((s) => {
        if (s === null) return s;
        if (s <= 1) {
          setFlashed(true);
          return null;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [view.kind, idx, rounds]);

  // Sprint countdown per round.
  useEffect(() => {
    if (view.kind !== "drill" || sessionMode !== "sprint" || result !== null) return;
    setTimeLeft(SPRINT_SECONDS);
    const iv = setInterval(
      () => setTimeLeft((t) => (t === null ? t : Math.max(0, t - 1))),
      1000,
    );
    return () => clearInterval(iv);
  }, [view.kind, sessionMode, idx, result]);

  // Sprint expiry: send what's there, or pass with zero penalty.
  useEffect(() => {
    if (timeLeft !== 0 || view.kind !== "drill" || sessionMode !== "sprint" || result !== null)
      return;
    setTimeLeft(null);
    if (answer.trim()) {
      void submit();
    } else {
      setResult({
        used: false,
        note: "Time! Sprint is about speed with what you know — no penalty. On to the next.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

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
        `${round.setup}\n${round.task}`.trim(),
        sentence,
      );
    } catch {
      const used =
        countWords(sentence) >= 4 && phraseMatcher(round.phrase.text).test(sentence);
      j = {
        used,
        note: used
          ? "You worked it into your own sentence — that's the whole game."
          : "I couldn't spot it in there — look where it would fit, and it'll come back around.",
      };
    }

    // Scheduling is honest and mode-aware:
    //  study  — never touches the schedule (study isn't testing);
    //  sprint — clean uses advance, misses cost nothing (fluency ≠ pressure);
    //  others — clean earns an interval; peeked/flashed stays due; miss lapses.
    const clean = j.used && !revealed && !flashed;
    if (sessionMode === "study") {
      // no-op
    } else if (sessionMode === "sprint") {
      if (clean) reviewPhrases([round.phrase.id], true);
    } else {
      if (clean) reviewPhrases([round.phrase.id], true);
      else if (!j.used) reviewPhrases([round.phrase.id], false);
    }
    if (clean || (sessionMode === "study" && j.used)) setProducedCount((n) => n + 1);
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
    setFlashed(false);
    setExamplesOpen(false);
    setResult(null);
  }

  /** Worked examples necessarily show the phrase — in a recall round, opening
   *  them IS the peek (recorded the same way; the phrase just stays due). */
  function openExamples() {
    setExamplesOpen(true);
    const round = rounds[idx];
    if (round?.recall && result === null) setRevealed(true);
  }

  // ---- drill ----------------------------------------------------------------

  if (view.kind === "drill") {
    const round = rounds[idx];
    if (!round) return null;
    const flashActive = flashLeft !== null && flashLeft > 0;
    const showPhrase = flashActive || !round.recall || revealed || result !== null;
    const study = sessionMode === "study";

    const fullCard = (
      <>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-serif text-lg font-semibold">{round.phrase.text}</span>
          <KindTag kind={kindOf(round.phrase)} />
          {round.phrase.register && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {round.phrase.register}
            </span>
          )}
        </div>
        {round.phrase.meaning && (
          <div className="mt-0.5 text-sm text-muted-foreground">{round.phrase.meaning}</div>
        )}
        {round.phrase.collocations && round.phrase.collocations.length > 0 && (
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">
            travels with:{" "}
            <span className="text-foreground/80">{round.phrase.collocations.join(" · ")}</span>
          </div>
        )}
      </>
    );

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
            {MODE_META[sessionMode].label} · round {idx + 1} of {rounds.length}
          </span>
          <span className="flex items-center gap-3">
            {sessionMode === "sprint" && timeLeft !== null && result === null && (
              <span
                className={cn(
                  "font-mono text-[13px] font-semibold tabular-nums",
                  timeLeft <= 10 ? "text-gold" : "text-muted-foreground",
                )}
              >
                {timeLeft}s
              </span>
            )}
            <span className="inline-flex gap-1">
              {rounds.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "size-2 rounded-full",
                    i < idx
                      ? "bg-brand"
                      : i === idx
                        ? "bg-brand/40 ring-2 ring-brand/25"
                        : "bg-muted-foreground/20",
                  )}
                />
              ))}
            </span>
          </span>
        </div>

        {/* The scene (skipped in study mode — the card is the scene). */}
        {!study && (
          <div className="mt-4 border-l-2 border-gold bg-secondary/40 py-3 pl-4 pr-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {METHOD_META[round.method].label}
              {round.offline ? " · offline" : ""}
            </div>
            <p className="mt-1.5 whitespace-pre-line font-serif text-[16px] leading-relaxed text-foreground">
              {round.setup}
            </p>
            <p className="mt-2 text-[12.5px] text-muted-foreground">{round.task}</p>
          </div>
        )}

        {/* The item card. */}
        <div className={cn("border border-border bg-card p-3.5", study ? "mt-4" : "mt-3")}>
          {flashActive ? (
            <>
              {fullCard}
              <div className="mt-2 font-mono text-[11px] text-gold">
                Memorize it — {flashLeft}s, then write it from memory.
              </div>
            </>
          ) : showPhrase ? (
            <>
              {fullCard}
              {study && (
                <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                  {round.phrase.example && (
                    <div className="select-none font-serif italic text-foreground/90">
                      “{round.phrase.example}”
                    </div>
                  )}
                  {round.phrase.origin && (
                    <div className="text-muted-foreground">
                      <span className="font-mono text-[10px] uppercase tracking-wide">origin</span>{" "}
                      {round.phrase.origin}
                    </div>
                  )}
                  {round.phrase.alternatives && round.phrase.alternatives.length > 0 && (
                    <div className="text-muted-foreground">
                      <span className="font-mono text-[10px] uppercase tracking-wide">
                        similar ways
                      </span>{" "}
                      {round.phrase.alternatives
                        .map((a) => a.text + (a.note ? ` (${a.note})` : ""))
                        .join(" · ")}
                    </div>
                  )}
                  {round.phrase.captured?.context && (
                    <div className="text-muted-foreground">
                      <span className="font-mono text-[10px] uppercase tracking-wide">
                        you met it in
                      </span>{" "}
                      <span className="font-serif italic">
                        “{round.phrase.captured.context.slice(0, 120)}
                        {round.phrase.captured.context.length > 120 ? "…" : ""}”
                      </span>
                    </div>
                  )}
                  <p className="pt-1 text-[12.5px] text-muted-foreground">{round.task}</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  From memory — your {KIND_LABEL[kindOf(round.phrase)]} for:
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
                title="Peeking is fine — the item just stays due for next time"
              >
                <Eye /> Peek
              </Button>
            </div>
          )}
          {(revealed || flashed) && result === null && !flashActive && (
            <div className="mt-2 font-mono text-[11px] text-gold">
              {flashed && !revealed
                ? "From memory now — it stays due today for a clean try next time."
                : "Peeked — use it now and it'll stay due for a clean try next time."}
            </div>
          )}
        </div>

        {/* Worked examples + similar ways — inert input to learn from. */}
        {!study &&
          (round.examples.length > 0 || (round.phrase.alternatives?.length ?? 0) > 0) && (
            <div className="mt-2">
              {!examplesOpen ? (
                <button
                  type="button"
                  onClick={openExamples}
                  className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
                >
                  See it used{round.examples.length ? ` (${round.examples.length})` : ""}
                  {round.recall && !revealed && result === null ? " — shows the phrase" : ""} ↓
                </button>
              ) : (
                <div className="border border-border bg-secondary/40 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    In action — now write your own
                  </div>
                  {round.examples.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {round.examples.map((e, i) => (
                        <li
                          key={i}
                          className="select-none font-serif text-[14px] italic leading-relaxed text-foreground/90"
                        >
                          “{e}”
                        </li>
                      ))}
                    </ul>
                  )}
                  {round.phrase.alternatives && round.phrase.alternatives.length > 0 && (
                    <div className="mt-2 text-[12px] text-muted-foreground">
                      Similar ways:{" "}
                      {round.phrase.alternatives
                        .map((a) => a.text + (a.note ? ` (${a.note})` : ""))
                        .join(" · ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
                placeholder={
                  flashActive ? "Memorize it first…" : "Answer in your own sentence…"
                }
                disabled={flashActive}
                autoComplete="off"
                className="w-full resize-none bg-transparent font-serif text-[15.5px] leading-relaxed text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/70 disabled:opacity-60"
              />
            </div>
            <div className="mt-2.5 flex items-center justify-end">
              <Button
                size="sm"
                onClick={() => void submit()}
                disabled={!answer.trim() || judging || flashActive}
              >
                <Send /> {judging ? "Checking…" : "Send"}
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "mt-4 border p-3.5",
              result.used
                ? "border-sage bg-sage-muted text-sage-ink"
                : "border-border bg-secondary/50",
            )}
          >
            <div className="text-sm font-medium">
              {result.used
                ? revealed || flashed
                  ? "✓ Applied — with a little help"
                  : "✓ Applied, your own words"
                : sessionMode === "sprint"
                  ? "Passed"
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
            {!result.used && sessionMode !== "sprint" && sessionMode !== "study" && (
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
          <div className="kicker">
            {MODE_META[sessionMode].label} session done
          </div>
          <div className="mt-2 font-serif text-2xl font-medium">
            {view.produced} of {view.total}{" "}
            {sessionMode === "study" ? "made your own." : "applied in real situations."}
          </div>
          <p className="mt-2 text-sm opacity-90">
            {sessionMode === "study"
              ? "Study feeds understanding — the schedule moves when you apply items in Mixed or Recall."
              : sessionMode === "sprint"
                ? "Speed work sharpens what you already know — clean uses moved up the schedule."
                : "Clean applications moved up the schedule; the rest stay due — your Phrase Coach and tomorrow's session will bring them back."}
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => setView({ kind: "library" })}
          >
            ‹ Back to your Phrasebook
          </Button>
        </div>
      </PageContainer>
    );
  }

  // ---- library --------------------------------------------------------------

  const selectedCount = itemsFor(mode).length;
  const shown =
    kindFilter === "all" ? pool : pool.filter((p) => kindOf(p) === kindFilter);

  return (
    <PageContainer width="wide">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Practice · Phrasebook</div>
          <h1 className="mt-1.5 text-[28px] tracking-tight">Say it, don&apos;t just know it.</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Words, phrases, idioms, patterns — everything you&apos;ve collected,
            practiced four ways: use it, remember it, speed it up, understand it.
          </p>
        </div>
      </div>

      {/* Mode chooser — one mode per strand of a balanced program. */}
      <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {MODE_ORDER.map((m) => {
          const n = itemsFor(m).length;
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={active}
              className={cn(
                "border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-primary bg-secondary"
                  : "border-input bg-card hover:bg-accent",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={cn("text-sm font-semibold", active && "text-brand")}>
                  {MODE_META[m].label}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {n} ready
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {MODE_META[m].strand}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] leading-snug text-muted-foreground">
          {MODE_META[mode].desc}
        </p>
        <Button
          size="lg"
          onClick={() => void startDrill(mode)}
          disabled={selectedCount === 0 || loadingDrill}
        >
          {loadingDrill
            ? "Setting up…"
            : selectedCount === 0
              ? mode === "sprint"
                ? "Nothing familiar yet"
                : "All caught up"
              : `Practice now (${selectedCount})`}
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
        <>
          {/* Kind filter — the book holds every kind of unit. */}
          {kindsPresent.length > 1 && (
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              {(["all", ...kindsPresent] as (LexKind | "all")[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={cn(
                    "border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide transition-colors",
                    kindFilter === k
                      ? "border-primary bg-secondary text-brand"
                      : "border-input bg-card text-muted-foreground hover:bg-accent",
                  )}
                >
                  {k === "all" ? "all" : KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-col">
            {due.length === 0 && (
              <div className="border-b border-input pb-3 font-serif text-sm italic text-muted-foreground">
                All caught up — nothing due right now. New saves are due the same day.
              </div>
            )}
            {[...shown].reverse().map((p) => {
              const rec = srs[p.id];
              return (
                <div key={p.id} className="group flex items-start gap-3 border-b border-border py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-serif text-[15.5px] font-medium text-foreground">
                        {p.text}
                      </span>
                      <KindTag kind={kindOf(p)} />
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
        </>
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
