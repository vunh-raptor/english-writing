"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, Send, Timer } from "lucide-react";
import type { ArenaBout, ArenaItem, ArenaTurn, TalkEntry, WordOutcome } from "@/types";
import { arenaMove, peekArena, type ArenaMove } from "@/lib/client/clientApi";
import { CLOCK_SECONDS } from "@/lib/shared/arena";
import { talkCanLeave } from "@/lib/shared/words";
import { cn } from "@/lib/utils";
import { STATION_META, demandOf, isHidden } from "./meta";

/**
 * One arena bout (docs/PHRASEBOOK.md): a run of stations, each a sentence held
 * until it is right.
 *
 * **The server owns the bout**, exactly as it owns a Daily Words day. This
 * screen holds no progress of its own — it shows the stored bout and sends
 * moves (`say`, `peek`, `clock`, `leave`), each naming the station it was made
 * on, and every move comes back as the whole bout. Misses, help level, the way
 * out and the clock are all the server's, so they can't be talked around from
 * here, and leaving the page loses nothing.
 *
 * What it does keep is which station is on screen: a station that just closed
 * stays up with its result until the learner moves on, so "that one's right"
 * is something they get to see rather than something that flickers past.
 */

const OUTCOME_COPY: Record<WordOutcome, { label: string; chip: string }> = {
  clean: { label: "Clean", chip: "dw-chip-good" },
  helped: { label: "With help", chip: "dw-chip-note" },
  missed: { label: "Left for later", chip: "" },
};

function openIndex(bout: ArenaBout): number {
  return bout.turns.findIndex((t) => t.outcome === null);
}

function itemsOf(bout: ArenaBout, turn: ArenaTurn): ArenaItem[] {
  return (turn.comboIds ?? [turn.itemId])
    .map((id) => bout.items.find((i) => i.id === id))
    .filter((i): i is ArenaItem => !!i);
}

/** Seconds left on a started clock, from the server's start time. */
function secondsLeft(startedAt: number, now: number): number {
  return Math.max(0, Math.ceil(CLOCK_SECONDS - (now - startedAt) / 1000));
}

