import { useStore } from "../store/StoreContext";
import type { AiProvider, Difficulty, GoalType } from "../types";

const TIME_OPTIONS = [120, 180, 300, 600]; // seconds
const WORD_OPTIONS = [50, 100, 150, 250];

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: "Gentle",
  2: "Steady",
  3: "Stretch",
};

interface ProviderMeta {
  id: AiProvider;
  label: string;
  keyUrl: string;
  keyUrlLabel: string;
  keyPlaceholder: string;
  note: string;
  models: string[];
  needsBaseUrl?: boolean;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "anthropic",
    label: "Anthropic — Claude",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyUrlLabel: "console.anthropic.com",
    keyPlaceholder: "sk-ant-…",
    note: "Pay-as-you-go, but tiny — well under 1¢ per session on Haiku. New accounts often include free starter credit. (Separate from a Claude Pro subscription.)",
    models: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-8"],
  },
  {
    id: "gemini",
    label: "Google Gemini — free tier",
    keyUrl: "https://aistudio.google.com/apikey",
    keyUrlLabel: "aistudio.google.com/apikey",
    keyPlaceholder: "AIza…",
    note: "Generous free tier. Get a key from Google AI Studio — works directly from the browser.",
    models: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"],
  },
  {
    id: "groq",
    label: "Groq — free tier",
    keyUrl: "https://console.groq.com/keys",
    keyUrlLabel: "console.groq.com/keys",
    keyPlaceholder: "gsk_…",
    note: "Free and very fast. If your browser blocks the request, switch to Gemini or an OpenAI-compatible endpoint.",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"],
  },
  {
    id: "openai",
    label: "OpenAI-compatible (OpenRouter, local…)",
    keyUrl: "https://openrouter.ai/keys",
    keyUrlLabel: "openrouter.ai/keys",
    keyPlaceholder: "sk-or-… / sk-…",
    note: "Use any OpenAI-compatible endpoint. OpenRouter has free models and works from the browser. Set the base URL + model name.",
    models: ["meta-llama/llama-3.3-70b-instruct:free", "gpt-4o-mini"],
    needsBaseUrl: true,
  },
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

  const ai = s.ai;
  const meta = PROVIDERS.find((p) => p.id === ai.provider)!;
  const cfg = ai.providers[ai.provider];

  function setProvider(provider: AiProvider) {
    updateSettings({ ai: { ...ai, provider } });
  }
  function setProviderField(field: "apiKey" | "model" | "baseUrl", value: string) {
    const p = ai.provider;
    updateSettings({
      ai: {
        ...ai,
        providers: { ...ai.providers, [p]: { ...ai.providers[p], [field]: value } },
      },
    });
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
              <div className="setting-label">Use AI for feedback</div>
              <div className="setting-desc">
                Optional. Warmer, more personal feedback after you write. The app
                works fully without it — bring your own key from any provider below.
              </div>
            </div>
            <button
              className={`toggle${ai.enabled ? " on" : ""}`}
              onClick={() => updateSettings({ ai: { ...ai, enabled: !ai.enabled } })}
              aria-pressed={ai.enabled}
              aria-label="Toggle AI feedback"
            />
          </div>

          {ai.enabled && (
            <>
              <div className="field">
                <label>Provider</label>
                <select
                  className="select"
                  value={ai.provider}
                  onChange={(e) => setProvider(e.target.value as AiProvider)}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>API key</label>
                <input
                  className="input"
                  type="password"
                  value={cfg.apiKey}
                  placeholder={meta.keyPlaceholder}
                  autoComplete="off"
                  onChange={(e) => setProviderField("apiKey", e.target.value)}
                />
              </div>

              {meta.needsBaseUrl && (
                <div className="field">
                  <label>Base URL</label>
                  <input
                    className="input"
                    value={cfg.baseUrl ?? ""}
                    placeholder="https://openrouter.ai/api/v1"
                    autoComplete="off"
                    onChange={(e) => setProviderField("baseUrl", e.target.value)}
                  />
                </div>
              )}

              <div className="field">
                <label>Model</label>
                <input
                  className="input"
                  value={cfg.model}
                  list={`models-${ai.provider}`}
                  placeholder={meta.models[0]}
                  autoComplete="off"
                  onChange={(e) => setProviderField("model", e.target.value)}
                />
                <datalist id={`models-${ai.provider}`}>
                  {meta.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <p className="faint" style={{ fontSize: 13, marginTop: 14, marginBottom: 0 }}>
                {meta.note} Get a key at{" "}
                <a href={meta.keyUrl} target="_blank" rel="noreferrer">
                  {meta.keyUrlLabel}
                </a>
                .
              </p>
              <p className="faint" style={{ fontSize: 13, marginTop: 8, marginBottom: 0 }}>
                🔒 Your key is stored only in this browser and is sent only to the
                provider you choose, only when you ask for feedback.
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
