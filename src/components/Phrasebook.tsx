"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Swords } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type { ArenaBout, ArenaMarks, ArenaStation, LexKind, Phrase, SrsRecord } from "@/types";
import { arenaMove, peekArena } from "@/lib/client/clientApi";
import {
  BOUT_ITEMS,
  STATIONS_PER_ITEM,
  hasPartnerChunk,
  nativeProgress,
  pickBoutItems,
} from "@/lib/shared/arena";
import { isDue, phraseState, srsSummary } from "@/lib/shared/srs";
import { addDays, parseDayKey, prettyDay, todayKey } from "@/lib/shared/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";
import { ArenaSession } from "@/components/arena/ArenaSession";
import { ArenaDebrief } from "@/components/arena/ArenaDebrief";
import { NativeMeter } from "@/components/arena/NativeMeter";

/**
 * The Phrasebook (docs/PHRASEBOOK.md) — the learner's own commonplace book of
 * language, and the arena where it is fought into fluency.
 *
 *   The LIBRARY is a commonplace book — searchable, filterable (by schedule
 *   and by lexical kind), rows grouped Due / Learning / Mastered, each
 *   expanding into its example, "similar ways", partner words and provenance,
 *   and each showing how far it is from Native.
 *
 *   The ARENA is the only practice. A bout takes a few items and makes each
 *   one work at several stations — recall it, pair it, bend it, change who
 *   it's said to, say a flat line the native way, beat the clock — and every
 *   station is a sentence held until it is right, through the same fences as
 *   Daily Words. An item is Native once it has landed clean at every station.
 *
 * The bout itself lives on the server; this screen shows it and names moves.
 */

/**
 * Capture never fails, but enrichment can: a highlight saved without a
 * meaning still belongs in the book. This stands in for the missing gloss so
 * a raw capture reads as intentional.
 */
function rawMeaning(phrase: Phrase): string {
  // Transcribe doesn't capture by highlighting — a word lands here because the
  // ear missed it twice, and saying so is more use than a generic stand-in.
  return phrase.captured?.module === "Transcribe"
    ? "misheard while transcribing — details pending"
    : "saved as you highlighted it — details pending";
}

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

type View = "library" | "bout" | "debrief";
type Filter = "all" | "due" | "learning" | "mastered";
type RowState = "due" | "learning" | "mastered";

function KindTag({ kind }: { kind: LexKind }) {
  return (
    <span className="rounded-full flex-none border border-input bg-muted px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground">
      {KIND_LABEL[kind]}
    </span>
  );
}

