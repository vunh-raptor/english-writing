import { useEffect, useState } from "react";
import { PenLine, RefreshCw, Sparkles } from "lucide-react";
import { useStore } from "@/store/StoreContext";
import type { Prompt, Settings } from "@/types";
import { dailyPrompt, randomPrompt, themeById } from "@/lib/shared/prompts";
import { aiGeneratePrompts } from "@/lib/client/ai";
import { greeting, todayKey } from "@/lib/shared/date";
import { streakInfo, MAX_FREEZES, type StreakStatus } from "@/lib/shared/streak";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/page-container";

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
      return { text: "You've already written today. Anything more is a bonus.", warn: false };
    case "safe":
      return { text: `You're on a ${streak}-day streak. A few minutes today keeps it alive.`, warn: false };
    case "at-risk":
      return { text: "You missed a day — but a freeze will quietly cover it when you write today.", warn: true };
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
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-3xl tracking-tight">{hello}</h1>
        <p className="mt-1.5 text-muted-foreground">
          {info.status === "today"
            ? "You showed up today. That's the whole habit."
            : "Ready to write a little English? Don't aim for perfect — just keep going."}
        </p>
      </div>

      <Card className="prompt-surface overflow-hidden p-6 shadow-md sm:p-7">
        <div className="flex items-center justify-between gap-2.5">
          <Badge variant="eyebrow" className="text-brand">
            {theme ? theme.label : "Today's prompt"}
          </Badge>
          {prompt.source === "ai" && <Badge variant="brand">fresh</Badge>}
        </div>
        <p className="mt-3 font-serif text-[1.6rem] leading-tight tracking-tight">
          {prompt.text}
        </p>
        {prompt.starter && (
          <span className="mt-4 inline-block rounded-lg bg-secondary px-2.5 py-1 italic text-muted-foreground">
            {prompt.starter}…
          </span>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Button size="lg" onClick={() => onStart(prompt)}>
            <PenLine /> Start writing
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              setPrompt(
                randomPrompt(settings.difficulty, settings.focuses, aiPrompts, prompt.id),
              )
            }
          >
            <RefreshCw /> Different prompt
          </Button>
          {aiOn && (
            <Button variant="ghost" onClick={generate} disabled={generating}>
              {generating ? (
                <>
                  <span className="spinner spinner-sm" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles /> Generate fresh
                </>
              )}
            </Button>
          )}
        </div>
        {genError && <div className="note note-warning mt-3.5">{genError}</div>}
      </Card>

      {!aiOn && theme && (
        <p className="mt-3 text-sm text-muted-foreground">
          {settings.focuses.length > 0
            ? "Focused on your chosen real-life themes — "
            : "Rotating across real-life themes — "}
          tune what you practice in Settings.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Card className="p-4">
          <div className="kicker">Streak</div>
          <div className="mt-1 font-serif text-2xl font-semibold leading-none">
            {info.streak}
          </div>
          <div className="text-[13px] text-muted-foreground">day streak</div>
          <div
            className="mt-1.5 inline-flex gap-1"
            title={`${info.freezes} streak freezes`}
          >
            {Array.from({ length: MAX_FREEZES }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2.5 w-2.5 rounded-none border",
                  i < info.freezes
                    ? "border-sage bg-sage-muted"
                    : "border-input bg-transparent",
                )}
              />
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="kicker">Today&apos;s goal</div>
          <div className="mt-1 font-serif text-2xl font-semibold leading-none">
            {goalLabel(settings)}
          </div>
          <div className="text-[13px] text-muted-foreground">
            the point is to not stop
          </div>
        </Card>
      </div>

      {status && (
        <div
          className={cn(
            "note mt-4",
            status.warn ? "note-warning" : "note-positive",
          )}
        >
          {status.text}
        </div>
      )}

      {!hasWritten && (
        <Card className="mt-4 p-6">
          <Badge variant="eyebrow">How this works</Badge>
          <p className="mt-2.5 text-muted-foreground">
            Write freely for a few minutes and <b>don&apos;t fix anything</b> — no
            backspacing to be perfect, no worrying about spelling. Just follow the
            prompt and keep the words coming. When you&apos;re done, you&apos;ll get
            gentle, encouraging feedback — but only if you want it.
          </p>
        </Card>
      )}
    </PageContainer>
  );
}
