"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookMarked,
  ChevronsLeft,
  ChevronsRight,
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
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

// ---- nav model ------------------------------------------------------------

/** Which live count a nav item surfaces as a badge. */
type BadgeKind = "words" | "phrases" | "clips";

interface NavItem {
  href: string;
  /** Full label, used in the expanded rail + mobile bar. */
  label: string;
  /** Compact label, used in the collapsed icon rail. */
  short: string;
  icon: LucideIcon;
  badge?: BadgeKind;
}

/** Grouped primary nav — the expanded rail reads as sectioned prose. */
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

/** Flattened nav — for the collapsed rail and the mobile tab bar. */
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, href: string): boolean {
  // "/" redirects to /words, so the words item owns the root too.
  if (href === "/words") return pathname === "/" || pathname.startsWith("/words");
  return pathname.startsWith(href);
}

// ---- collapse state -------------------------------------------------------

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

/**
 * Holds whether the desktop rail is collapsed to the 72px icon strip.
 *
 * Session-only, in memory. Nothing about a learner is written to the device any
 * more — not even a layout preference — so the rail opens expanded on each
 * visit rather than leaving a trace in the browser.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => setCollapsed((prev) => !prev), []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
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

/** The wordmark itself is the mark — Newsreader, Oxford, no drawn logo. */
export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "font-serif font-semibold tracking-tight text-brand",
        className ?? "text-[19px]",
      )}
    >
      Flowrite
    </Link>
  );
}

// ---- shared pieces --------------------------------------------------------

/** A small square affordance — the collapse/expand trigger. */
function RailToggle({
  collapsed,
  onClick,
  className,
}: {
  collapsed: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-expanded={!collapsed}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className={cn(
        "grid size-7 place-items-center border border-sidebar-border text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
        className,
      )}
    >
      {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
    </button>
  );
}

/** The "Today" streak + day-set panel (expanded rail only). */
function TodayPanel({ info, progress }: { info: StreakInfo; progress: TodayProgress }) {
  return (
    <div>
      <p className="px-2.5 pb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Today
      </p>
      <div className="border border-sidebar-border bg-foreground/[0.04] p-3">
        <div className="flex items-baseline justify-between">
          <span className="font-serif text-2xl font-semibold leading-none text-gold">
            {info.streak}
          </span>
          <span className="inline-flex gap-1" title={`${info.freezes} streak freezes`}>
            {Array.from({ length: MAX_FREEZES }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-2 border",
                  i < info.freezes ? "border-gold bg-gold/25" : "border-input bg-transparent",
                )}
              />
            ))}
          </span>
        </div>
        <div className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          Day streak
        </div>
        <div className="mt-2.5 h-1 bg-border">
          <div className="h-1 bg-gold" style={{ width: `${progress.pct}%` }} />
        </div>
        <div className="mt-1.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {progress.current}/{progress.target} words today
        </div>
      </div>
    </div>
  );
}

/**
 * Recent pieces across every module — a glimpse of the last things written,
 * each tagged with where it lives; clicking jumps back into that mode. Expanded
 * rail only (Sidebar Redesign §6b).
 */