export function ArenaSession({
  bout,
  onBout,
  onExit,
  onFinish,
}: {
  bout: ArenaBout;
  onBout: (b: ArenaBout) => void;
  onExit: () => void;
  onFinish: () => void;
}) {
  const [view, setView] = useState(() => {
    const i = openIndex(bout);
    return i === -1 ? bout.turns.length - 1 : i;
  });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const turn = bout.turns[Math.min(view, bout.turns.length - 1)];
  const items = useMemo(() => itemsOf(bout, turn), [bout, turn]);
  const closed = turn.outcome !== null;
  const nextOpen = openIndex(bout);
  const hidden = isHidden(turn);
  const isClock = turn.station === "clock";
  const clockWaiting = isClock && !closed && turn.clockStartedAt == null;
  const left = isClock && turn.clockStartedAt != null ? secondsLeft(turn.clockStartedAt, now) : null;

  // The clock ticks only while a clock station is live on screen.
  useEffect(() => {
    if (!isClock || closed || turn.clockStartedAt == null) return;
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, [isClock, closed, turn.clockStartedAt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turn.thread.length, pending, closed]);

  async function move(m: ArenaMove): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      onBout(await arenaMove(m));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.startsWith("409")) {
        // The bout moved on somewhere else (another tab, a double tap): show
        // where it really is rather than arguing with it.
        const fresh = await peekArena().catch(() => null);
        if (fresh?.bout) {
          onBout(fresh.bout);
          const i = openIndex(fresh.bout);
          if (i !== -1) setView(i);
        }
        setError(msg.replace(/^409\s*/, ""));
      } else {
        setError("That didn't go through — send it again.");
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const sentence = input.trim();
    if (!sentence || busy || closed) return;
    setPending(sentence);
    setInput("");
    const ok = await move({ move: "say", index: view, sentence });
    if (!ok) setInput(sentence);
    setPending(null);
    inputRef.current?.focus();
  }

  async function peek() {
    setCardOpen(true);
    if (!turn.talk.peeked && !closed) await move({ move: "peek", index: view });
  }

  function next() {
    if (nextOpen === -1) {
      onFinish();
      return;
    }
    setView(nextOpen);
    setCardOpen(false);
    setInput("");
    setError(null);
  }

  const thread: TalkEntry[] = pending ? [...turn.thread, { t: "you", text: pending }] : turn.thread;
  const doneCount = bout.turns.filter((t) => t.outcome !== null).length;
  const meta = STATION_META[turn.station];

  return (
    <div className="dw min-h-full">
      <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col px-4 sm:px-6 lg:min-h-full">
        {/* Top bar: the way back, the whole bout at a glance, and the way out. */}
        <div className="flex items-center gap-2 pt-5 lg:pt-7">
          <button type="button" onClick={onExit} className="dw-btn-quiet flex-none" aria-label="Back to your book">
            <ArrowLeft className="size-4" /> Book
          </button>
          <div
            className="-mr-4 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 pr-4 [scrollbar-width:none] sm:-mr-6 sm:pr-6"
            aria-label={`${doneCount} of ${bout.turns.length} stations done`}
          >
            {bout.turns.map((t, i) => (
              <span
                key={i}
                aria-current={i === view ? "step" : undefined}
                title={`${STATION_META[t.station].label}${t.rematch ? " (second try)" : ""}`}
                className={cn(
                  "grid size-7 flex-none place-items-center rounded-full border text-[11px] font-semibold tabular-nums",
                  t.outcome === "clean"
                    ? "border-transparent bg-[hsl(var(--dw-good-soft))] text-[hsl(var(--dw-good))]"
                    : t.outcome !== null
                      ? "border-border bg-muted text-muted-foreground"
                      : i === view
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground/70",
                )}
              >
                {t.outcome === "clean" ? <Check className="size-3.5" /> : t.outcome !== null ? "–" : i + 1}
              </span>
            ))}
          </div>
          <button type="button" onClick={onFinish} className="dw-btn-quiet flex-none">
            End here
          </button>
        </div>

        <div className="flex-1 pb-8 pt-5">
          {/* What this station is, and what it wants from the sentence. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="dw-chip dw-chip-accent">{meta.label}</span>
            {turn.rematch && <span className="dw-chip">Second try</span>}
            <span className="text-[14px] text-muted-foreground">{demandOf(turn)}</span>
          </div>

          {/* The item: on the page, or only its meaning when it has to be found. */}
          <div className={cn("mt-4 grid gap-3", items.length > 1 && "sm:grid-cols-2")}>
            {items.map((it) =>
              hidden && !cardOpen && !closed ? (
                <div key={it.id} className="dw-card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4">
                  <div className="min-w-0">
                    {/* Hidden: the meaning stays, the item doesn't. Finding it
                        again is the retrieval this station is for. */}
                    <div className="text-[12.5px] font-semibold uppercase tracking-wide text-[hsl(var(--dw-accent-ink))]">
                      The {it.kind} that means
                    </div>
                    <div className="mt-0.5 text-[15.5px] leading-snug text-foreground/90">
                      {it.meaning || "— (no meaning saved yet)"}
                    </div>
                  </div>
                  <button type="button" onClick={() => void peek()} className="dw-btn-quiet flex-none" disabled={busy}>
                    <Eye className="size-4" /> Peek
                  </button>
                </div>
              ) : (
                <div key={it.id} className="dw-card px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[22px] font-bold tracking-tight">{it.text}</span>
                    <span className="dw-chip">{it.kind}</span>
                  </div>
                  {it.meaning && <p className="mt-1 text-[14.5px] text-muted-foreground">{it.meaning}</p>}
                  {turn.station === "partner" && turn.partner && (
                    <p className="mt-2.5 text-[14.5px]">
                      <span className="text-muted-foreground">Travels as </span>
                      <span className="font-semibold">{turn.partner}</span>
                    </p>
                  )}
                  {cardOpen && it.examples.length > 0 && (
                    // Worked examples are input, never an answer to lift: other
                    // contexts, and not selectable.
                    <ul className="mt-3 space-y-1.5">
                      {it.examples.map((x, k) => (
                        <li
                          key={k}
                          className="select-none rounded-[14px] bg-[hsl(var(--dw-accent-soft))] px-3.5 py-2 text-[14.5px] leading-relaxed text-foreground/85"
                        >
                          {x}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!hidden && !cardOpen && !closed && it.examples.length > 0 && (
                    <button type="button" onClick={() => void peek()} className="dw-btn-quiet -ml-2 mt-2" disabled={busy}>
                      <Eye className="size-4" /> See it used
                    </button>
                  )}
                </div>
              ),
            )}
          </div>

          {turn.station === "native" && turn.plain && (
            <div className="mt-3 rounded-2xl border border-dashed border-border px-5 py-3.5">
              <div className="text-[12.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                The flat way to say it
              </div>
              <p className="mt-1 select-none text-[16px] leading-relaxed text-foreground/80">“{turn.plain}”</p>
            </div>
          )}

          {clockWaiting ? (
            // The clock is the learner's to start: the scene stays covered
            // until then, so the time measures the sentence, not the reading.
            <div className="dw-card dw-rise mt-6 p-6 text-center">
              <Timer className="mx-auto size-6 text-primary" />
              <p className="mt-3 text-[17px] font-semibold">{CLOCK_SECONDS} seconds, from memory.</p>
              <p className="mt-1 text-[14.5px] text-muted-foreground">
                The moment appears when you start. A right sentence after the time still counts as said.
              </p>
              <button
                type="button"
                className="dw-btn mt-5"
                disabled={busy}
                onClick={() => void move({ move: "clock", index: view })}
                autoFocus
              >
                Start the clock
              </button>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3.5">
              {thread.map((e, n) => {
                if (e.t === "said") {
                  return (
                    <div key={n} className="dw-rise">
                      <div className="dw-bubble-them">
                        <p className="whitespace-pre-line text-[17px] leading-[1.6] text-foreground">{e.text}</p>
                      </div>
                      {e.task && <p className="mt-1.5 pl-1 text-[13px] text-muted-foreground">{e.task}</p>}
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
                      {e.missing ? "It isn't in there yet" : "Almost — one thing"}
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
                <div className="dw-card dw-rise mt-2 flex flex-wrap items-center gap-2.5 p-5">
                  <span className={cn("dw-chip", OUTCOME_COPY[turn.outcome!].chip)}>
                    {OUTCOME_COPY[turn.outcome!].label}
                  </span>
                  {isClock && turn.clockBeaten && <span className="dw-chip dw-chip-good">Inside the time</span>}
                  {isClock && turn.clockBeaten === false && (
                    <span className="text-[14px] text-muted-foreground">Right, just not inside the time yet.</span>
                  )}
                  {turn.outcome !== "clean" && !turn.rematch && turn.station !== "combo" &&
                    bout.turns.some((t) => t.rematch && t.itemId === turn.itemId) && (
                      <span className="text-[14px] text-muted-foreground">It comes back once more, later in this bout.</span>
                    )}
                </div>
              )}

              {error && <p className="note note-warning">{error}</p>}
            </div>
          )}
        </div>

        {/* The writing desk: docked, roomy, never checked while typing. */}
        {!clockWaiting && (
          <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 pb-4 lg:bottom-0 lg:pb-6">
            {closed ? (
              <div className="dw-glass flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <span className="text-[14.5px] text-muted-foreground">
                  {doneCount} of {bout.turns.length} stations done
                </span>
                <button type="button" className="dw-btn" onClick={next} autoFocus>
                  {nextOpen === -1 ? "See the bout" : "Next station"}
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
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label="Your sentence"
                  className="block max-h-[38vh] min-h-[3.6rem] w-full resize-none bg-transparent px-1 text-[18px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    {left !== null && (
                      // Quiet on purpose: a number, not a flashing bar. The
                      // pressure is the ask; the clock only keeps it honest.
                      <span className="flex items-center gap-1 text-[12.5px] font-medium tabular-nums text-muted-foreground">
                        <Timer className="size-3.5" />
                        {left > 0 ? `${left}s` : "Time's up — finish it anyway"}
                      </span>
                    )}
                    <span className="text-[12.5px] font-medium text-muted-foreground">
                      Station {view + 1} of {bout.turns.length}
                    </span>
                    {talkCanLeave(turn.talk) && (
                      <button
                        type="button"
                        onClick={() => void move({ move: "leave", index: view })}
                        className="dw-btn-quiet -my-1"
                        disabled={busy}
                      >
                        Leave it for later
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="dw-btn flex-none"
                    onClick={() => void send()}
                    disabled={!input.trim() || busy}
                  >
                    <Send className="size-4" /> Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
