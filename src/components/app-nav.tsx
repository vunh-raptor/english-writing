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

/** The wordmark: a small gradient mark and the name, heavy and tight. */
export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 font-extrabold tracking-tight text-foreground",
        className ?? "text-[19px]",
      )}
    >
      <span
        aria-hidden
        className="grid size-[1.35em] place-items-center rounded-[0.42em] bg-accent-gradient text-[0.7em] text-white shadow-glow"
      >
        F
      </span>
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
        "grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
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
      <div className="rounded-2xl bg-accent-gradient p-4 text-white shadow-glow">
        <div className="flex items-baseline justify-between">
          <span className="text-[28px] font-extrabold leading-none tabular-nums">
            {info.streak}
          </span>
          <span className="inline-flex gap-1" title={`${info.freezes} streak freezes`}>
            {Array.from({ length: MAX_FREEZES }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-2 rounded-full",
                  i < info.freezes ? "bg-white" : "bg-white/30",
                )}
              />
            ))}
          </span>
        </div>
        <div className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-white/80">
          Day streak
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${progress.pct}%` }} />
        </div>
        <div className="mt-1.5 text-[12px] font-medium text-white/85">
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
      <p className="kicker px-3 pb-1.5">Recent</p>
      <div className="flex flex-col gap-px">
        {recent.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="group flex items-baseline gap-2 rounded-xl px-3 py-1.5 leading-tight transition-colors hover:bg-sidebar-accent/70"
          >
            <span className="flex-none rounded-full bg-oxford-tint px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-brand">
              News
            </span>
            <span className="flex-1 truncate text-[13px] text-sidebar-foreground group-hover:text-foreground">
              {item.title}
            </span>
            <span className="flex-none text-[11px] tabular-nums text-muted-foreground">
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
    catalog: store.wordCatalog,
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
    <aside className="hidden h-full min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar/80 text-sidebar-foreground backdrop-blur-xl lg:flex">
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
        <p className="mt-1.5 text-[12px] font-medium text-muted-foreground">
          Learn it today · say it today
        </p>
        <RailToggle collapsed={false} onClick={onToggle} className="absolute right-3 top-3" />
      </div>

      <div className="flex-none px-4 pt-4">
        <Button asChild className="h-11 w-full text-[15px] font-semibold">
          <Link href="/words">Today&apos;s words</Link>
        </Button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="kicker px-3 pb-1.5">{group.label}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between rounded-xl px-3 py-2 text-[14.5px] font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                    )}
                  >
                    <span>{item.label}</span>
                    {count > 0 && (
                      <span className="ml-2 whitespace-nowrap rounded-full bg-primary/12 px-2 py-px text-[11.5px] font-semibold text-primary">
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

      <div className="flex flex-none items-center gap-2.5 border-t border-sidebar-border px-4 py-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-gradient text-sm font-bold text-white">
          {initialOf(name) || <User className="size-4" />}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium text-sidebar-foreground">
            {name || "Your workspace"}
          </div>
          <div className="text-[12px] text-muted-foreground">
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
        className="grid size-9 flex-none place-items-center rounded-xl bg-accent-gradient text-[15px] font-extrabold text-white shadow-glow"
      >
        F
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
                "relative flex w-[54px] flex-col items-center gap-1 rounded-2xl py-2 transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-[18px]", active && "text-primary")} />
              <span className="text-[9.5px] font-medium leading-none">{item.short}</span>
              {count > 0 && (
                <span className="absolute right-1 top-0.5 grid min-w-[16px] place-items-center rounded-full bg-primary px-1 text-[9.5px] font-bold leading-[16px] text-primary-foreground">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 flex flex-none flex-col items-center gap-2.5">
        {streak > 0 && (
          <div className="w-12 rounded-2xl bg-accent-gradient py-2 text-center leading-tight text-white">
            <div className="text-[16px] font-extrabold tabular-nums">{streak}</div>
            <div className="text-[8.5px] font-semibold uppercase tracking-wide text-white/80">
              Streak
            </div>
            <div className="mx-2 mt-1 h-[3px] overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${progress.pct}%` }} />
            </div>
          </div>
        )}
        <div
          title={name || "Your workspace"}
          className="grid size-9 place-items-center rounded-full bg-accent-gradient text-sm font-bold text-white"
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
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl lg:hidden">
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
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border/70 bg-background/80 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
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