function RecentList({ recent }: { recent: RecentItem[] }) {
  return (
    <div>
      <p className="px-2.5 pb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Recent
      </p>
      <div className="flex flex-col gap-px">
        {recent.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="group flex items-baseline gap-2 px-2.5 py-1 leading-tight transition-colors hover:bg-sidebar-accent/60"
          >
            <span className="flex-none bg-oxford-tint px-1 py-px font-mono text-[9px] font-medium uppercase tracking-wide text-brand">
              News
            </span>
            <span className="flex-1 truncate font-serif text-[13px] italic text-sidebar-foreground group-hover:text-foreground">
              {item.title}
            </span>
            <span className="flex-none font-mono text-[10px] tabular-nums text-muted-foreground">
              {parseDayKey(item.day).getDate()}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---- desktop rail ---------------------------------------------------------

/** Persistent left rail — desktop only. Collapses to a 72px icon strip. */
export function AppSidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { store } = useStore();
  const { settings, profile, phraseSrs, minedPhrases, newsSessions } = store;

  const today = todayKey();
  const info = streakInfo(profile, today);
  const badges = navBadges(store);
  const day = buildDaySet({
    wordDays: store.wordDays,
    pool: minedPhrases,
    srs: phraseSrs,
    level: store.newsLevel,
    perDay: settings.wordsPerDay,
    today,
  });
  const progress = todayProgress(day.done, day.todaysNew.length);
  const recent = recentItems(newsSessions, 4);
  const name = settings.name.trim();

  return (
    <aside className="hidden h-full min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[2px_0_8px_hsl(var(--shadow-color)/0.05)] lg:flex">
      {collapsed ? (
        <CollapsedRail
          pathname={pathname}
          onToggle={toggle}
          badges={badges}
          streak={info.streak}
          progress={progress}
          name={name}
        />
      ) : (
        <ExpandedRail
          pathname={pathname}
          onToggle={toggle}
          badges={badges}
          info={info}
          progress={progress}
          recent={recent}
          name={name}
        />
      )}
    </aside>
  );
}

function ExpandedRail({
  pathname,
  onToggle,
  badges,
  info,
  progress,
  recent,
  name,
}: {
  pathname: string;
  onToggle: () => void;
  badges: Record<BadgeKind, number>;
  info: StreakInfo;
  progress: TodayProgress;
  recent: RecentItem[];
  name: string;
}) {
  return (
    <>
      <div className="relative flex-none px-5 pt-5">
        <Brand className="text-[22px]" />
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Learn it today · Say it today
        </p>
        <RailToggle collapsed={false} onClick={onToggle} className="absolute right-3 top-3" />
      </div>

      <div className="flex-none px-4 pt-4">
        <Button asChild className="h-10 w-full text-[15px] font-semibold">
          <Link href="/words">Today&apos;s words</Link>
        </Button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
            <div className="flex flex-col gap-px">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between border-l-2 px-2.5 py-1.5 text-sm transition-colors",
                      active
                        ? "border-primary bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                        : "border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <span>{item.label}</span>
                    {count > 0 && (
                      <span className="ml-2 whitespace-nowrap bg-gold px-1.5 py-px font-mono text-[11px] font-medium text-gold-foreground">
                        {count} {BADGE_NOUN[item.badge!](count)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        <TodayPanel info={info} progress={progress} />
        {recent.length > 0 && <RecentList recent={recent} />}
      </nav>

      <div className="flex flex-none items-center gap-2.5 border-t border-sidebar-border bg-foreground/[0.02] px-4 py-3">
        <div className="grid size-8 shrink-0 place-items-center bg-brand font-serif text-sm font-semibold text-brand-foreground">
          {initialOf(name) || <User className="size-4" />}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium text-sidebar-foreground">
            {name || "Your workspace"}
          </div>
          <div className="font-mono text-[11.5px] text-muted-foreground">
            {info.streak > 0 ? `${info.streak}-day streak` : "New writer"}
          </div>
        </div>
        <ThemeToggle />
      </div>
    </>
  );
}

function CollapsedRail({
  pathname,
  onToggle,
  badges,
  streak,
  progress,
  name,
}: {
  pathname: string;
  onToggle: () => void;
  badges: Record<BadgeKind, number>;
  streak: number;
  progress: TodayProgress;
  name: string;
}) {
  return (
    <div className="flex h-full flex-col items-center py-4">
      <Link
        href="/"
        title="Flowrite"
        className="flex-none font-serif text-xl font-semibold text-sidebar-foreground"
      >
        F<span className="text-gold">.</span>
      </Link>

      <RailToggle collapsed onClick={onToggle} className="mt-3 flex-none" />

      <nav className="mt-4 flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const count = item.badge ? badges[item.badge] : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "relative flex w-[52px] flex-col items-center gap-1 border-l-2 py-1.5 transition-colors",
                active
                  ? "border-primary bg-sidebar-accent text-sidebar-accent-foreground"
                  : "border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-[18px]", active && "text-primary")} />
              <span className="text-[9.5px] font-medium leading-none">{item.short}</span>
              {count > 0 && (
                <span className="absolute right-1.5 top-1 grid min-w-[15px] place-items-center bg-gold px-1 font-mono text-[9px] leading-[15px] text-gold-foreground">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 flex flex-none flex-col items-center gap-2.5">
        {streak > 0 && (
          <div className="w-12 border border-sidebar-border bg-foreground/[0.04] py-1.5 text-center leading-tight">
            <div className="font-serif text-[15px] font-semibold text-gold">{streak}</div>
            <div className="font-mono text-[8px] uppercase tracking-wide text-muted-foreground">
              Streak
            </div>
            <div className="mx-1.5 mt-1 h-[3px] bg-border">
              <div className="h-[3px] bg-gold" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        )}
        <div
          title={name || "Your workspace"}
          className="grid size-8 place-items-center bg-brand font-serif text-sm font-semibold text-brand-foreground"
        >
          {initialOf(name) || <User className="size-4" />}
        </div>
      </div>
    </div>
  );
}

// ---- mobile ---------------------------------------------------------------

/** Slim brand + theme bar — mobile only. */
export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur lg:hidden">
      <Brand />
      <ThemeToggle />
    </header>
  );
}

/** Fixed bottom tab bar — mobile only. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { store } = useStore();
  const badges = navBadges(store);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
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
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
              active ? "text-brand" : "text-muted-foreground",
            )}
          >
            <span className="relative">
              <Icon className="size-5" />
              {count > 0 && (
                <span className="absolute -right-2 -top-1 grid min-w-[14px] place-items-center bg-gold px-0.5 font-mono text-[8.5px] leading-[14px] text-gold-foreground">
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
