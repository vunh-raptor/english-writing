"use client";

import type { ReactNode } from "react";
import {
  AppSidebar,
  MobileTabBar,
  MobileTopBar,
  SidebarProvider,
  useSidebar,
} from "@/components/app-nav";
import { cn } from "@/lib/utils";

/**
 * Desktop-first shell for the main tabbed screens. A persistent left sidebar
 * (brand · grouped nav · Today panel · recent work · account) replaces the old
 * top bar on large screens and can collapse to a 72px icon rail; on mobile the
 * nav becomes a slim top bar plus a fixed bottom tab bar. The writing surface
 * and post-session screens render outside this layout.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <MainShell>{children}</MainShell>
    </SidebarProvider>
  );
}

function MainShell({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        "min-h-screen bg-background lg:grid lg:h-screen lg:overflow-hidden lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out",
        collapsed ? "lg:grid-cols-[72px_1fr]" : "lg:grid-cols-[236px_1fr]",
      )}
    >
      <AppSidebar />
      <div className="flex min-h-screen flex-col lg:h-full lg:min-h-0">
        <MobileTopBar />
        <main className="flex-1 pb-20 lg:min-h-0 lg:overflow-y-auto lg:pb-0">
          {children}
        </main>
        <MobileTabBar />
      </div>
    </div>
  );
}
