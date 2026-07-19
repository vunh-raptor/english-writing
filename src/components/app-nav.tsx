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
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  MessageCircle,
  Newspaper,
  PenLine,
  Settings as SettingsIcon,
  SquarePen,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Entry, Settings } from "@/types";
import { parseDayKey, todayKey } from "@/lib/shared/date";
import { MAX_FREEZES, streakInfo, type StreakInfo } from "@/lib/shared/streak";
import { dueTodayCount } from "@/lib/shared/phrases";
import { useStore } from "@/store/StoreContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

// ---- nav model ------------------------------------------------------------

interface NavItem {
  href: string;
  /** Full label, used in the expanded rail + mobile bar. */
  label: string;
  /** Compact label, used in the collapsed icon rail. */
  short: string;
  icon: LucideIcon;
  /** A live count to surface as a badge (only the coach's due count for now). */
  badge?: "coach";
}

/** Grouped primary nav — the expanded rail reads as sectioned prose. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Write",
    items: [
      { href: "/", label: "Freewrite", short: "Write", icon: PenLine },
      { href: "/trending", label: "Trending", short: "Trends", icon: TrendingUp },
    ],
  },
  {
    label: "Practice",
    items: [
      { href: "/coach", label: "Phrase coach", short: "Coach", icon: MessageCircle, badge: "coach" },
      { href: "/news", label: "News chat", short: "News", icon: Newspaper },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/progress", label: "Writing stats", short: "Stats", icon: BarChart3 },
      { href: "/settings", label: "Settings", short: "Settings", icon: SettingsIcon },
    ],
  },
];

/** Flattened nav — for the collapsed rail and the mobile tab bar. */
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// ---- collapse state -------------------------------------------------------

const COLLAPSE_KEY = "flowrite.sidebar.collapsed";

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

/**
 * Holds whether the desktop rail is collapsed to the 72px icon strip, and
 * remembers the choice across visits. Mounted inside the store's hydration gate,
 * so reading localStorage on init is client-only and never mismatches SSR.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* private mode — skip persistence, the toggle still works this session */
      }
      return next;
    });
  }, []);

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
  unit: string;
  pct: number;
}

/** Progress toward today's goal — words written, or minutes spent. */
function todayProgress(entries: Entry[], settings: Settings, today: string): TodayProgress {
  const todays = entries.filter((e) => e.day === today);
  let current: number;
  let target: number;
  let unit: string;
  if (settings.goalType === "words") {
    current = todays.reduce((s, e) => s + e.words, 0);
    target = settings.goalValue;
    unit = "words";
  } else {
    current = Math.round(todays.reduce((s, e) => s + e.durationMs, 0) / 60_000);
    target = Math.max(1, Math.round(settings.goalValue / 60));
    unit = "min";
  }
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return { current, target, unit, pct };
}

function initialOf(name: string): string {
  const n = name.trim();
  return n ? n[0].toUpperCase() : "";
}

/** e.g. "Jul 18" — compact, no weekday, for the Recent list meta line. */
function compactDay(day: string): string {
  return parseDayKey(day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A short glimpse of a piece — its opening line, falling back to the prompt. */
function entryTitle(e: Entry): string {
  const firstLine = e.text.split("\n").map((l) => l.trim()).find(Boolean);
  const base = (firstLine || e.promptText || "Untitled").replace(/\s+/g, " ").trim();
  return base.length > 32 ? `${base.slice(0, 32).trimEnd()}…` : base;
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

/** The "Today" streak + goal panel (expanded rail only). */
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
          {progress.current}/{progress.target} {progress.unit}
        </div>
      </div>
    </div>
  );
}

/** Recent pieces — a glimpse of the last things written (expanded rail only). */
function RecentList({ recent }: { recent: Entry[] }) {
  return (
    <div>
      <p className="px-2.5 pb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        Recent
      </p>
      <div className="flex flex-col gap-0.5">
        {recent.map((e) => (
          <div key={e.id} className="px-2.5 py-1 leading-tight">
            <div className="truncate font-serif text-sm italic text-sidebar-foreground">
              {entryTitle(e)}
            </div>
            <div className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
              {compactDay(e.day)} · {e.words} words
            </div>
          </div>
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
  const { settings, profile, entries, phraseSrs, minedPhrases } = store;

  const today = todayKey();
  const info = streakInfo(profile, today);
  const due = dueTodayCount(phraseSrs, minedPhrases);
  const progress = todayProgress(entries, settings, today);
  const recent = [...entries].sort((a, b) => b.createdAt - a.createdAt).slice(0, 2);
  const name = settings.name.trim();

  return (
    <aside className="hidden h-full min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[2px_0_8px_hsl(var(--shadow-color)/0.05)] lg:flex">
      {collapsed ? (
        <CollapsedRail
          pathname={pathname}
          onToggle={toggle}
          due={due}
          streak={info.streak}
          progress={progress}
          name={name}
        />
      ) : (
        <ExpandedRail
          pathname={pathname}
          onToggle={toggle}
          due={due}
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
  due,
  info,
  progress,
  recent,
  name,
}: {
  pathname: string;
  onToggle: () => void;
  due: number;
  info: StreakInfo;
  progress: TodayProgress;
  recent: Entry[];
  name: string;
}) {
  return (
    <>
      <div className="relative flex-none px-5 pt-5">
        <Brand className="text-[22px]" />
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Write freely · Polish later
        </p>
        <RailToggle collapsed={false} onClick={onToggle} className="absolute right-3 top-3" />
      </div>

      <div className="flex-none px-4 pt-4">
        <Button asChild className="h-10 w-full text-[15px] font-semibold">
          <Link href="/">New story</Link>
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
                const count = item.badge === "coach" ? due : 0;
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
                        {count} due
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
  due,
  streak,
  progress,
  name,
}: {
  pathname: string;
  onToggle: () => void;
  due: number;
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

      <Link
        href="/"
        title="New story"
        className="mt-3 grid size-[42px] flex-none place-items-center bg-brand text-brand-foreground transition-colors hover:bg-oxford-deep"
      >
        <SquarePen className="size-[18px]" />
        <span className="sr-only">New story</span>
      </Link>

      <nav className="mt-4 flex flex-1 flex-col items-center gap-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const count = item.badge === "coach" ? due : 0;
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
  const due = dueTodayCount(store.phraseSrs, store.minedPhrases);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const count = item.badge === "coach" ? due : 0;
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
