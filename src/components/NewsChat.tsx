"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Languages,
  LifeBuoy,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type {
  AskHelp,
  ChatMessage,
  Mission,
  MissionProgress,
  MissionTarget,
  MissionTurn,
  NewsLevel,
  NewsSession,
  TargetStatus,
  HintRung,
  BridgeHelp,
  Debrief,
  Phrase,
} from "@/types";
import {
  fetchMission,
  missionConverse,
  missionBridge,
  missionAsk,
  missionDebrief,
} from "@/lib/client/clientApi";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/page-container";

/**
 * News Chat v2 — the Mission (docs/NEWS_CHAT_V2.md). One planned scenario from
 * today's real news, one visible goal, three language targets, four beats with
 * fading support. The plan is fixed; only the delivery is live.
 *
 * The hint system preserves the generation gap: an idea nudge, then inert
 * keywords, then a frame that inserts WITH its ___ gaps (send stays blocked
 * until they're filled), then a model answer revealed briefly and rewritten
 * from memory. No interaction path lets a tap alone produce a sendable message.
 *
 * Layout (Sidebar Redesign §5): a full-bleed reading sheet holds the
 * conversation; a collapsible left margin carries the metadata HUD (top) and a
 * free "Ask · anything" aide (bottom). Hide the margin for a pure writing sheet;
 * the aide shrinks to a floating pill.
 */

const RUNG_ORDER: HintRung[] = ["none", "idea", "keywords", "frame", "model"];
/** A frame gap the learner still has to fill, e.g. "___". */
const GAP_RE = /_{2,}/;
const MODEL_REVEAL_SECONDS = 7;
/** Pause before the Stuck? button starts pulsing. */
const PULSE_MS = 7000;
/** Long pause before the idea rung opens by itself (never more than that). */
const AUTO_IDEA_MS = 15000;

function makeSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function initialProgress(mission: Mission): MissionProgress {
  const targets: Record<string, TargetStatus> = {};
  for (const t of mission.targets) targets[t.id] = "pending";
  return {
    beatIndex: 0,
    turnsInBeat: 0,
    turn: 0,
    level: mission.level,
    wordsProduced: 0,
    deepestHint: "none",
    targets,
  };
}

