import { useMemo } from "react";
import { useStore } from "@/store/StoreContext";
import { summarize } from "@/lib/shared/stats";
import { srsSummary } from "@/lib/shared/srs";
import { SEED_PHRASES } from "@/lib/shared/phrases";
import { addDays, prettyDay, todayKey } from "@/lib/shared/date";
import type { DayKey } from "@/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageContainer } from "@/components/page-container";

const CAL_DAYS = 84; // ~12 weeks

function levelClass(words: number): string {
  if (words <= 0) return "bg-muted border-border";
  if (words <= 50) return "bg-brand/25 border-brand/25";
  if (words <= 150) return "bg-brand/55 border-brand/55";
  return "bg-brand border-brand";
}

function BigStat({
  value,
  label,
  accent,
}: {
  value: React.ReactNode;
  label: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <div
        className={cn(
          "font-serif text-3xl font-semibold",
          accent && "text-brand",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-sm text-muted-foreground">{label}</div>
    </Card>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
      {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
    </div>
  );
}

export function Progress() {
  const { store } = useStore();
  const { entries, vocab, profile, phraseSrs } = store;
  const today = todayKey();

  const phraseStats = useMemo(
    () => srsSummary(SEED_PHRASES.map((p) => p.id), phraseSrs, today),
    [phraseSrs, today],
  );

  const summary = useMemo(
    () => summarize(entries, vocab, today),
    [entries, vocab, today],
  );

  const wordsByDay = useMemo(() => {
    const m: Record<DayKey, number> = {};
    for (const e of entries) m[e.day] = (m[e.day] ?? 0) + e.words;
    return m;
  }, [entries]);

  const calendar = useMemo(() => {
    const start = addDays(today, -(CAL_DAYS - 1));
    return Array.from({ length: CAL_DAYS }, (_, i) => {
      const day = addDays(start, i);
      const words = wordsByDay[day] ?? 0;
      return { day, words };
    });
  }, [today, wordsByDay]);

  const sparkMax = Math.max(1, ...summary.recentLengths);

  if (entries.length === 0 && Object.keys(phraseSrs).length === 0) {
    return (
      <PageContainer width="narrow">
        <h1 className="text-2xl sm:text-3xl">Your progress</h1>
        <Card className="mt-5 p-6">
          <p className="text-muted-foreground">
            Nothing here yet — write your first session (or chat with the Coach)
            and this fills with real growth: words you&apos;ve used, your
            vocabulary, phrases you can produce, and your streak.
          </p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="wide">
      <h1 className="text-2xl sm:text-3xl">Your progress</h1>

      <SectionTitle title="Growth that's real" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BigStat value={summary.vocabulary} label="words in your vocabulary" />
        <BigStat value={`+${summary.newWordsThisWeek}`} label="new words this week" accent />
        <BigStat value={summary.totalWords.toLocaleString()} label="words written, all time" />
        <BigStat value={summary.avgSentenceLength} label="avg words per sentence" />
      </div>

      <SectionTitle
        title="Phrases"
        meta={`spaced practice · due today: ${phraseStats.dueToday}`}
      />
      <div className="grid grid-cols-2 gap-3">
        <BigStat value={phraseStats.mastered} label="phrases mastered" />
        <BigStat value={phraseStats.learning} label="learning now" accent />
      </div>

      <SectionTitle
        title="Streak"
        meta={`longest: ${profile.longestStreak} · freezes: ${profile.freezes}`}
      />
      <Card className="p-6">
        <div className="mb-4 flex items-baseline gap-2">
          <span className="font-serif text-3xl font-semibold">
            {profile.streak}
          </span>
          <span className="text-muted-foreground">day current streak 🔥</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {calendar.map((c) => (
            <div
              key={c.day}
              className={cn(
                "h-4 w-4 rounded-[4px] border",
                levelClass(c.words),
              )}
              title={`${prettyDay(c.day)} — ${c.words} word${c.words === 1 ? "" : "s"}`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          last 12 weeks · darker = more words
        </p>
      </Card>

      <SectionTitle
        title="Sessions"
        meta={`${summary.totalEntries} total · ${summary.totalMinutes} min written`}
      />
      <Card className="p-6">
        <Badge variant="eyebrow">Recent session length (words)</Badge>
        <div className="mt-3 flex h-[70px] items-end gap-1">
          {summary.recentLengths.map((w, i) => (
            <div
              key={i}
              className="min-w-[6px] flex-1 rounded-t bg-gradient-to-b from-brand to-[hsl(var(--brand)/0.65)]"
              style={{ height: `${Math.max(6, (w / sparkMax) * 100)}%` }}
              title={`${w} words`}
            />
          ))}
        </div>
      </Card>
    </PageContainer>
  );
}
