import { useCallback, useEffect, useRef, useState } from "react";
import type { Difficulty, GoalType, WriteSession } from "../types";
import { countWords } from "../lib/stats";
import { createSparkEngine, MILESTONES, type Spark } from "../lib/sparks";
import { aiSparks } from "../lib/ai";

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
    setToasts((t) => [...t, { id, label: `${top} words 🔥` }]);
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
  function useStarter(starter: string) {
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
    <div className="write">
      <div className="write-head">
        <div className="write-prompt">
          {multi ? (
            <>
              {session.platform && <span className="trend-tag-sm">{session.platform}</span>}
              <div className="write-subject">{session.subject}</div>
            </>
          ) : (
            <>
              <span className="faint">Writing about: </span>
              <b>{beat.prompt}</b>
            </>
          )}
        </div>
        <button className="write-exit" onClick={handleExit} aria-label="Leave session">
          &times;
        </button>
      </div>

      {multi && (
        <div className="beat-bar">
          <div className="beat-dots">
            {beats.map((b, i) => (
              <span
                key={b.id}
                className={`beat-dot${i === stepIndex ? " on" : ""}${i < stepIndex ? " done" : ""}`}
              />
            ))}
          </div>
          <span className="beat-count">
            Step {stepIndex + 1} of {beats.length}
          </span>
        </div>
      )}

      {multi && <div className="beat-prompt-line">{beat.prompt}</div>}

      <div className="write-body">
        <textarea
          ref={taRef}
          className="editor"
          value={current}
          onChange={handleChange}
          placeholder={placeholder}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="sentences"
          autoComplete="off"
        />
      </div>

      <div className="milestone-layer" aria-hidden="true">
        {toasts.map((t) => (
          <div key={t.id} className="milestone-pop">
            {t.label}
          </div>
        ))}
      </div>

      {showNudge && !spark && <div className="nudge">keep going — don't stop ✍️</div>}

      {spark && (
        <div className="spark-card" role="status">
          <div className="spark-q">
            {spark.source === "ai" && <span className="spark-ai">✨</span>}
            {spark.question}
          </div>
          <div className="spark-actions">
            <button className="spark-starter" onClick={() => useStarter(spark.starter)}>
              “{spark.starter}…”
              <span className="spark-tap">tap to use</span>
            </button>
            <button
              className="spark-again"
              onClick={revealSpark}
              aria-label="Another idea"
              title="Another idea"
            >
              ↻
            </button>
          </div>
        </div>
      )}

      <div className="write-foot">
        <div className="write-foot-inner">
          {multi && stepIndex > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              aria-label="Previous step"
            >
              ←
            </button>
          )}
          <button
            className="stuck-btn"
            onClick={revealSpark}
            aria-label="I'm stuck — give me an idea"
            title="Stuck? Get an idea"
          >
            💡
          </button>
          <div className="progress-wrap">
            <div className="progress-meta">
              <span>
                {goalType === "words"
                  ? `${totalWords} / ${goalValue} words`
                  : `${totalWords} word${totalWords === 1 ? "" : "s"}`}
                {goalReached && " · goal reached 🎉"}
              </span>
              <span>
                {goalType === "time"
                  ? `${mmss(elapsed)} / ${mmss(goalValue)}`
                  : mmss(elapsed)}
              </span>
            </div>
            <div className="progress-track">
              <div
                className={`progress-fill${goalReached ? " done" : ""}`}
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </div>
          {isLast ? (
            <button className="btn btn-primary" onClick={handleFinish} disabled={totalWords === 0}>
              I'm done
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setStepIndex((i) => Math.min(beats.length - 1, i + 1))}
              disabled={currentWords === 0}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
