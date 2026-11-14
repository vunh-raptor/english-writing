"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookMarked,
  Flame,
  GraduationCap,
  Headphones,
  Newspaper,
  PenLine,
  Settings as SettingsIcon,
  User,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { NewsSession, Store } from "@/types";
import { parseDayKey, todayKey } from "@/lib/shared/date";
import { MAX_FREEZES, streakInfo, type StreakInfo } from "@/lib/shared/streak";
import { dueTodayCount } from "@/lib/shared/phrases";
import { buildDaySet } from "@/lib/shared/words";
import { useStore } from "@/store/StoreContext";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ---- nav model ------------------------------------------------------------

/** Which live count a nav item surfaces as a badge. */
type BadgeKind = "words" | "phrases" | "clips";

interface NavItem {
  href: string;
  /** Full label — the top bar and menus. */
  label: string;
  /** Compact label — the phone tab bar. */
  short: string;
  icon: LucideIcon;
  badge?: BadgeKind;
}

/** Primary nav, in reading order. The groups survive in the account menu. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Every day",
    items: [
      { href: "/words", label: "Daily words", short: "Words", icon: GraduationCap, badge: "words" },
      { href: "/news", label: "News chat", short: "News", icon: Newspaper },
      { href: "/respond", label: "Respond", short: "Respond", icon: PenLine },
      { href: "/transcribe", label: "Transcribe", short: "Hear", icon: Headphones, badge: "clips" },
    ],
  },
  {
    label: "Your language",
    items: [
      { href: "/phrasebook", label: "Phrasebook", short: "Phrases", icon: BookMarked, badge: "phrases" },
      { href: "/settings", label: "Settings", short: "Settings", icon: SettingsIcon },
    ],
  },
];

/** Flattened nav — the top bar and the phone tab bar. */
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, href: string): boolean {
  // "/" redirects to /words, so the words item owns the root too.
  if (href === "/words") return pathname === "/" || pathname.startsWith("/words");
  return pathname.startsWith(href);
}

// ---- derived display helpers ---------------------------------------------

interface TodayProgress {
  current: number;
  target: number;
  pct: number;
}

/** Progress through today's word set — the day's one goal. */
function todayProgress(done: number, total: number): TodayProgress {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return { current: done, target: total, pct };
}

/** The live counts the nav shows: what today still asks for, what the
 *  Phrasebook has ripe, and which clips are still half-heard. All derived,
 *  never stored. */
function navBadges(store: Store): Record<BadgeKind, number> {
  return {
    words: buildDaySet({
      catalog: store.wordCatalog,
      wordDays: store.wordDays,
      pool: store.minedPhrases,
      srs: store.phraseSrs,
      level: store.newsLevel,
      perDay: store.settings.wordsPerDay,
    }).remaining,
    phrases: dueTodayCount(store.phraseSrs, store.minedPhrases),
    clips: store.transcribeSessions.filter((s) => s.status === "active").length,
  };
}

/** What a badge's number is counting, in the expanded rail. */
const BADGE_NOUN: Record<BadgeKind, (n: number) => string> = {
  words: () => "today",
  phrases: () => "due",
  clips: (n) => (n === 1 ? "clip" : "clips"),
};

function initialOf(name: string): string {
  const n = name.trim();
  return n ? n[0].toUpperCase() : "";
}

// ---- recent conversations -------------------------------------------------

interface RecentItem {
  key: string;
  title: string;
  day: string;
  createdAt: number;
  /** Where clicking jumps — back into that conversation's mode. */
  href: string;
}

/** The last few News Chat conversations, newest first. */
function recentItems(sessions: NewsSession[], limit: number): RecentItem[] {
  return sessions
    .map((s) => ({
      key: `n-${s.id}`,
      title: s.title,
      day: s.day,
      createdAt: s.createdAt,
      href: "/news",
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

// ---- brand ----------------------------------------------------------------

/** The wordmark: a small accent mark and the name, quiet on a white page. */
export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 font-extrabold tracking-tight text-foreground",
        className ?? "text-[18px]",
      )}
    >
      <span
        aria-hidden
        className="grid size-[1.3em] place-items-center rounded-[0.4em] bg-accent-gradient text-[0.68em] text-white"
      >
        F
      </span>
      Flowrite
    </Link>
  );
}

// ---- the streak chip -------------------------------------------------------

/**
 * The day, in one glance: streak, and how far through today's words. It is a
 * link to /words because that is always the answer to "what now?".
 */
