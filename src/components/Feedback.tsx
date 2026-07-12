import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type { Entry, Feedback as FeedbackData } from "@/types";
import { localFeedback } from "@/lib/shared/feedback";
import { aiFeedback } from "@/lib/client/ai";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";

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

  const aiOn = settings.ai.enabled;

  useEffect(() => {
    if (!aiOn || ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;
    setLoading(true);
    setError(null);
    aiFeedback(entry)
      .then((fb) => !cancelled && setFeedback(fb))
      .catch((err) => !cancelled && setError(humanError(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [aiOn, entry]);

  return (
    <PageContainer width="narrow">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="-ml-2 mb-2 px-2"
      >
        <ArrowLeft /> Back home
      </Button>

      {loading && (
        <div className="flex items-center gap-3 py-4 text-muted-foreground">
          <span className="spinner" />
          <span>Asking Claude for a closer look…</span>
        </div>
      )}
      {error && <div className="note note-warning mb-3">{error}</div>}

      <div className="rounded-lg bg-sage-muted px-6 py-5 font-serif text-xl leading-relaxed text-sage-ink">
        {feedback.encouragement}
      </div>

      <section className="mt-5">
        <Badge variant="eyebrow">What went well</Badge>
        <ul className="mt-2.5 flex flex-col gap-2.5">
          {feedback.strengths.map((s, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-md border border-border bg-card p-4 shadow-soft"
            >
              <span className="mt-0.5 shrink-0">✅</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      {feedback.suggestions.length > 0 && (
        <section className="mt-5">
          <Badge variant="eyebrow">Gentle ideas to play with</Badge>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {feedback.suggestions.map((s, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-md border border-border bg-card p-4 shadow-soft"
              >
                <span className="mt-0.5 shrink-0">💡</span>
                <div>
                  <span>{s.note}</span>
                  {s.example && (
                    <span className="mt-1.5 block w-fit rounded bg-muted px-2 py-0.5 text-sm text-muted-foreground">
                      {s.example}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-5 rounded-lg border border-dashed border-input bg-card p-5">
        <Badge variant="eyebrow">One thing to try next time</Badge>
        <p className="mt-2">{feedback.oneThingToTry}</p>
      </div>

      <p className="mt-4 text-[13px] text-muted-foreground">
        {feedback.source === "ai"
          ? "Feedback from your AI coach, just for you."
          : aiOn
            ? "On-device feedback."
            : "On-device feedback. Want a closer, more personal read? Turn on AI feedback in Settings."}
      </p>

      <section className="mt-5">
        <Badge variant="eyebrow">What you wrote</Badge>
        <div className="entry-read mt-2">{entry.text}</div>
      </section>

      <div className="mt-6">
        <Button variant="secondary" className="w-full" onClick={onBack}>
          Done
        </Button>
      </div>
    </PageContainer>
  );
}
