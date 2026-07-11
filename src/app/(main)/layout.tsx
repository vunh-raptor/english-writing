import type { ReactNode } from "react";
import { AppSidebar, MobileTabBar, MobileTopBar } from "@/components/app-nav";

/**
 * Desktop-first shell for the main tabbed screens. A persistent left sidebar
 * (brand + icon nav + theme toggle) replaces the old top bar on large screens;
 * on mobile the nav collapses to a slim top bar plus a fixed bottom tab bar.
 * The writing surface and post-session screens render outside this layout.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:h-screen lg:grid-cols-[264px_1fr] lg:overflow-hidden">
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