function PhraseRow({
  phrase,
  rec,
  state,
  marks,
  picked,
  open,
  onToggle,
  onPick,
  onRemove,
}: {
  phrase: Phrase;
  rec: SrsRecord | undefined;
  state: RowState;
  marks: ArenaStation[];
  picked: boolean;
  open: boolean;
  onToggle: () => void;
  onPick: () => void;
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
            {phrase.meaning || rawMeaning(phrase)}
          </div>
        </div>
        <div className="flex flex-none items-center gap-4">
          <NativeMeter earned={marks} hasPartner={hasPartnerChunk(phrase.collocations, phrase.text)} />
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
                  className="rounded-full bg-brand-muted px-2 py-px text-[12.5px] text-brand-ink"
                >
                  {a.text}
                </span>
              ))}
              {phrase.register && (
                <span className="rounded-full bg-muted px-2 py-px font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
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
          <div>
            <button
              type="button"
              onClick={onPick}
              aria-pressed={picked}
              className={cn("dw-pill", picked && "border-primary text-primary")}
            >
              {picked ? <Check className="size-3.5" /> : <Swords className="size-3.5" />}
              {picked ? "In your next bout" : "Fight for this one"}
            </button>
          </div>
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
  const { store, removePhrase, refresh } = useStore();
  const pool = store.minedPhrases;
  const srs = store.phraseSrs;

  const [view, setView] = useState<View>("library");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [kindFilter, setKindFilter] = useState<LexKind | "all">("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // The arena: the stored bout and every item's Native marks, both the
  // server's. `picked` is only the learner's choice for the NEXT bout.
  const [bout, setBout] = useState<ArenaBout | null>(null);
  const [marks, setMarks] = useState<ArenaMarks>({});
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const a = await peekArena();
      setBout(a.bout);
      setMarks(a.marks);
    } catch {
      // A missed read only leaves the meters stale until the next one.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openBout = bout && !bout.finishedAt ? bout : null;
  const stats = useMemo(() => srsSummary(pool.map((p) => p.id), srs), [pool, srs]);
  const kindsPresent = useMemo(() => [...new Set(pool.map(kindOf))] as LexKind[], [pool]);
  const nativeCount = useMemo(
    () =>
      pool.filter((p) => nativeProgress(marks[p.id], hasPartnerChunk(p.collocations, p.text)).native)
        .length,
    [pool, marks],
  );

  // What the next bout takes: the learner's pick, else the default draw.
  const lineup = useMemo(() => {
    const chosen = picked.map((id) => pool.find((p) => p.id === id)).filter((p): p is Phrase => !!p);
    return chosen.length ? chosen : pickBoutItems(pool, srs, marks);
  }, [picked, pool, srs, marks]);

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

  function togglePick(id: string) {
    setPicked((xs) =>
      xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= BOUT_ITEMS ? xs : [...xs, id],
    );
  }

  async function enter() {
    if (openBout) {
      setView("bout");
      return;
    }
    if (starting || lineup.length === 0) return;
    setStarting(true);
    setStartError(null);
    try {
      const b = await arenaMove({ move: "open", ids: lineup.map((p) => p.id) });
      setBout(b);
      setPicked([]);
      setView("bout");
    } catch {
      // Nothing canned stands in: the bout is built for these items or not at all.
      setStartError("Couldn't set up the arena just now — try again in a moment.");
    } finally {
      setStarting(false);
    }
  }

  async function finish() {
    try {
      const b = await arenaMove({ move: "finish" });
      setBout(b);
      setView("debrief");
    } catch {
      setStartError("Couldn't close the bout — try again.");
      setView("library");
    }
    // The schedule and the marks moved server-side; bring both back.
    refresh();
    void reload();
  }

  if (view === "bout" && openBout) {
    return (
      <ArenaSession
        bout={openBout}
        onBout={setBout}
        onExit={() => setView("library")}
        onFinish={() => void finish()}
      />
    );
  }

  if (view === "debrief" && bout?.finishedAt) {
    return (
      <ArenaDebrief
        bout={bout}
        starting={starting}
        onBook={() => setView("library")}
        onAgain={() => void enter()}
      />
    );
  }

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

  const openDone = openBout ? openBout.turns.filter((t) => t.outcome !== null).length : 0;
  const boutStations = Math.max(1, lineup.length * STATIONS_PER_ITEM + (lineup.length > 1 ? 1 : 0));

  const arenaCard = (
    <div className="rounded-2xl bg-card p-6 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <div className="kicker">The arena</div>
        {nativeCount > 0 && <span className="dw-chip dw-chip-good">{nativeCount} native</span>}
      </div>
      {pool.length === 0 ? (
        <p className="mt-2.5 text-pretty text-[15px] text-muted-foreground">
          Your first word opens the arena — meet today&apos;s, or highlight anything in a News Chat.
        </p>
      ) : openBout ? (
        <>
          <p className="mt-2.5 text-[15px] leading-snug">
            A bout is waiting where you left it — {openDone} of {openBout.turns.length} stations done.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {openBout.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[14.5px] font-medium">{i.text}</span>
                <NativeMeter earned={marks[i.id] ?? i.marksBefore} hasPartner={hasPartnerChunk(i.collocations, i.text)} />
              </div>
            ))}
          </div>
          <Button size="lg" className="mt-4 w-full" onClick={() => void enter()}>
            Back into the bout <ArrowRight className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <p className="mt-2.5 text-pretty text-[14px] leading-snug text-muted-foreground">
            Each item has to work at several stations — recall it, pair it, bend it, say it to
            someone new, beat the clock. Every sentence is held until it&apos;s right. Clean at every
            station and it&apos;s native.
          </p>
          <div className="mt-3.5 flex flex-col gap-1.5">
            {lineup.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[14.5px] font-medium">{p.text}</span>
                <NativeMeter earned={marks[p.id] ?? []} hasPartner={hasPartnerChunk(p.collocations, p.text)} />
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[12.5px] text-muted-foreground">
            {picked.length
              ? `Your pick · ${picked.length} of ${BOUT_ITEMS}. `
              : "Due first, then whatever is furthest from native. Pick your own from the book. "}
            {picked.length > 0 && (
              <button type="button" className="underline underline-offset-2" onClick={() => setPicked([])}>
                Clear
              </button>
            )}
          </p>
          <Button
            size="lg"
            className="mt-3.5 w-full"
            onClick={() => void enter()}
            disabled={starting || !loaded || lineup.length === 0}
          >
            {starting ? "Setting up your bout…" : "Enter the arena"}
          </Button>
          <p className="mt-2.5 text-center text-[12px] text-muted-foreground">
            ≈ {boutStations} sentences · end whenever you like
          </p>
        </>
      )}
      {startError && <p className="note note-warning mt-3">{startError}</p>}
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

      <div className="mt-6 lg:hidden">{arenaCard}</div>

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
                    "rounded-full border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide transition-colors",
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
            <div className="rounded-2xl mt-10 bg-card px-8 py-12 text-center shadow-soft">
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
                      marks={marks[p.id] ?? []}
                      picked={picked.includes(p.id)}
                      open={!!expanded[p.id]}
                      onToggle={() => setExpanded((x) => ({ ...x, [p.id]: !x[p.id] }))}
                      onPick={() => togglePick(p.id)}
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
          <div className="hidden lg:block">{arenaCard}</div>

          <div className="rounded-2xl bg-card p-6 shadow-soft">
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

          <div className="rounded-2xl bg-card p-6 shadow-soft">
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
              The schedule says when it comes back. The native bar says whether
              you can really use it: one segment per station, landed clean.
            </p>
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
