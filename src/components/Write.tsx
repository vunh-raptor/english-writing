import { useEffect, useRef, useState } from "react";
import type { GoalType, Prompt } from "../types";
import { countWords } from "../lib/stats";

interface WriteProps {
  prompt: Prompt;
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
  prompt,
  goalType,
  goalValue,
  gentleNudge,
  onFinish,
  onExit,
}: WriteProps) {
  const [text, setText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [showNudge, setShowNudge] = useState(false);

  const startRef = useRef(Date.now());
  const lastTypeRef = useRef(Date.now());
  const textRef = useRef("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const words = countWords(text);
  const goalReached =
    goalType === "time" ? elapsed >= goalValue : words >= goalValue;
  const pct =
    goalType === "time"
      ? Math.min(elapsed / goalValue, 1)
      : Math.min(words / Math.max(goalValue, 1), 1);

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  // One-second heartbeat: advance the timer and decide whether to nudge.
  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      const idle = Date.now() - lastTypeRef.current > IDLE_MS;
      const reached =
        goalType === "time"
          ? (Date.now() - startRef.current) / 1000 >= goalValue
          : countWords(textRef.current) >= goalValue;
      setShowNudge(gentleNudge && !reached && idle && textRef.current.trim().length > 0);
    }, 1000);
    return () => window.clearInterval(id);
  }, [gentleNudge, goalType, goalValue]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    textRef.current = v;
    lastTypeRef.current = Date.now();
    if (showNudge) setShowNudge(false);
  }

  function handleExit() {
    if (text.trim().length > 0) {
      const ok = window.confirm(
        "Leave this session? Your writing won't be saved.",
      );
      if (!ok) return;
    }
    onExit();
  }

  function handleFinish() {
    if (words === 0) return;
    onFinish(text.trim(), Date.now() - startRef.current);
  }

  const placeholder = prompt.starter
    ? `${prompt.starter}…`
    : "Start writing — and don't stop.";

  return (
    <div className="write">
      <div className="write-head">
        <div className="write-prompt">
          <span className="faint">Writing about: </span>
          <b>{prompt.text}</b>
        </div>
        <button className="write-exit" onClick={handleExit} aria-label="Leave session">
          &times;
        </button>
      </div>

      <div className="write-body">
        <textarea
          ref={taRef}
          className="editor"
          value={text}
          onChange={handleChange}
          placeholder={placeholder}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="sentences"
          autoComplete="off"
          /* no grammar/spelling UI mid-flow — the editor and the critic are
             different modes, and switching on the critic kills fluency. */
        />
      </div>

      {showNudge && <div className="nudge">keep going — don't stop ✍️</div>}

      <div className="write-foot">
        <div className="write-foot-inner">
          <div className="progress-wrap">
            <div className="progress-meta">
              <span>
                {goalType === "words"
                  ? `${words} / ${goalValue} words`
                  : `${words} word${words === 1 ? "" : "s"}`}
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
          <button
            className="btn btn-primary"
            onClick={handleFinish}
            disabled={words === 0}
          >
            I'm done
          </button>
        </div>
      </div>
    </div>
  );
}
