"use client";

import { ArrowRight, Plus } from "lucide-react";
import type { NewsSession } from "@/types";
import { daysBetween, parseDayKey, todayKey } from "@/lib/shared/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/page-container";

/**
 * The /news home — a module dashboard (Sidebar Redesign §6a). Instead of
 * dropping the learner straight into a chat, it shows what they've done here:
 * a stats strip, a resume card for an unfinished chat, and the recent
 * conversations — then a clear "New chat" to begin today's mission.
 */

function compactDay(day: string): string {
  return parseDayKey(day)
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toUpperCase();
}

interface Stats {
  conversations: number;
  words: number;
  phrases: number;
  thisWeek: number;
}

function rollUp(sessions: NewsSession[]): Stats {
  const today = todayKey();
  let words = 0;
  let phrases = 0;
  let thisWeek = 0;
  for (const s of sessions) {
    words += s.wordsProduced;
    phrases += s.targetsProduced;
    if (daysBetween(s.day, today) <= 6 && daysBetween(s.day, today) >= 0) thisWeek += 1;
  }
  return { conversations: sessions.length, words, phrases, thisWeek };
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col">
      <span
        className={cn(
          "font-serif text-[26px] font-semibold leading-none",
          accent ? "text-gold" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/** One row of the recent-conversations list. Active chats resume on click. */
function RecentRow({ session, onResume }: { session: NewsSession; onResume: (s: NewsSession) => void }) {
  const active = session.status === "active";
  const status = session.goalHit
    ? "Goal met ✓"
    : `${session.targetsProduced}/${session.targetsTotal} phrases`;

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate font-serif text-[15px] font-medium text-foreground">
          {session.title}
        </div>
        <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
          {compactDay(session.day)} · {session.source} · {session.wordsProduced} w
        </div>
      </div>
      <span
        className={cn(
          "flex-none font-mono text-[10.5px] uppercase tracking-wide",
          active ? "text-brand" : session.goalHit ? "text-sage-ink" : "text-muted-foreground",
        )}
      >
        {active ? "Resume ↵" : status}
      </span>
    </>
  );

  if (active) {
    return (
      <button
        type="button"
        onClick={() => onResume(session)}
        className="flex w-full items-baseline gap-4 border-b border-border py-3 text-left transition-colors hover:bg-secondary/60"
      >
        {inner}
      </button>
    );
  }
  return <div className="flex items-baseline gap-4 border-b border-border py-3">{inner}</div>;
}

export function NewsDashboard({
  sessions,
  onNewChat,
  onResume,
}: {
  sessions: NewsSession[];
  onNewChat: () => void;
  onResume: (s: NewsSession) => void;
}) {
  const stats = rollUp(sessions);
  const active = sessions.find((s) => s.status === "active");
  const recent = sessions.slice(0, 8);

  return (
    <PageContainer width="wide">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="kicker">Practice · News chat</div>
          <h1 className="mt-1.5 text-[28px] tracking-tight">Talk about today&apos;s news.</h1>
        </div>
        <Button size="lg" onClick={onNewChat}>
          <Plus /> New chat
        </Button>
      </div>

      {/* Stats strip */}
      <div className="mt-7 flex flex-wrap items-baseline gap-x-10 gap-y-5 border-y border-input py-4">
        <Stat value={String(stats.conversations)} label="Conversations" />
        <Stat value={stats.words.toLocaleString()} label="Words" />
        <Stat value={String(stats.phrases)} label="Phrases used" accent />
        <Stat value={`${stats.thisWeek}/wk`} label="This week" />
      </div>

      {sessions.length === 0 ? (
        // Empty state — the first visit.
        <div className="mt-10 border border-border bg-card p-8 text-center">
          <div className="kicker">No conversations yet</div>
          <p className="mx-auto mt-3 max-w-md font-serif text-lg leading-snug text-muted-foreground">
            Each day, News Chat plans a short mission from a real headline and
            chats with you about it — you leave with three phrases you actually
            used.
          </p>
          <Button size="lg" className="mt-5" onClick={onNewChat}>
            <Plus /> Start your first chat
          </Button>
        </div>
      ) : (
        <>
          {/* Resume the unfinished chat */}
          {active && (
            <button
              type="button"
              onClick={() => onResume(active)}
              className="group mt-7 flex w-full items-end justify-between gap-4 border-l-2 border-gold bg-secondary/40 py-3 pl-4 pr-4 text-left transition-colors hover:bg-secondary"
            >
              <div className="min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-gold">
                  Continue where you left off
                </div>
                <div className="mt-1.5 truncate font-serif text-lg font-medium text-foreground">
                  {active.title}
                </div>
                <div className="mt-1 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  {compactDay(active.day)} · {active.wordsProduced} words ·{" "}
                  {active.targetsProduced}/{active.targetsTotal} phrases
                </div>
              </div>
              <span className="flex flex-none items-center gap-1 pb-1 font-mono text-[11px] uppercase tracking-wide text-brand">
                Resume <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          )}

          {/* Recent conversations */}
          <div className="mt-8">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                Recent conversations
              </span>
            </div>
            <div className="mt-1.5 flex flex-col">
              {recent.map((s) => (
                <RecentRow key={s.id} session={s} onResume={onResume} />
              ))}
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}
