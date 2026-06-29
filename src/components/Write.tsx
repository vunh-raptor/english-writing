import { useEffect, useRef, useState } from "react";
import type { GoalType, WriteSession } from "../types";
import { countWords } from "../lib/stats";

interface WriteProps {
  session: WriteSession;
  goalType: GoalType;
  goalValue: number;
  gentleNudge: boolean;
  onFinish: (text: string, durationMs: number) => void;
  onExit: () => void;
}

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const IDLE_MS = 3000;

export function Write({
  session,
  goalType,
  goalValue,
  gentleNudge,
  onFinish,
  onExit,
}: WriteProps) {
  const beats = session.beats;
  const multi = beats.length > 1;

  const [stepIndex, setStepIndex] = useState(0);
  const [texts, setTexts] = useState<string[]>(() => beats.map(() => ""));
  const [elapsed, setElapsed] = useState(0);
  const [showNudge, setShowNudge] = useState(false);

  const startRef = useRef(Date.now());
  const lastTypeRef = useRef(Date.now());
  const textRef = useRef("");
  const taRef = useRef<HTMLTextAreaElement>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // One-second heartbeat: advance the timer and decide whether to nudge.
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      const idle = Date.now() - lastTypeRef.current > IDLE_MS;
      const reached =
        goalType === "time"
          ? (Date.now() - startRef.current) / 1000 >= goalValue
          : false;
      setShowNudge(gentleNudge && !reached && idle && textRef.current.trim().length > 0);
    }, 1000);
    return () => window.clearInterval(id);
  }, [gentleNudge, goalType, goalValue]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setTexts((prev) => {
      const next = [...prev];
      next[stepIndex] = v;
      return next;
    });
    textRef.current = v;
    lastTypeRef.current = Date.now();
    if (showNudge) setShowNudge(false);
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

      {showNudge && <div className="nudge">keep going — don't stop ✍️</div>}

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
