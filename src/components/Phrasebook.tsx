"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, Send } from "lucide-react";
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
import { SRS_INTERVALS, isDue, phraseState, srsSummary } from "@/lib/shared/srs";
import { countWords } from "@/lib/shared/stats";
import { addDays, parseDayKey, prettyDay, todayKey } from "@/lib/shared/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";

/**
 * The Phrasebook (docs/PHRASEBOOK.md) — the learner's own commonplace book of
 * language: words, phrases, idioms, patterns, collocations — captured across
 * the app or mined from News Chat missions.
 *
 * Two layers meet here:
 *
 *   The LIBRARY is a commonplace book — searchable, filterable (by SRS state
 *   and by lexical kind), rows grouped Due / Learning / Mastered, each
 *   expanding into its example, "similar ways", partner words and provenance.
 *   A sticky rail carries the practice launcher (Today's session), the week's
 *   applications, and the new → learning → mastered journey.
 *
 *   PRACTICE is four learner-chosen MODES, one per strand of a balanced
 *   program (Nation's four strands):
 *     mixed  — meaning-focused output: AI scenario rounds, methods interleaved.
 *     recall — retrieval practice: the item starts hidden; pull it from memory,
 *              then apply it. Brand-new items get a timed study-flash first.
 *     sprint — fluency development: timed rounds over FAMILIAR items only;
 *              misses never punish, clean uses still advance the schedule.
 *     study  — language-focused learning: the full card, closed by writing your
 *              own example. Never moves the schedule — study isn't testing.
 *
 * Whatever the mode, the round always ends the same way: the learner writes
 * their own sentence, and the session closes on an honest debrief.
 */

/** Rounds per session — enough to feel real, short enough to finish. */
const SESSION_SIZE = 6;
/** From this Leitner box up, mixed-mode rounds hide the phrase first. */
const RECALL_BOX = 2;
/** Seconds per sprint round. */
const SPRINT_SECONDS = 45;
/** Seconds a brand-new item is shown before writing it from memory. */
const FLASH_SECONDS = 7;

/**
 * Capture never fails, but enrichment can (docs/PHRASEBOOK.md): a highlight
 * saved before/without a meaning still belongs in the library and the rotation.
 * These stand in for the missing gloss so a raw capture reads as intentional.
 */
const RAW_MEANING_LIBRARY = "saved as you highlighted it — details pending";
const RAW_MEANING_DRILL = "saved exactly as you highlighted it";
/** Transcribe doesn't capture by highlighting — a word lands here because the
 *  ear missed it twice, and saying so is more use than a generic stand-in. */
const MISHEARD_LIBRARY = "misheard while transcribing — details pending";
const MISHEARD_DRILL = "your ear missed this one while transcribing";

function rawMeaning(phrase: Phrase, where: "library" | "drill"): string {
  if (phrase.captured?.module === "Transcribe") {
    return where === "library" ? MISHEARD_LIBRARY : MISHEARD_DRILL;
  }
  return where === "library" ? RAW_MEANING_LIBRARY : RAW_MEANING_DRILL;
}

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

/** How one round ended — drives the rail and the debrief. */
type Outcome = "clean" | "peek" | "miss";

interface RoundResult {
  outcome: Outcome;
  sentence: string;
  /** Leitner box before this round — the debrief computes "returns in…" from it. */
  prevBox: number;
}

type View =
  | { kind: "library" }
  | { kind: "drill" }
  | { kind: "done"; produced: number; total: number };

type Filter = "all" | "due" | "learning" | "mastered";
type RowState = "due" | "learning" | "mastered";

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
  peek: { text: "applied · with help", cls: "text-gold" },
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

