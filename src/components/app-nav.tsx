"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  MessageCircle,
  Newspaper,
  PenLine,
  Settings as SettingsIcon,
  TrendingUp,
  User,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useStore } from "@/store/StoreContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

/** The primary tabs, the routes they map to, and their sidebar icons. */
const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Write", icon: PenLine },
  { href: "/trending", label: "Trending", icon: TrendingUp },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/progress", label: "Writing Stats", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 place-items-center rounded-md bg-brand text-brand-foreground">
        <PenLine className="size-3.5" />
      </span>
      <span className="font-serif text-lg font-semibold tracking-tight text-foreground">
        Flowrite
      </span>
    </Link>
  );
}

/** Pinned account row at the foot of the sidebar. */
function SidebarProfile() {
  const { store } = useStore();
  const name = store.settings.name.trim();
  const streak = store.profile.streak;
  const initial = name ? name[0].toUpperCase() : "";

  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-2.5">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-muted text-sm font-semibold text-brand-ink">
          {initial || <User className="size-4" />}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium text-sidebar-foreground">
            {name || "Your workspace"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {streak > 0 ? `🔥 ${streak}-day streak` : "New writer"}
          </div>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}

/** Persistent left rail — desktop only. */
export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden h-full min-h-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-5">
        <Brand />
      </div>

      <div className="px-3">
        <Button
          asChild
          className="h-11 w-full rounded-lg text-[15px] font-semibold"
        >
          <Link href="/">New Story</Link>
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Menu
        </p>
        <div className="space-y-0.5">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("size-[18px] shrink-0", active && "text-brand")}
                />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <SidebarProfile />
    </aside>
  );
}

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
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
              active ? "text-brand" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
