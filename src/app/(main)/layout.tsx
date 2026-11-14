"use client";

import type { ReactNode } from "react";
import { MobileTabBar, MobileTopBar, TopNav } from "@/components/app-nav";

/**
 * The shell for the main screens: one slim top bar, then the page.
 *
 * This replaced a persistent left sidebar. The product is a place to write,
 * and a 236px rail of chrome beside every writing surface made the page feel
 * like a dashboard; everything it held now lives in the top bar (nav, live
 * counts, the streak, recent work, the account), and the content below gets
 * the whole width of the window — white, centered by each page, like paper.
 * On phones: the same top bar, plus a bottom tab bar.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    // On large screens the window itself never scrolls: the bar stays put and
    // `main` is the scroll container with a definite height, which is the
    // contract the split-pane screens (News missions, Transcribe) build on.
    <div className="flex min-h-screen flex-col bg-background lg:h-screen lg:overflow-hidden">
      <TopNav />
      <MobileTopBar />
      <main className="flex-1 pb-20 lg:min-h-0 lg:overflow-y-auto lg:pb-0">{children}</main>
      <MobileTabBar />
    </div>
  );
}