function KindTag({ kind }: { kind: LexKind }) {
  return (
    <span className="flex-none border border-input bg-muted px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
      {KIND_LABEL[kind]}
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
  const cols = phrase.collocations ?? [];
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
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-serif text-[16px] font-medium text-foreground">
              {phrase.text}
            </span>
            <KindTag kind={kindOf(phrase)} />
          </div>
          <div className="mt-px truncate text-[13px] text-muted-foreground">
            {phrase.meaning || rawMeaning(phrase, "library")}
          </div>
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
          {cols.length > 0 && (
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                Travels with
              </span>
              <span className="text-[13px] text-foreground/80">{cols.join(" · ")}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/80">
              {phrase.captured ? (
                <>
                  From {phrase.captured.module} · {prettyDay(phrase.captured.day)}
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

  const [view, setView] = useState<View>({ kind: "library" });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [kindFilter, setKindFilter] = useState<LexKind | "all">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<PracticeMode>("mixed");

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
  const [results, setResults] = useState<RoundResult[]>([]);
  const [producedCount, setProducedCount] = useState(0);
  const [loadingDrill, setLoadingDrill] = useState(false);

  const due = useMemo(() => dueOrder(pool, srs), [pool, srs]);
  const familiar = useMemo(
    () => pool.filter((p) => (srs[p.id]?.box ?? 0) >= 1),
    [pool, srs],
  );
  const stats = useMemo(() => srsSummary(pool.map((p) => p.id), srs), [pool, srs]);
  const kindsPresent = useMemo(() => [...new Set(pool.map(kindOf))] as LexKind[], [pool]);

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
    setResults([]);
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
      setResults((rs) => [
        ...rs,
        { outcome: "miss", sentence: "", prevBox: srs[rounds[idx]?.phrase.id]?.box ?? 0 },
      ]);
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
    const prevBox = srs[round.phrase.id]?.box ?? 0;
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
    setResults((rs) => [
      ...rs,
      { outcome: clean ? "clean" : j.used ? "peek" : "miss", sentence, prevBox },
    ]);
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
    const last = results[results.length - 1];
    const outcome: Outcome | null = result ? last?.outcome ?? null : null;

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
        <div className="mt-0.5 text-sm text-muted-foreground">
          {round.phrase.meaning || rawMeaning(round.phrase, "drill")}
        </div>
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
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setView({ kind: "library" })}
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
                    done ? `${r.phrase.text} — ${OUTCOME_LABEL[done.outcome].text}` : `Round ${i + 1}`
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

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="kicker">
            {MODE_META[sessionMode].label} · round {idx + 1} of {rounds.length}
          </span>
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
        </div>

        {/* The scene (skipped in study mode — the card is the scene). */}
        {!study && (
          <div className="mt-3 border-l-2 border-gold bg-secondary/40 py-3 pl-4 pr-4">
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
                placeholder={flashActive ? "Memorize it first…" : "Answer in your own sentence…"}
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
                ? outcome === "clean"
                  ? "border-brand bg-brand-muted text-brand-ink"
                  : "border-ochre-line bg-ochre-tint text-gold"
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
              {idx + 1 >= rounds.length ? "See your debrief" : "Next"} <ArrowRight />
            </Button>
          </div>
        )}
      </PageContainer>
    );
  }

  // ---- done — the session debrief -------------------------------------------

  if (view.kind === "done") {
    const study = sessionMode === "study";
    return (
      <PageContainer width="default">
        <button
          type="button"
          onClick={() => setView({ kind: "library" })}
          className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
        >
          ‹ Phrasebook
        </button>
        <div className="mt-5 bg-card p-6 sm:px-14 sm:py-12">
          <div className="kicker">{MODE_META[sessionMode].label} · session debrief</div>
          <h2 className="mt-2.5 text-[26px]">
            {view.produced} of {view.total}{" "}
            {study ? "made your own." : "said in your own words."}
          </h2>
          <p className="mt-2 text-pretty text-[14.5px] text-muted-foreground">
            {study
              ? "Study feeds understanding — the schedule moves when you apply items in Mixed or Recall."
              : sessionMode === "sprint"
                ? "Speed work sharpens what you already know — clean uses moved up the schedule, misses cost nothing."
                : "These are your sentences — not the app's. Clean uses earned a longer rest; the rest come straight back."}
          </p>
          <div className="mt-6 flex flex-col">
            {rounds.map((round, i) => {
              const r = results[i] ?? { outcome: "miss" as Outcome, sentence: "", prevBox: 0 };
              const tile = OUTCOME_TILE[r.outcome];
              const label = OUTCOME_LABEL[r.outcome];
              const returns = study
                ? "study — schedule unchanged"
                : r.outcome === "clean"
                  ? intervalLabel(SRS_INTERVALS[Math.min(SRS_INTERVALS.length - 1, r.prevBox + 1)])
                  : sessionMode === "sprint"
                    ? "no penalty — stays as it was"
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
                      <KindTag kind={kindOf(round.phrase)} />
                      <span
                        className={cn("font-mono text-[10px] uppercase tracking-wide", label.cls)}
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
              Anything still due comes back in tomorrow&apos;s words — same pool, same schedule.
            </p>
            <Button className="flex-none" onClick={() => setView({ kind: "library" })}>
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
    !q || p.text.toLowerCase().includes(q) || (p.meaning || "").toLowerCase().includes(q);
  const stateOf = (p: Phrase): RowState => {
    const rec = srs[p.id];
    if (isDue(rec)) return "due";
    return phraseState(rec) === "mastered" ? "mastered" : "learning";
  };
  const visible = pool.filter(
    (p) =>
      matchesQuery(p) &&
      (filter === "all" || stateOf(p) === filter) &&
      (kindFilter === "all" || kindOf(p) === kindFilter),
  );

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

  const sessionItems = itemsFor(mode);
  const selectedCount = sessionItems.length;
  const sessionMinutes = Math.max(1, Math.round(selectedCount * 0.7));
  const startLabel = loadingDrill
    ? "Setting up…"
    : selectedCount === 0
      ? mode === "sprint"
        ? "Nothing familiar yet"
        : mode === "study"
          ? "Nothing to study yet"
          : "All caught up"
      : `Practice now (${selectedCount})`;

  const sessionCard = (
    <div className="bg-card p-6">
      <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-gold">
        Today&apos;s session
      </div>
      {pool.length === 0 ? (
        <p className="mt-2.5 text-pretty font-serif text-[16px] italic text-muted-foreground">
          Your first word unlocks a session — meet today&apos;s, or highlight
          anything in a News Chat.
        </p>
      ) : (
        <>
          {/* Mode chooser — one mode per strand of a balanced program. */}
          <div className="mt-3 grid grid-cols-2 gap-1.5">
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
                    "border px-2.5 py-2 text-left transition-colors",
                    active
                      ? "border-brand bg-brand-muted"
                      : "border-input bg-card hover:bg-secondary",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span
                      className={cn(
                        "text-[13px] font-semibold",
                        active ? "text-brand-ink" : "text-foreground",
                      )}
                    >
                      {MODE_META[m].label}
                    </span>
                    <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                      {n}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wide text-muted-foreground">
                    {MODE_META[m].strand}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-[12.5px] leading-snug text-muted-foreground">
            {MODE_META[mode].desc}
          </p>
          {selectedCount > 0 && (
            <div className="mt-3 flex flex-col gap-[5px]">
              {sessionItems.slice(0, 4).map((p) => {
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
          )}
          <Button
            size="lg"
            className="mt-3.5 w-full"
            onClick={() => void startDrill(mode)}
            disabled={selectedCount === 0 || loadingDrill}
          >
            {startLabel}
          </Button>
          {selectedCount > 0 && (
            <p className="mt-2.5 text-center font-mono text-[10.5px] text-muted-foreground">
              ≈ {sessionMinutes} {sessionMinutes === 1 ? "minute" : "minutes"} · one sentence each
            </p>
          )}
        </>
      )}
    </div>
  );

  return (
    <PageContainer width="wide" className="max-w-[1120px]">
      <div>
        <div className="kicker">Practice · Phrasebook</div>
        <h1 className="mt-1.5 text-[30px] tracking-tight">Your commonplace book</h1>
        <p className="mt-1.5 max-w-[560px] text-pretty text-[15px] text-muted-foreground">
          Words, phrases, idioms, patterns — everything you&apos;ve collected,
          practiced the only way that sticks: by saying them yourself.
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

          {/* Kind filter — the book holds every kind of unit. */}
          {kindsPresent.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(["all", ...kindsPresent] as (LexKind | "all")[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={cn(
                    "border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide transition-colors",
                    kindFilter === k
                      ? "border-brand bg-brand-muted text-brand-ink"
                      : "border-input bg-card text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {k === "all" ? "all" : KIND_LABEL[k]}
                </button>
              ))}
            </div>
          )}

          {pool.length === 0 ? (
            <div className="mt-10 bg-card px-8 py-12 text-center">
              <div className="kicker">Nothing collected yet</div>
              <p className="mx-auto mt-3 max-w-md font-serif text-lg leading-snug text-muted-foreground">
                Two ways in. Meet{" "}
                <Link href="/words" className="border-b border-input text-brand hover:border-brand">
                  today&apos;s words
                </Link>{" "}
                and they land here on their schedule — or highlight any word,
                phrase, or sentence in a{" "}
                <Link href="/news" className="border-b border-input text-brand hover:border-brand">
                  News Chat
                </Link>{" "}
                and save it yourself. Either way it joins the rotation the same day.
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
                  <span className={cn("font-mono text-[11px] uppercase tracking-[0.08em]", g.cls)}>
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
                      onToggle={() => setExpanded((x) => ({ ...x, [p.id]: !x[p.id] }))}
                      onRemove={() => removePhrase(p.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}

          <p className="mt-6 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
            <Link href="/words" className="border-b border-input text-brand hover:border-brand">
              Daily words
            </Link>{" "}
            keeps feeding this book — same pool, same schedule.
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
                      week.days[i] === week.today ? "bg-gold" : v ? "bg-oxford-line" : "bg-muted",
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
