import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Lightbulb, RefreshCw, X } from "lucide-react";
import type { Difficulty, GoalType, WriteSession } from "@/types";
import { countWords } from "@/lib/shared/stats";
import { createSparkEngine, MILESTONES, type Spark } from "@/lib/shared/sparks";
import { aiSparks } from "@/lib/client/ai";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface WriteProps {
  session: WriteSession;
  goalType: GoalType;
  goalValue: number;
  gentleNudge: boolean;
  /** Whether server AI is available for contextual sparks. */
  aiOn: boolean;
  level: Difficulty;
  onFinish: (text: string, durationMs: number) => void;
  onExit: () => void;
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The anti-stuck ladder (all while the writer is idle):
 *   0–4s   flow — show nothing
 *   4–8s   gentle pulse ("keep going")
 *   8s+    a Spark slides up: tiny question + a TAPPABLE starter that inserts
 *          itself into the text. Ignored sparks auto-rotate like a feed.
 * AI sparks are prefetched during the pause (from the writer's own text) and
 * join the rotation, so help gets more personal the longer they're stuck.
 */
const NUDGE_MS = 4000;
const SPARK_MS = 8000;
const ROTATE_MS = 12000;

interface Toast {
  id: number;
  label: string;
}

export function Write({
  session,
  goalType,
  goalValue,
  gentleNudge,
  aiOn,
  level,
  onFinish,
  onExit,
}: WriteProps) {
  const beats = session.beats;
  const multi = beats.length > 1;

  const [stepIndex, setStepIndex] = useState(0);
  const [texts, setTexts] = useState<string[]>(() => beats.map(() => ""));
  const [elapsed, setElapsed] = useState(0);
  const [showNudge, setShowNudge] = useState(false);
  const [spark, setSpark] = useState<Spark | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const startRef = useRef(Date.now());
  const lastTypeRef = useRef(Date.now());
  const textRef = useRef("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const engineRef = useRef(createSparkEngine());
  const aiQueueRef = useRef<Spark[]>([]);
  const aiFetchedRef = useRef(false);
  const lastRotateRef = useRef(0);
  const milestoneRef = useRef(0);
  const toastIdRef = useRef(0);

  const beat = beats[stepIndex];
  const current = texts[stepIndex] ?? "";
  const currentWords = countWords(current);
  const totalWords = countWords(texts.join(" "));
  const isLast = stepIndex === beats.length - 1;

  const goalReached =
    goalType === "time" ? elapsed >= goalValue : totalWords >= goalValue;
  const pct =
    goalType === "time"
      ? Math.min(elapsed / goalValue, 1)
      : Math.min(totalWords / Math.max(goalValue, 1), 1);

  // Focus the editor on mount and whenever the step changes.
  useEffect(() => {
    taRef.current?.focus();
    textRef.current = texts[stepIndex] ?? "";
    lastTypeRef.current = Date.now();
    setShowNudge(false);
    setSpark(null);
    aiFetchedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const nextSpark = useCallback((): Spark => {
    const queued = aiQueueRef.current.shift();
    if (queued) return queued;
    return engineRef.current.next(textRef.current, beats[stepIndex]);
  }, [beats, stepIndex]);

  const revealSpark = useCallback(() => {
    setSpark(nextSpark());
    setShowNudge(false);
    lastRotateRef.current = Date.now();
  }, [nextSpark]);

  // Heartbeat: timer + the anti-stuck ladder.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setElapsed(Math.floor((now - startRef.current) / 1000));
      if (!gentleNudge) return;

      const idle = now - lastTypeRef.current;
      const reached =
        goalType === "time" ? (now - startRef.current) / 1000 >= goalValue : false;
      if (reached) return;

      // Prefetch contextual AI sparks as soon as a real pause begins, so
      // they're ready by the time the spark shows.
      if (aiOn && idle >= NUDGE_MS && !aiFetchedRef.current && textRef.current.trim().length > 0) {
        aiFetchedRef.current = true;
        aiSparks(beats[stepIndex].prompt, textRef.current, level).then((list) => {
          aiQueueRef.current = list.map((s, i) => ({
            id: `ai-${Date.now()}-${i}`,
            question: s.question,
            starter: s.starter,
            source: "ai" as const,
          }));
        });
      }

      setSpark((cur) => {
        if (cur) {
          // Feed feeling: an ignored spark quietly rotates to a fresh one.
          if (now - lastRotateRef.current >= ROTATE_MS) {
            lastRotateRef.current = now;
            return nextSpark();
          }
          return cur;
        }
        if (idle >= SPARK_MS) {
          lastRotateRef.current = now;
          return nextSpark();
        }
        return cur;
      });
      setShowNudge(idle >= NUDGE_MS && idle < SPARK_MS && textRef.current.trim().length > 0);
    }, 1000);
    return () => window.clearInterval(id);
  }, [gentleNudge, goalType, goalValue, aiOn, level, beats, stepIndex, nextSpark]);

  // Milestone pops — tiny variable rewards while writing.
  useEffect(() => {
    const crossed = MILESTONES.filter(
      (m) => totalWords >= m && m > milestoneRef.current,
    );
    if (crossed.length === 0) return;
    const top = Math.max(...crossed);
    milestoneRef.current = top;
    const id = ++toastIdRef.current;
    setToasts((t) => [...t, { id, label: `${top} words` }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 1800);
  }, [totalWords]);

  function markTyped() {
    lastTypeRef.current = Date.now();
    aiFetchedRef.current = false;
    setShowNudge(false);
    setSpark(null);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setTexts((prev) => {
      const next = [...prev];
      next[stepIndex] = v;
      return next;
    });
    textRef.current = v;
    markTyped();
  }

  /** One tap and you're writing again: the starter lands in the text. */
  function insertStarter(starter: string) {
    const cur = textRef.current;
    let base = cur.trimEnd();
    if (base.length > 0 && !/[.!?…"')\]]$/.test(base)) base += ".";
    const next = (base.length ? base + " " : "") + starter + " ";
    setTexts((prev) => {
      const arr = [...prev];
      arr[stepIndex] = next;
      return arr;
    });
    textRef.current = next;
    markTyped();
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  function handleExit() {
    if (texts.some((t) => t.trim().length > 0)) {
      const ok = window.confirm("Leave this session? Your writing won't be saved.");
      if (!ok) return;
    }
    onExit();
  }

  function handleFinish() {
    const combined = texts.map((t) => t.trim()).filter(Boolean).join("\n\n");
    if (countWords(combined) === 0) return;
    onFinish(combined, Date.now() - startRef.current);
  }

  const placeholder = beat.starter
    ? `${beat.starter}…`
    : "Start writing — and don't stop.";

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-background">
      <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4 px-5 pb-1.5 pt-5 sm:px-6">
        <div className="max-w-[80%] text-sm text-muted-foreground">
          {multi ? (
            <>
              {session.platform && (
                <Badge variant="sage" className="mb-1.5">
                  {session.platform}
                </Badge>
              )}
              <div className="font-serif text-[17px] font-semibold leading-snug text-foreground">
                {session.subject}
              </div>
            </>
          ) : (
            <>
              <span>Writing about: </span>
              <b className="font-semibold text-foreground">{beat.prompt}</b>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleExit}
          aria-label="Leave session"
        >
          <X />
        </Button>
      </div>

      {multi && (
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-5 pt-1 sm:px-6">
          <div className="flex gap-1.5">
            {beats.map((b, i) => (
              <span
                key={b.id}
                className={cn(
                  "h-[5px] w-5 rounded-none transition-colors",
                  i === stepIndex
                    ? "bg-foreground"
                    : i < stepIndex
                      ? "bg-brand"
                      : "bg-input",
                )}
              />
            ))}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            Step {stepIndex + 1} of {beats.length}
          </span>
        </div>
      )}

      {multi && (
        <div className="mx-auto mt-2.5 w-full max-w-3xl px-5 font-serif text-lg leading-snug sm:px-6">
          {beat.prompt}
        </div>
      )}

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 px-5 sm:px-6">
        <textarea
          ref={taRef}
          className="app-editor"
          value={current}
          onChange={handleChange}
          placeholder={placeholder}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="sentences"
          autoComplete="off"
        />
      </div>

      <div
        className="pointer-events-none fixed bottom-[150px] left-1/2 z-[55] flex -translate-x-1/2 flex-col items-center gap-1.5"
        aria-hidden="true"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-milestone rounded-none bg-gold px-4 py-1.5 text-sm font-semibold text-gold-foreground shadow-md"
          >
            {t.label}
          </div>
        ))}
      </div>

      {showNudge && !spark && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[52] -translate-x-1/2 animate-nudge rounded-none bg-foreground px-4 py-2 text-sm text-background shadow-md">
          keep going — don&apos;t stop
        </div>
      )}

      {spark && (
        <div
          className="fixed bottom-24 left-1/2 z-[60] w-[min(560px,calc(100vw-40px))] -translate-x-1/2 animate-spark-in rounded-lg border border-border bg-card p-4 shadow-lg"
          role="status"
        >
          <div className="font-serif text-[17px] leading-snug">
            {spark.source === "ai" && (
              <span className="kicker mr-2 align-middle">AI</span>
            )}
            {spark.question}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              className="flex flex-1 items-center justify-between gap-2.5 rounded-none border border-dashed border-brand bg-brand/10 px-3.5 py-2.5 text-left text-[15px] font-semibold text-brand transition-colors hover:bg-brand/15"
              onClick={() => insertStarter(spark.starter)}
            >
              “{spark.starter}…”
              <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-wider opacity-65">
                tap to use
              </span>
            </button>
            <Button
              variant="secondary"
              size="icon-sm"
              onClick={revealSpark}
              aria-label="Another idea"
              title="Another idea"
            >
              <RefreshCw />
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-3 sm:gap-4 sm:px-6">
          {multi && stepIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              aria-label="Previous step"
            >
              <ArrowLeft />
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={revealSpark}
            aria-label="I'm stuck — give me an idea"
            title="Stuck? Get an idea"
          >
            <Lightbulb />
          </Button>
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex justify-between text-[13px] tabular-nums text-muted-foreground">
              <span>
                {goalType === "words"
                  ? `${totalWords} / ${goalValue} words`
                  : `${totalWords} word${totalWords === 1 ? "" : "s"}`}
                {goalReached && " · goal reached"}
              </span>
              <span>
                {goalType === "time"
                  ? `${mmss(elapsed)} / ${mmss(goalValue)}`
                  : mmss(elapsed)}
              </span>
            </div>
            <Progress value={pct * 100} />
          </div>
          {isLast ? (
            <Button onClick={handleFinish} disabled={totalWords === 0}>
              I&apos;m done
            </Button>
          ) : (
            <Button
              onClick={() =>
                setStepIndex((i) => Math.min(beats.length - 1, i + 1))
              }
              disabled={currentWords === 0}
            >
              Next <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