/** Same slug scheme as the v1 miner, so repeat phrases dedupe in the pool. */
function phraseId(text: string): string {
  return `nc-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
}

function targetToPhrase(t: MissionTarget): Phrase {
  return {
    id: phraseId(t.text),
    text: t.text,
    meaning: t.meaning,
    example: t.example,
    register: "from your News Chat",
  };
}

/** The learner-visible outcome of a target once the session is over. */
function finalVerdict(status: TargetStatus): "produced" | "assisted" | "missed" {
  return status === "produced" || status === "assisted" ? status : "missed";
}

/** Longest plain word of a target — to match briefing highlights to targets. */
function longestWord(text: string): string | null {
  const words = text.replace(/_+/g, " ").toLowerCase().match(/[a-z][a-z'-]{3,}/g);
  if (!words || words.length === 0) return null;
  return words.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Render the briefing with its **target** uses highlighted and tappable. */
function BriefingText({
  briefing,
  targets,
  onPeek,
}: {
  briefing: string;
  targets: MissionTarget[];
  onPeek: (t: MissionTarget) => void;
}) {
  const parts = briefing.split(/\*\*(.+?)\*\*/g);
  return (
    <p className="text-[15px] leading-relaxed">
      {parts.map((part, i) => {
        if (i % 2 === 0) return <span key={i}>{part}</span>;
        const hit = targets.find((t) => {
          const anchor = longestWord(t.text);
          return anchor ? part.toLowerCase().includes(anchor) : false;
        });
        return (
          <button
            key={i}
            type="button"
            className="rounded bg-brand-muted px-1 font-medium text-brand-ink"
            onClick={() => hit && onPeek(hit)}
          >
            {part}
          </button>
        );
      })}
    </p>
  );
}

// ---- "Ask · anything" — the free aide in the margin -----------------------

interface AskEntry {
  q: string;
  help?: AskHelp;
  error?: string;
}

/**
 * A quiet, self-contained aide: the learner asks to translate / explain /
 * rephrase and gets a short answer, optionally with an English phrase they can
 * drop straight into their reply. It never blocks writing — failures answer
 * with a gentle note.
 */
function AskPanel({
  level,
  context,
  onInsert,
  focusSignal,
  className,
}: {
  level: NewsLevel;
  context: string;
  onInsert: (text: string) => void;
  /** Bumped by the parent to pull focus here (e.g. from the floating pill). */
  focusSignal?: number;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState<AskEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, busy]);

  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  async function submit() {
    const question = q.trim();
    if (!question || busy) return;
    setEntries((prev) => [...prev, { q: question }]);
    setQ("");
    setBusy(true);
    try {
      const help = await missionAsk(level, context, question);
      setEntries((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { q: question, help };
        return copy;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const error = /503/.test(msg)
        ? "Ask needs a server AI key to answer."
        : "Couldn't answer just now — try again.";
      setEntries((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { q: question, error };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="px-4 pt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Ask · anything
      </div>

      <div className="mt-2 max-h-[34vh] min-h-0 flex-1 overflow-y-auto px-4">
        {entries.length === 0 && (
          <p className="pb-1 font-serif text-[13px] italic leading-snug text-muted-foreground">
            Stuck on a word? Ask me to translate, explain, or rephrase — I&apos;ll
            keep it short.
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          {entries.map((e, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="self-end max-w-[90%] bg-oxford-tint px-2.5 py-1 text-[12.5px] leading-snug text-brand-ink">
                {e.q}
              </div>
              {e.help && (
                <div className="text-[12.5px] leading-relaxed text-foreground">
                  {e.help.answer}
                  {e.help.insert && (
                    <button
                      type="button"
                      onClick={() => onInsert(e.help!.insert!)}
                      className="ml-1.5 whitespace-nowrap border-b border-input text-[11.5px] text-brand transition-colors hover:border-brand"
                    >
                      insert &ldquo;{e.help.insert}&rdquo;
                    </button>
                  )}
                </div>
              )}
              {e.error && (
                <div className="text-[12px] leading-snug text-muted-foreground">{e.error}</div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-1 py-0.5">
              <span className="typing-dot" />
              <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
              <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="flex items-center gap-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Translate, explain, rephrase…"
          className="h-9 flex-1 text-[13px]"
          autoComplete="off"
        />
        <Button
          type="submit"
          size="icon-sm"
          variant="secondary"
          disabled={busy || !q.trim()}
          aria-label="Ask"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

// ---- the module conversation ----------------------------------------------

export function NewsChat({
  resume,
  onExit,
}: {
  /** Restore an unfinished conversation from the dashboard. */
  resume?: NewsSession;
  /** Return to the /news dashboard. */
  onExit?: () => void;
} = {}) {
  const { store, saveMissionOutcome, saveNewsSession } = useStore();

  const [mission, setMission] = useState<Mission | null>(resume?.mission ?? null);
  const [progress, setProgress] = useState<MissionProgress | null>(resume?.progress ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(resume?.messages ?? []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(!resume); // mission fetch (skipped on resume)
  const [busy, setBusy] = useState(false); // a turn in flight
  const [started, setStarted] = useState(!!resume);
  const [needsAI, setNeedsAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The full-bleed sheet vs. margin — Sidebar Redesign §5.
  const [marginOpen, setMarginOpen] = useState(true);
  const [askFocus, setAskFocus] = useState(0);

  // Briefing phase.
  const [checkPick, setCheckPick] = useState<number | null>(null);
  const [peek, setPeek] = useState<MissionTarget | null>(null);

  // The hint ladder (per beat).
  const [hintRung, setHintRung] = useState<HintRung>("none");
  const [hintOpen, setHintOpen] = useState(false);
  const [stuckPulse, setStuckPulse] = useState(false);
  const [modelVisible, setModelVisible] = useState(false);
  const [modelCountdown, setModelCountdown] = useState(MODEL_REVEAL_SECONDS);

  // "Say it your way" (the L1 bridge).
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [bridgeIntent, setBridgeIntent] = useState("");
  const [bridgeHelp, setBridgeHelp] = useState<BridgeHelp | null>(null);
  const [bridging, setBridging] = useState(false);

  // Debrief.
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [debriefing, setDebriefing] = useState(false);

  /** Target chips that just flipped — get the milestone pop for a moment. */
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const loadOnceRef = useRef(false);
  const savedRef = useRef(false);
  const sessionIdRef = useRef<string>(resume?.id ?? makeSessionId());
  const hintRungRef = useRef<HintRung>("none");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ideaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const complete = debrief !== null || debriefing;
  const currentBeat =
    mission && progress && progress.beatIndex < mission.beats.length
      ? mission.beats[progress.beatIndex]
      : null;
  /** The partner's current question — what the bridge helps them answer. */
  const currentDemand = messages.length ? messages[messages.length - 1].content : "";
  const inputHasGaps = GAP_RE.test(input);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, debrief, debriefing]);

  // Reveal the model answer for a few seconds, then blur it for good (this
  // beat): what they rebuild from memory is what sticks.
  useEffect(() => {
    if (!modelVisible) return;
    setModelCountdown(MODEL_REVEAL_SECONDS);
    const iv = setInterval(() => {
      setModelCountdown((s) => {
        if (s <= 1) {
          setModelVisible(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [modelVisible]);

  const loadMission = useCallback(async (level: Mission["level"]) => {
    setLoading(true);
    setError(null);
    try {
      const m = await fetchMission(level);
      setMission(m);
      setProgress(initialProgress(m));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/503/.test(msg)) setNeedsAI(true);
      else if (/502/.test(msg)) setError(msg.replace(/^\d+\s*/, "") || "Couldn't plan today's mission — try again.");
      else setError("Couldn't plan today's mission — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadOnceRef.current) return;
    loadOnceRef.current = true;
    if (resume) return; // everything restored from the saved session
    void loadMission(store.newsLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Persist the conversation so the dashboard can list + resume it. Only once
   *  the learner has actually written — an opened-but-untouched chat is noise. */
  const persist = useCallback(
    (
      m: Mission,
      msgs: ChatMessage[],
      prog: MissionProgress,
      status: "active" | "complete",
      goalHit?: boolean,
    ) => {
      if (status === "active" && !msgs.some((x) => x.role === "user")) return;
      saveNewsSession({ id: sessionIdRef.current, mission: m, messages: msgs, progress: prog, status, goalHit });
    },
    [saveNewsSession],
  );

  // --- Stall handling: pulse, then quietly open the idea rung — never more.

  const clearStall = useCallback(() => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    if (ideaTimer.current) clearTimeout(ideaTimer.current);
    pulseTimer.current = null;
    ideaTimer.current = null;
  }, []);

  /** Record hint depth in the progress the next send will carry. */
  const markHint = useCallback((rung: HintRung) => {
    setProgress((p) =>
      p && RUNG_ORDER.indexOf(rung) > RUNG_ORDER.indexOf(p.deepestHint)
        ? { ...p, deepestHint: rung }
        : p,
    );
  }, []);

  /** One rung further down the ladder (Stuck? / More help). */
  const descend = useCallback(() => {
    const idx = RUNG_ORDER.indexOf(hintRungRef.current);
    const next = RUNG_ORDER[Math.min(idx + 1, RUNG_ORDER.length - 1)];
    if (next !== hintRungRef.current) {
      hintRungRef.current = next;
      setHintRung(next);
      markHint(next);
      if (next === "model") setModelVisible(true);
    }
    setHintOpen(true);
    setStuckPulse(false);
    clearStall();
  }, [markHint, clearStall]);

  function armStall() {
    clearStall();
    if (!started || busy || complete || !mission) return;
    pulseTimer.current = setTimeout(() => setStuckPulse(true), PULSE_MS);
    ideaTimer.current = setTimeout(() => {
      if (hintRungRef.current === "none") descend();
    }, AUTO_IDEA_MS);
  }

  const resetHintUi = useCallback(() => {
    hintRungRef.current = "none";
    setHintRung("none");
    setHintOpen(false);
    setStuckPulse(false);
    setModelVisible(false);
    setBridgeOpen(false);
    setBridgeHelp(null);
    setBridgeIntent("");
  }, []);

  // --- The conversation loop ------------------------------------------------

  /** Save once, at completion — the debrief only supplies the words (and keeps). */
  const saveOutcome = useCallback(
    (finalProgress: MissionProgress, m: Mission) => {
      if (savedRef.current) return;
      savedRef.current = true;
      saveMissionOutcome({
        targets: m.targets.map((t) => ({
          phrase: targetToPhrase(t),
          verdict: finalVerdict(finalProgress.targets[t.id]),
        })),
        keep: [],
        level: finalProgress.level,
      });
    },
    [saveMissionOutcome],
  );

  const finish = useCallback(
    async (finalProgress: MissionProgress, finalMessages: ChatMessage[]) => {
      if (!mission) return;
      saveOutcome(finalProgress, mission);
      setDebriefing(true);
      try {
        const d = await missionDebrief(mission, finalProgress, finalMessages);
        setDebrief(d);
        persist(mission, finalMessages, finalProgress, "complete", d.goalHit);
        if (d.keep.length) {
          saveMissionOutcome({
            targets: [],
            keep: d.keep.map((p) => ({
              id: phraseId(p.text),
              text: p.text,
              meaning: p.meaning,
              example: p.text,
              register: "from your News Chat",
            })),
            level: finalProgress.level,
          });
        }
      } catch {
        // The ending never dies with the network: build the debrief locally.
        setDebrief({
          celebration:
            "You held a real conversation in English about today's news — that's exactly how fluency grows.",
          goalHit: true,
          targetResults: mission.targets.map((t) => ({
            id: t.id,
            verdict: finalVerdict(finalProgress.targets[t.id]),
            note: "",
          })),
          upgrades: [],
          keep: [],
        });
        persist(mission, finalMessages, finalProgress, "complete", finalProgress.beatIndex >= mission.beats.length);
      } finally {
        setDebriefing(false);
      }
    },
    [mission, saveOutcome, saveMissionOutcome, persist],
  );

  const applyTurn = useCallback(
    (turn: MissionTurn, history: ChatMessage[]) => {
      const withReply: ChatMessage[] = [...history, { role: "coach", content: turn.reply }];
      setMessages(withReply);

      // Pop the chips that flipped this turn.
      if (progress) {
        const justFlipped: Record<string, boolean> = {};
        for (const id of Object.keys(turn.state.targets)) {
          const was = progress.targets[id];
          const now = turn.state.targets[id];
          if (
            (was === "pending" || was === "missed") &&
            (now === "produced" || now === "assisted")
          ) {
            justFlipped[id] = true;
          }
        }
        if (Object.keys(justFlipped).length) {
          setFlipped(justFlipped);
          setTimeout(() => setFlipped({}), 900);
        }
        if (turn.state.beatIndex !== progress.beatIndex) resetHintUi();
      }

      setProgress(turn.state);
      // Snapshot the live conversation for the dashboard (recent + resume).
      if (mission && !turn.missionComplete) {
        persist(mission, withReply, turn.state, "active");
      }
      if (turn.missionComplete) void finish(turn.state, withReply);
    },
    [progress, mission, resetHintUi, finish, persist],
  );

  async function start() {
    if (!mission || !progress || started || busy) return;
    setStarted(true);
    setBusy(true);
    setError(null);
    try {
      const turn = await missionConverse(mission, progress, []);
      applyTurn(turn, []);
    } catch {
      setError("Couldn't start the chat — try again.");
      setStarted(false);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !mission || !progress || !started || complete) return;
    if (GAP_RE.test(text)) return; // gaps are theirs to fill
    clearStall();
    setHintOpen(false);
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const turn = await missionConverse(mission, progress, history);
      applyTurn(turn, history);
    } catch {
      setError("That message didn't go through — try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Append text to the reply and focus the input — used by frames and Ask. */
  function appendToInput(text: string) {
    setInput((prev) => {
      const sep = prev && !prev.endsWith(" ") ? " " : "";
      return `${prev}${sep}${text}`;
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  /** Insert a frame WITH its gaps; select the first gap so typing replaces it.
   *  The clicked button is blurred so a stray Enter can't re-insert (the input
   *  may be disabled mid-turn, in which case focus() below silently no-ops). */
  function insertFrame(frame: string, e?: React.MouseEvent<HTMLButtonElement>) {
    e?.currentTarget.blur();
    setInput((prev) => {
      const sep = prev && !prev.endsWith(" ") ? " " : "";
      return `${prev}${sep}${frame}`;
    });
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const pos = el.value.indexOf("___");
      if (pos >= 0) el.setSelectionRange(pos, pos + 3);
    });
  }

  async function submitBridge() {
    const intent = bridgeIntent.trim();
    if (!intent || bridging || !mission || !progress) return;
    setBridging(true);
    // Bridge material is frame-level help, wherever it comes from.
    markHint("frame");
    try {
      const help = await missionBridge(progress.level, currentDemand, intent);
      setBridgeHelp(help);
    } catch {
      // Fail soft to the beat's pre-planned ladder — help never blocks.
      if (currentBeat) {
        setBridgeHelp({
          keywords: currentBeat.hints.keywords,
          frame: currentBeat.hints.frame,
        });
      }
    } finally {
      setBridging(false);
    }
  }

  function pickCheck(i: number) {
    if (!mission?.check || started || busy) return;
    setCheckPick(i);
    if (i === mission.check.answer) setTimeout(() => void start(), 700);
  }

  function revealMargin() {
    setMarginOpen(true);
    setAskFocus((n) => n + 1);
  }

  // --- Renders ----------------------------------------------------------------

  if (needsAI) {
    return (
      <PageContainer width="narrow">
        {onExit && (
          <button
            type="button"
            onClick={onExit}
            className="mb-2 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
          >
            ‹ All conversations
          </button>
        )}
        <h1 className="text-2xl">News Chat</h1>
        <div className="note note-warning mt-3.5">
          News Chat is a fully online mode: it plans a real mission from
          today&apos;s news and chats with you about it using AI. It needs a
          server AI key (free-tier Groq or Gemini works) and network access.
          Set one and it&apos;ll come alive.
        </div>
      </PageContainer>
    );
  }

  const chipStyle = (s: TargetStatus) =>
    cn(
      "rounded-none border px-2 py-0.5 text-[11.5px] transition-colors",
      s === "produced" && "border-sage bg-sage-muted font-semibold text-sage-ink",
      s === "assisted" && "border-dashed border-sage bg-sage-muted/60 text-sage-ink",
      s === "missed" && "border-input bg-muted text-muted-foreground opacity-60",
      s === "pending" && "border-input bg-muted text-muted-foreground",
    );

  const verdictIcon = { produced: "✓", assisted: "✓", missed: "→" } as const;
  const verdictLabel = {
    produced: "produced on your own",
    assisted: "produced with a little help",
    missed: "waiting in your Phrase Coach",
  } as const;

  /** The metadata HUD — reused in the desktop margin and the mobile header. */
  const metaHud = mission && progress && (
    <div className="flex flex-col gap-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          News chat
        </div>
        <div className="mt-1.5 font-serif text-[15px] font-medium leading-snug text-foreground">
          {mission.title}
        </div>
        {mission.source && (
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {mission.url ? (
              <a href={mission.url} target="_blank" rel="noreferrer" className="hover:text-brand">
                {mission.source} ↗
              </a>
            ) : (
              mission.source
            )}
          </div>
        )}
      </div>

      <div>
        <div className="kicker">Goal</div>
        <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{mission.goal}</div>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Phrases
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mission.targets.map((t) => {
            const s = progress.targets[t.id];
            return (
              <span
                key={t.id}
                title={`${t.meaning} — e.g. ${t.example}`}
                className={cn(chipStyle(s), flipped[t.id] && "animate-milestone")}
              >
                {s === "produced" || s === "assisted" ? "✓ " : ""}
                {t.text}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="inline-flex gap-1" title="Beats">
          {mission.beats.map((b, i) => (
            <span
              key={b.id}
              className={cn(
                "size-2 rounded-full transition-colors",
                i < progress.beatIndex
                  ? "bg-brand"
                  : i === progress.beatIndex && started && !complete
                    ? "bg-brand/40 ring-2 ring-brand/25"
                    : "bg-muted-foreground/20",
              )}
            />
          ))}
        </span>
        <span className="meta text-[11px] tabular-nums">{progress.wordsProduced} words</span>
      </div>
    </div>
  );

  /** The conversation body — briefing, turns, help, input — lives in the sheet. */
  const sheet = (
    <>
      {/* Sheet header: back + title, with a reveal tab when the margin is hidden. */}
      <div className="relative flex-none border-b border-border px-5 py-3 sm:px-8">
        {!marginOpen && (
          <button
            type="button"
            onClick={() => setMarginOpen(true)}
            aria-label="Show margin"
            title="Show margin"
            className="absolute left-0 top-4 hidden size-6 place-items-center border border-l-0 border-sidebar-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground lg:grid"
          >
            <ChevronRight className="size-3.5" />
          </button>
        )}
        <div className={cn("flex items-baseline justify-between gap-3", !marginOpen && "lg:pl-8")}>
          <div className="min-w-0">
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="mb-0.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-brand"
              >
                ‹ All conversations
              </button>
            )}
            <h1 className="truncate font-serif text-xl font-medium leading-tight text-foreground">
              {mission?.title ?? "News Chat"}
            </h1>
          </div>
          {loading && <span className="meta shrink-0 text-[11px]">Planning…</span>}
        </div>
      </div>

      {/* Conversation scroll region. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
          {/* Mobile metadata — the margin is desktop-only. */}
          {metaHud && (
            <div className="mb-1 border border-border bg-background p-4 lg:hidden">{metaHud}</div>
          )}

          {loading && (
            <p className="text-sm text-muted-foreground">
              Planning today&apos;s mission from the news…
            </p>
          )}

          {mission && (
            <div className="border border-border bg-card p-4 shadow-soft">
              <div className="text-sm text-muted-foreground">
                You&apos;re chatting with <b>{mission.scenario.role}</b>.{" "}
                {mission.scenario.situation}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <BriefingText
                  briefing={mission.briefing}
                  targets={mission.targets}
                  onPeek={(t) => setPeek((p) => (p?.id === t.id ? null : t))}
                />
                {peek && (
                  <div className="mt-2.5 bg-muted p-2.5 text-sm">
                    <b>{peek.text}</b> — {peek.meaning}
                    <div className="mt-0.5 text-muted-foreground">e.g. {peek.example}</div>
                  </div>
                )}
              </div>

              {!started && mission.check && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="text-sm font-medium">{mission.check.question}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mission.check.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => pickCheck(i)}
                        className={cn(
                          "rounded-none border px-3 py-1.5 text-sm transition-colors",
                          checkPick === i && i === mission.check!.answer
                            ? "border-sage bg-sage-muted font-medium text-sage-ink"
                            : checkPick === i
                              ? "border-destructive/40 bg-muted text-muted-foreground"
                              : "border-input bg-muted hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  {checkPick !== null && checkPick !== mission.check.answer && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      Not quite — read the briefing once more.
                    </div>
                  )}
                  {checkPick === mission.check.answer && (
                    <div className="mt-2 text-sm font-medium text-sage-ink">
                      ✓ Got it — here we go…
                    </div>
                  )}
                </div>
              )}

              {!started && !mission.check && (
                <Button className="mt-3 w-full" onClick={() => void start()} disabled={busy}>
                  Start the mission →
                </Button>
              )}
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[80%] whitespace-pre-wrap px-3.5 py-2.5 text-[15px] leading-relaxed",
                m.role === "coach"
                  ? "self-start border border-border bg-card text-card-foreground shadow-soft"
                  : "self-end bg-brand text-brand-foreground",
              )}
            >
              {m.content}
            </div>
          ))}

          {(busy || debriefing) && (
            <div className="flex max-w-[80%] items-center gap-1 self-start border border-border bg-card px-3.5 py-3 shadow-soft">
              <span className="typing-dot" />
              <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
              <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
            </div>
          )}

          {/* --- Debrief --- */}
          {debrief && mission && (
            <div className="border border-border bg-sage-muted p-4 text-sage-ink">
              <div className="text-[15px] font-medium">
                {debrief.goalHit ? "Mission complete." : "Mission over."} {debrief.celebration}
              </div>
              <ul className="mt-3 space-y-2 border-t border-sage/30 pt-3 text-sm">
                {debrief.targetResults.map((r) => {
                  const t = mission.targets.find((x) => x.id === r.id);
                  if (!t) return null;
                  return (
                    <li key={r.id}>
                      <span className={cn("mr-1.5 font-semibold", r.verdict === "missed" && "opacity-60")}>
                        {verdictIcon[r.verdict]}
                      </span>
                      <b>{t.text}</b> <span className="opacity-80">— {verdictLabel[r.verdict]}</span>
                      {r.note && <div className="ml-5 mt-0.5 opacity-80">{r.note}</div>}
                    </li>
                  );
                })}
              </ul>
              {debrief.upgrades.length > 0 && (
                <div className="mt-3 border-t border-sage/30 pt-3">
                  <div className="text-xs font-medium uppercase tracking-wide opacity-80">
                    Next time you can
                  </div>
                  {debrief.upgrades.map((u, i) => (
                    <div className="mt-1.5 text-sm" key={i}>
                      <span className="opacity-70">You wrote:</span> “{u.you}”
                      <br />
                      <span className="opacity-70">Try:</span> <b>“{u.upgrade}”</b>
                      {u.why && <span className="opacity-70"> — {u.why}</span>}
                    </div>
                  ))}
                </div>
              )}
              {debrief.keep.length > 0 && (
                <div className="mt-3 border-t border-sage/30 pt-3">
                  <div className="text-xs font-medium uppercase tracking-wide opacity-80">
                    Also worth keeping
                  </div>
                  {debrief.keep.map((p, i) => (
                    <div className="mt-1 text-sm" key={i}>
                      <b>{p.text}</b> <span className="opacity-80">— {p.meaning}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-2.5 text-xs opacity-70">
                Today&apos;s phrases are saved to your Phrase Coach to practice later.
              </div>
              {onExit && (
                <Button variant="secondary" className="mt-3.5" onClick={onExit}>
                  ‹ Back to News
                </Button>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Help affordances + input — pinned to the bottom of the sheet. */}
      <div className="flex-none border-t border-border px-5 py-3 sm:px-8">
        <div className="mx-auto max-w-2xl">
          {error && (
            <div className="note note-warning mb-2 flex items-center justify-between gap-2">
              <span>{error}</span>
              {!mission && !loading && (
                <Button variant="outline" size="sm" onClick={() => void loadMission(store.newsLevel)}>
                  Try again
                </Button>
              )}
            </div>
          )}

          {started && !complete && currentBeat && (
            <>
              {(hintOpen || bridgeOpen) && (
                <div className="mb-2 border border-border bg-card p-3.5 shadow-soft">
                  {hintOpen && (
                    <div className="flex flex-col gap-2.5">
                      {RUNG_ORDER.indexOf(hintRung) >= 1 && (
                        <div className="text-sm">{currentBeat.hints.idea}</div>
                      )}
                      {RUNG_ORDER.indexOf(hintRung) >= 2 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">build with:</span>
                          {currentBeat.hints.keywords.map((k, i) => (
                            <span
                              key={i}
                              className="select-none border border-border bg-muted px-2 py-0.5 text-[13px]"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      )}
                      {RUNG_ORDER.indexOf(hintRung) >= 3 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="border border-dashed border-border bg-muted px-2 py-1 text-[13px]">
                            {currentBeat.hints.frame}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(e) => insertFrame(currentBeat.hints.frame, e)}
                          >
                            Use frame
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            the ___ parts are yours to fill
                          </span>
                        </div>
                      )}
                      {hintRung === "model" && (
                        <div>
                          {modelVisible ? (
                            <div className="text-sm">
                              <span className="italic">“{currentBeat.hints.model}”</span>
                              <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                                memorize it — {modelCountdown}s
                              </span>
                            </div>
                          ) : (
                            <div>
                              <div aria-hidden className="select-none text-sm italic opacity-60 blur-sm">
                                “{currentBeat.hints.model}”
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Now write it your way — from memory.
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {hintRung !== "model" && (
                          <Button type="button" variant="ghost" size="sm" onClick={descend}>
                            More help ↓
                          </Button>
                        )}
                        <button
                          type="button"
                          className="ml-auto text-muted-foreground hover:text-foreground"
                          onClick={() => setHintOpen(false)}
                          aria-label="Close help"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {bridgeOpen && (
                    <div className={cn("flex flex-col gap-2.5", hintOpen && "mt-3 border-t border-border pt-3")}>
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void submitBridge();
                        }}
                      >
                        <Input
                          value={bridgeIntent}
                          onChange={(e) => setBridgeIntent(e.target.value)}
                          placeholder="Type your idea in any language…"
                          className="flex-1"
                        />
                        <Button type="submit" variant="outline" size="sm" disabled={bridging || !bridgeIntent.trim()}>
                          {bridging ? "…" : "Help me say it"}
                        </Button>
                      </form>
                      {bridgeHelp && (
                        <>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">build with:</span>
                            {bridgeHelp.keywords.map((k, i) => (
                              <span
                                key={i}
                                className="select-none border border-border bg-muted px-2 py-0.5 text-[13px]"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="border border-dashed border-border bg-muted px-2 py-1 text-[13px]">
                              {bridgeHelp.frame}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => insertFrame(bridgeHelp.frame, e)}
                            >
                              Use frame
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mb-1.5 flex items-center gap-1.5">
                {inputHasGaps ? (
                  <span className="text-xs text-muted-foreground">
                    Fill your <b>___</b> blanks with your own words first.
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => (hintOpen ? setHintOpen(false) : descend())}
                  className={cn(
                    "ml-auto flex items-center gap-1 rounded-none border border-input bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                    stuckPulse && !hintOpen && "animate-nudge",
                  )}
                >
                  <LifeBuoy className="h-3.5 w-3.5" /> Stuck?
                </button>
                <button
                  type="button"
                  onClick={() => setBridgeOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-none border border-input bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Languages className="h-3.5 w-3.5" /> Say it your way
                </button>
              </div>
            </>
          )}

          {!complete && (
            <form
              className="flex gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <Input
                ref={inputRef}
                className="flex-1"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  armStall();
                }}
                onFocus={armStall}
                onBlur={clearStall}
                placeholder={started ? "Write your reply…" : "Read the briefing above to begin"}
                disabled={!started || busy || !mission}
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={!started || busy || !input.trim() || inputHasGaps}
                title={inputHasGaps ? "Fill your ___ blanks first" : undefined}
              >
                <Send />
                <span className="hidden sm:inline">Send</span>
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Left margin — metadata (top) + Ask aide (bottom). Desktop only. */}
      {marginOpen && (
        <aside className="relative hidden w-[248px] flex-none flex-col border-r border-sidebar-border bg-background lg:flex">
          <button
            type="button"
            onClick={() => setMarginOpen(false)}
            aria-label="Hide margin"
            title="Hide margin"
            className="absolute -right-3 top-4 z-10 grid size-6 place-items-center border border-sidebar-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            {metaHud ?? (
              <p className="font-serif text-sm italic text-muted-foreground">
                Planning today&apos;s mission…
              </p>
            )}
          </div>

          {mission && progress && (
            <div className="flex-none border-t border-sidebar-border bg-card shadow-[0_-2px_8px_hsl(var(--shadow-color)/0.04)]">
              <AskPanel
                level={progress.level}
                context={`${mission.title}${currentDemand ? ` — ${currentDemand}` : ""}`}
                onInsert={appendToInput}
                focusSignal={askFocus}
              />
            </div>
          )}
        </aside>
      )}

      {/* The full-bleed reading sheet. */}
      <div className="relative flex min-w-0 flex-1 flex-col bg-card">
        {sheet}

        {/* Floating Ask pill when the margin is hidden. */}
        {!marginOpen && mission && (
          <button
            type="button"
            onClick={revealMargin}
            aria-label="Open Ask"
            className="absolute bottom-24 left-1/2 hidden -translate-x-1/2 items-center gap-2 bg-foreground px-3.5 py-2 text-background shadow-md transition-transform hover:-translate-y-0.5 lg:flex"
          >
            <Sparkles className="size-3.5 text-gold" />
            <span className="text-[12.5px] font-medium">Ask</span>
          </button>
        )}
      </div>
    </div>
  );
}
