import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/StoreContext";
import type { Entry, Feedback as FeedbackData } from "../types";
import { localFeedback } from "../lib/feedback";
import { aiFeedback } from "../lib/ai";

interface FeedbackProps {
  entry: Entry;
  onBack: () => void;
}

function humanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed|cors/i.test(msg)) {
    return "Couldn't reach that provider from the browser — it may block direct requests. Try a different provider in Settings. Here's your on-device feedback meanwhile.";
  }
  if (/401|403|authentication|api key|api_key|invalid/i.test(msg)) {
    return "That API key didn't work. Double-check it in Settings — meanwhile, here's your on-device feedback.";
  }
  if (/429|rate|quota/i.test(msg)) {
    return "The provider is busy or out of free quota right now. Here's your on-device feedback instead.";
  }
  return "Couldn't reach the AI provider just now — here's your on-device feedback instead.";
}

export function Feedback({ entry, onBack }: FeedbackProps) {
  const { store } = useStore();
  const { settings, profile, entries } = store;

  const avgWords = useMemo(() => {
    const prior = entries.filter((e) => e.id !== entry.id);
    if (!prior.length) return 0;
    return Math.round(prior.reduce((s, e) => s + e.words, 0) / prior.length);
  }, [entries, entry.id]);

  const local = useMemo(
    () => localFeedback(entry, profile, avgWords),
    [entry, profile, avgWords],
  );

  const [feedback, setFeedback] = useState<FeedbackData>(local);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  const aiCfg = settings.ai.providers[settings.ai.provider];
  const aiOn = settings.ai.enabled && aiCfg.apiKey.trim().length > 0;

  useEffect(() => {
    if (!aiOn || ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);
    aiFeedback(entry, settings.ai)
      .then((fb) => !cancelled && setFeedback(fb))
      .catch((err) => !cancelled && setError(humanError(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [aiOn, entry, settings.ai]);

  return (
    <div className="screen screen-pad">
      <div className="container center-narrow">
        <button className="back-link" onClick={onBack}>
          ← Back home
        </button>

        {loading && (
          <div className="loading-row">
            <span className="spinner" />
            <span>Asking Claude for a closer look…</span>
          </div>
        )}
        {error && (
          <div className="status-note warn" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div className="fb-lead">{feedback.encouragement}</div>

        <div className="fb-section">
          <span className="eyebrow">What went well</span>
          <ul className="fb-list">
            {feedback.strengths.map((s, i) => (
              <li className="fb-item" key={i}>
                <span className="fb-mark">✅</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {feedback.suggestions.length > 0 && (
          <div className="fb-section">
            <span className="eyebrow">Gentle ideas to play with</span>
            <ul className="fb-list">
              {feedback.suggestions.map((s, i) => (
                <li className="fb-item" key={i}>
                  <span className="fb-mark">💡</span>
                  <span>
                    {s.note}
                    {s.example && <span className="fb-example">{s.example}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="fb-try">
          <span className="eyebrow">One thing to try next time</span>
          <p style={{ margin: "8px 0 0" }}>{feedback.oneThingToTry}</p>
        </div>

        <p className="faint" style={{ fontSize: 13, marginTop: 16 }}>
          {feedback.source === "ai"
            ? "Feedback from your AI provider, just for you."
            : aiOn
              ? "On-device feedback."
              : "On-device feedback. Want a closer, more personal read? Add an API key in Settings — Anthropic or a free provider."}
        </p>

        <div className="fb-section">
          <span className="eyebrow">What you wrote</span>
          <div className="entry-read" style={{ marginTop: 8 }}>
            {entry.text}
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <button className="btn btn-block" onClick={onBack}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
