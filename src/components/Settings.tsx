import { useStore } from "../store/StoreContext";
import type { Difficulty, GoalType } from "../types";

const TIME_OPTIONS = [120, 180, 300, 600]; // seconds
const WORD_OPTIONS = [50, 100, 150, 250];

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: "Gentle",
  2: "Steady",
  3: "Stretch",
};

const MODEL_OPTIONS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 — most capable" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 — balanced" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — fastest" },
];

function timeLabel(sec: number): string {
  return `${Math.round(sec / 60)} min`;
}

export function Settings() {
  const { store, updateSettings, reset } = useStore();
  const s = store.settings;

  function setGoalType(goalType: GoalType) {
    updateSettings({
      goalType,
      goalValue: goalType === "time" ? 300 : 100,
    });
  }

  function handleReset() {
    const ok = window.confirm(
      "Erase all your writing, streak, and settings from this browser? This can't be undone.",
    );
    if (ok) reset();
  }

  return (
    <div className="screen screen-pad">
      <div className="container center-narrow">
        <h1 style={{ fontSize: 26 }}>Settings</h1>

        <div className="card" style={{ marginTop: 18 }}>
          <div className="setting">
            <div>
              <div className="setting-label">Your name</div>
              <div className="setting-desc">Just so we can say hello. Optional.</div>
            </div>
            <input
              className="input"
              style={{ maxWidth: 160 }}
              value={s.name}
              placeholder="optional"
              onChange={(e) => updateSettings({ name: e.target.value })}
            />
          </div>

          <div className="setting">
            <div>
              <div className="setting-label">Session goal</div>
              <div className="setting-desc">
                A goal reframes success as momentum. The point is to not stop —
                not to be perfect.
              </div>
            </div>
            <div className="seg">
              <button
                className={s.goalType === "time" ? "on" : ""}
                onClick={() => setGoalType("time")}
              >
                Time
              </button>
              <button
                className={s.goalType === "words" ? "on" : ""}
                onClick={() => setGoalType("words")}
              >
                Words
              </button>
            </div>
          </div>

          <div className="setting">
            <div className="setting-label">
              {s.goalType === "time" ? "How long" : "How many words"}
            </div>
            <div className="seg">
              {(s.goalType === "time" ? TIME_OPTIONS : WORD_OPTIONS).map((v) => (
                <button
                  key={v}
                  className={s.goalValue === v ? "on" : ""}
                  onClick={() => updateSettings({ goalValue: v })}
                >
                  {s.goalType === "time" ? timeLabel(v) : v}
                </button>
              ))}
            </div>
          </div>

          <div className="setting">
            <div>
              <div className="setting-label">Prompt difficulty</div>
              <div className="setting-desc">
                Match the challenge to your level — too hard brings anxiety, too
                easy brings boredom.
              </div>
            </div>
            <div className="seg">
              {([1, 2, 3] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  className={s.difficulty === d ? "on" : ""}
                  onClick={() => updateSettings({ difficulty: d })}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="setting">
            <div>
              <div className="setting-label">"Keep going" nudge</div>
              <div className="setting-desc">
                A gentle pulse if you pause mid-session. Never deletes anything.
              </div>
            </div>
            <button
              className={`toggle${s.gentleNudge ? " on" : ""}`}
              onClick={() => updateSettings({ gentleNudge: !s.gentleNudge })}
              aria-pressed={s.gentleNudge}
              aria-label="Toggle keep-going nudge"
            />
          </div>

          <div className="setting">
            <div>
              <div className="setting-label">Finish sound</div>
              <div className="setting-desc">A little chime when you complete a session.</div>
            </div>
            <button
              className={`toggle${s.sound ? " on" : ""}`}
              onClick={() => updateSettings({ sound: !s.sound })}
              aria-pressed={s.sound}
              aria-label="Toggle finish sound"
            />
          </div>
        </div>

        <div className="section-title">
          <h2 style={{ fontSize: 18 }}>AI feedback</h2>
        </div>
        <div className="card">
          <div className="setting" style={{ paddingTop: 0 }}>
            <div>
              <div className="setting-label">Use Claude for feedback</div>
              <div className="setting-desc">
                Optional. Warmer, more personal feedback after you write. The app
                works fully without it.
              </div>
            </div>
            <button
              className={`toggle${s.ai.enabled ? " on" : ""}`}
              onClick={() => updateSettings({ ai: { ...s.ai, enabled: !s.ai.enabled } })}
              aria-pressed={s.ai.enabled}
              aria-label="Toggle AI feedback"
            />
          </div>

          {s.ai.enabled && (
            <>
              <div className="field">
                <label>Anthropic API key</label>
                <input
                  className="input"
                  type="password"
                  value={s.ai.apiKey}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                  onChange={(e) =>
                    updateSettings({ ai: { ...s.ai, apiKey: e.target.value } })
                  }
                />
              </div>
              <div className="field">
                <label>Model</label>
                <select
                  className="select"
                  value={s.ai.model}
                  onChange={(e) =>
                    updateSettings({ ai: { ...s.ai, model: e.target.value } })
                  }
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="faint" style={{ fontSize: 13, marginTop: 14, marginBottom: 0 }}>
                🔒 Your key is stored only in this browser and is sent only to
                Anthropic, only when you ask for feedback. Get a key at
                console.anthropic.com.
              </p>
            </>
          )}
        </div>

        <div className="divider" />

        <div className="setting" style={{ borderBottom: 0 }}>
          <div>
            <div className="setting-label danger">Erase everything</div>
            <div className="setting-desc">
              Remove all writing, stats, and settings from this browser.
            </div>
          </div>
          <button className="btn btn-danger" onClick={handleReset}>
            Erase
          </button>
        </div>
      </div>
    </div>
  );
}
