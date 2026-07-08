import { useEffect, useState } from "react";
import { useStore } from "@/store/StoreContext";
import type { Prompt, Settings } from "@/types";
import { dailyPrompt, randomPrompt, themeById } from "@/lib/shared/prompts";
import { aiGeneratePrompts } from "@/lib/client/ai";
import { greeting, todayKey } from "@/lib/shared/date";
import { streakInfo, MAX_FREEZES, type StreakStatus } from "@/lib/shared/streak";

interface HomeProps {
  onStart: (prompt: Prompt) => void;
}

function goalLabel(s: Settings): string {
  if (s.goalType === "time") return `${Math.round(s.goalValue / 60)} min`;
  return `${s.goalValue} words`;
}

function statusCopy(status: StreakStatus, streak: number): { text: string; warn: boolean } | null {
  switch (status) {
    case "none":
      return { text: "The first session is the hardest to start — so let's keep it small. A few minutes is plenty.", warn: false };
    case "today":
      return { text: "You've already written today. ✓ Anything more is a bonus.", warn: false };
    case "safe":
      return { text: `You're on a ${streak}-day streak. A few minutes today keeps it alive.`, warn: false };
    case "at-risk":
      return { text: "You missed a day — but a freeze will quietly cover it when you write today. 🧊", warn: true };
    case "broken":
      return { text: "Your streak reset. No guilt — today simply starts a new one.", warn: true };
  }
}

function genErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed|cors/i.test(msg))
    return "Couldn't reach that provider from the browser. Try a different one in Settings.";
  if (/401|403|api key|invalid|authentication/i.test(msg))
    return "That API key didn't work — check it in Settings.";
  if (/429|rate|quota/i.test(msg))
    return "The provider is busy or out of free quota right now.";
  return "Couldn't generate new prompts just now — the curated ones are still here.";
}

export function Home({ onStart }: HomeProps) {
  const { store, addGeneratedPrompts } = useStore();
  const { settings, profile, hasWritten, aiPrompts } = store;
  const today = todayKey();
  const info = streakInfo(profile, today);

  const [prompt, setPrompt] = useState<Prompt>(() =>
    dailyPrompt(today, settings.difficulty, settings.focuses, aiPrompts),
  );
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Freshen the daily prompt when the level or real-life focus changes.
  useEffect(() => {
    setPrompt(dailyPrompt(today, settings.difficulty, settings.focuses, aiPrompts));
    // aiPrompts intentionally excluded: generating shouldn't reset the shown prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.difficulty, settings.focuses, today]);

  const theme = themeById(prompt.themeId);
  const status = statusCopy(info.status, info.streak);
  const hello = settings.name ? `${greeting()}, ${settings.name}.` : `${greeting()}.`;

  const aiOn = settings.ai.enabled;

  async function generate() {
    if (!theme) return;
    setGenerating(true);
    setGenError(null);
    try {
      const avoid = [
        prompt.text,
        ...aiPrompts.slice(-8).map((p) => p.text),
      ];
      const fresh = await aiGeneratePrompts({
        theme,
        level: settings.difficulty,
        count: 5,
        name: settings.name || undefined,
        avoid,
      });
      addGeneratedPrompts(fresh);
      setPrompt(fresh[0]);
    } catch (e) {
      setGenError(genErrorText(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="screen screen-pad">
      <div className="container">
        <div className="home-hello">
          <h1>{hello}</h1>
          <p>
            {info.status === "today"
              ? "You showed up today. That's the whole habit."
              : "Ready to write a little English? Don't aim for perfect — just keep going."}
          </p>
        </div>

        <div className="prompt-card">
          <div className="prompt-eyebrow-row">
            <span className="eyebrow">
              {theme ? `${theme.emoji} ${theme.label}` : "Today's prompt"}
            </span>
            {prompt.source === "ai" && <span className="ai-tag">✨ fresh</span>}
          </div>
          <p className="prompt-text">{prompt.text}</p>
          {prompt.starter && (
            <span className="prompt-starter">{prompt.starter}…</span>
          )}
          <div className="prompt-actions">
            <button className="btn btn-primary btn-lg" onClick={() => onStart(prompt)}>
              Start writing
            </button>
            <button
              className="shuffle"
              onClick={() =>
                setPrompt(
                  randomPrompt(settings.difficulty, settings.focuses, aiPrompts, prompt.id),
                )
              }
            >
              ↻ Different prompt
            </button>
            {aiOn && (
              <button className="shuffle" onClick={generate} disabled={generating}>
                {generating ? (
                  <>
                    <span className="spinner spinner-sm" /> Generating…
                  </>
                ) : (
                  <>✨ Generate fresh</>
                )}
              </button>
            )}
          </div>
          {genError && <div className="status-note warn" style={{ marginTop: 14 }}>{genError}</div>}
        </div>

        {!aiOn && theme && (
          <p className="faint focus-hint">
            {settings.focuses.length > 0
              ? "Focused on your chosen real-life themes — "
              : "Rotating across real-life themes — "}
            tune what you practice in Settings.
          </p>
        )}

        <div className="home-row">
          <div className="chip-card">
            <div className="chip-flame">{info.streak > 0 ? "🔥" : "🌱"}</div>
            <div>
              <div className="chip-num">{info.streak}</div>
              <div className="chip-label">day streak</div>
              <div className="freeze-pills" title={`${info.freezes} streak freezes`}>
                {Array.from({ length: MAX_FREEZES }, (_, i) => (
                  <span
                    key={i}
                    className={`freeze-pill${i < info.freezes ? "" : " empty"}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="chip-card">
            <div className="chip-flame">🎯</div>
            <div>
              <div className="chip-num">{goalLabel(settings)}</div>
              <div className="chip-label">today's goal · the point is to not stop</div>
            </div>
          </div>
        </div>

        {status && (
          <div className={`status-note${status.warn ? " warn" : ""}`}>
            {status.text}
          </div>
        )}

        {!hasWritten && (
          <div className="card" style={{ marginTop: 16 }}>
            <span className="eyebrow">How this works</span>
            <p style={{ margin: "10px 0 0", color: "var(--ink-soft)" }}>
              Write freely for a few minutes and <b>don't fix anything</b> — no
              backspacing to be perfect, no worrying about spelling. Just follow
              the prompt and keep the words coming. When you're done, you'll get
              gentle, encouraging feedback — but only if you want it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
