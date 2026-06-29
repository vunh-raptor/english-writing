import { useStore } from "../store/StoreContext";
import { THEMES } from "../lib/prompts";
import type { Difficulty, GoalType } from "../types";

const TIME_OPTIONS = [120, 180, 300, 600]; // seconds
const WORD_OPTIONS = [50, 100, 150, 250];

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: "Gentle",
  2: "Steady",
  3: "Stretch",
};

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

  function toggleFocus(id: string) {
    const set = new Set(s.focuses);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    updateSettings({ focuses: [...set] });
  }

  function handleReset() {
    const ok = window.confirm(
      "Erase all your writing, streak, and settings from this browser? This can't be undone.",
    );
    if (ok) reset();
  }

  const ai = s.ai;

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

          <div className="setting" style={{ display: "block" }}>
            <div className="setting-label">What are you practicing for?</div>
            <div className="setting-desc">
              Pick the real-life areas you want prompts from — your prompts (and
              any you generate with AI) come from these. Leave all off for a bit
              of everything.
            </div>
            <div className="chips" style={{ marginTop: 12 }}>
              {THEMES.map((t) => {
                const on = s.focuses.includes(t.id);
                return (
                  <button
                    key={t.id}
                    className={`chip-toggle${on ? " on" : ""}`}
                    onClick={() => toggleFocus(t.id)}
                    aria-pressed={on}
                    title={t.blurb}
                  >
                    {t.emoji} {t.label}
                  </button>
                );
              })}
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
          <div className="setting" style={{ paddingTop: 0, borderBottom: 0 }}>
            <div>
              <div className="setting-label">Use AI for feedback &amp; fresh prompts</div>
              <div className="setting-desc">
                Optional. Warmer, more personal feedback after you write, plus
                "✨ generate fresh" prompts. Runs on our server using free-tier
                AI — no key needed here. The app works fully without it.
              </div>
            </div>
            <button
              className={`toggle${ai.enabled ? " on" : ""}`}
              onClick={() => updateSettings({ ai: { ...ai, enabled: !ai.enabled } })}
              aria-pressed={ai.enabled}
              aria-label="Toggle AI feedback"
            />
          </div>
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