function StreakChip({ info, progress }: { info: StreakInfo; progress: TodayProgress }) {
  return (
    <Link
      href="/words"
      title={`${info.streak}-day streak · ${progress.current}/${progress.target} words today · ${info.freezes} of ${MAX_FREEZES} freezes in hand`}
      className="group flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-2.5 pr-3 transition-colors hover:border-primary/40"
    >
      <Flame className="size-4 text-gold" />
      <span className="text-[13.5px] font-bold tabular-nums text-foreground">{info.streak}</span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress.pct}%` }}
        />
      </span>
      <span className="text-[12px] font-medium tabular-nums text-muted-foreground">
        {progress.current}/{progress.target}
      </span>
    </Link>
  );
}

/** The account corner: initial, name, recent conversations, theme. */
function AccountMenu({ name, recent }: { name: string; recent: RecentItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={name || "Your workspace"}
        className="grid size-8 place-items-center rounded-full bg-accent-gradient text-[13px] font-bold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {initialOf(name) || <User className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-semibold">
          {name || "Your workspace"}
        </DropdownMenuLabel>
        {recent.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="kicker font-normal">Recent</DropdownMenuLabel>
            {recent.map((item) => (
              <DropdownMenuItem key={item.key} asChild>
                <Link href={item.href} className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <span className="flex-none text-[11px] tabular-nums text-muted-foreground">
                    {parseDayKey(item.day).getDate()}
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- the top bar -----------------------------------------------------------

/**
 * The whole chrome of the app is this one slim line, so the page below it can
 * read like paper. It replaced a 236px sidebar: same functions — nav with live
 * counts, the streak and today's progress, recent conversations, theme, the
 * account — in a strip the height of its text.
 */
export function TopNav() {
  const pathname = usePathname();
  const { store } = useStore();

  const today = todayKey();
  const info = streakInfo(store.profile, today);
  const badges = navBadges(store);
  const day = buildDaySet({
    catalog: store.wordCatalog,
    wordDays: store.wordDays,
    pool: store.minedPhrases,
    srs: store.phraseSrs,
    level: store.newsLevel,
    perDay: store.settings.wordsPerDay,
    today,
  });
  const progress = todayProgress(day.done, day.todaysNew.length);
  const recent = recentItems(store.newsSessions, 4);
  const name = store.settings.name.trim();

  return (
    <header className="sticky top-0 z-30 hidden border-b border-border/70 bg-background/85 backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-6 px-6">
        <Brand />

        <nav className="flex min-w-0 flex-1 items-center justify-center gap-1">
          {NAV_ITEMS.filter((i) => i.href !== "/settings").map((item) => {
            const active = isActive(pathname, item.href);
            const count = item.badge ? badges[item.badge] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[14px] font-medium transition-colors",
                  active
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.label}
                {count > 0 && (
                  <span className="rounded-full bg-primary/12 px-1.5 text-[11px] font-bold tabular-nums leading-[18px] text-primary">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-none items-center gap-2.5">
          <StreakChip info={info} progress={progress} />
          <ThemeToggle />
          <AccountMenu name={name} recent={recent} />
        </div>
      </div>
    </header>
  );
}

// ---- mobile ---------------------------------------------------------------

/** Slim brand bar — phones. The streak chip keeps the day in sight here too. */
export function MobileTopBar() {
  const { store } = useStore();
  const today = todayKey();
  const info = streakInfo(store.profile, today);
  const day = buildDaySet({
    catalog: store.wordCatalog,
    wordDays: store.wordDays,
    pool: store.minedPhrases,
    srs: store.phraseSrs,
    level: store.newsLevel,
    perDay: store.settings.wordsPerDay,
    today,
  });
  const progress = todayProgress(day.done, day.todaysNew.length);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur-xl lg:hidden">
      <Brand />
      <div className="flex items-center gap-2">
        <StreakChip info={info} progress={progress} />
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Fixed bottom tab bar — phones only. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { store } = useStore();
  const badges = navBadges(store);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border/70 bg-background/85 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const count = item.badge ? badges[item.badge] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "relative grid h-7 w-12 place-items-center rounded-full transition-colors",
                active && "bg-accent",
              )}
            >
              <Icon className="size-5" />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-1 grid min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[9px] font-bold leading-[16px] text-primary-foreground">
                  {count}
                </span>
              )}
            </span>
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
