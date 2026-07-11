"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  MessageCircle,
  PenLine,
  Settings as SettingsIcon,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

/** The primary tabs, the routes they map to, and their sidebar icons. */
const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Write", icon: PenLine },
  { href: "/trending", label: "Trending", icon: TrendingUp },
  { href: "/coach", label: "Coach", icon: MessageCircle },
  { href: "/progress", label: "Progress", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="relative inline-block h-3 w-3 rounded-full bg-[radial-gradient(circle_at_30%_30%,hsl(var(--primary)),hsl(var(--primary)/0.68))] ring-4 ring-primary/15" />
      <span className="font-serif text-lg font-semibold tracking-tight text-foreground">
        Flowrite
      </span>
    </Link>
  );
}

/** Persistent left rail — desktop only. */
export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden h-full min-h-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-6">
        <Brand />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
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
              <Icon className="size-[18px] shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between border-t border-sidebar-border px-4 py-3">
        <span className="text-xs font-medium text-muted-foreground">
          Appearance
        </span>
        <ThemeToggle />
      </div>
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
              active ? "text-primary" : "text-muted-foreground",
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
