import type { ReactNode } from "react";
import { Brand } from "@/components/app-nav";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Post-session screens (celebrate, feedback): the brand is shown but the tab nav
 * is hidden, keeping the moment focused — mirrors the old app's `showNav = false`.
 */
export default function SessionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center justify-between border-b border-border px-5 sm:px-6">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
