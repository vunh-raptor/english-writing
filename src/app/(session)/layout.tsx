"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Post-session screens (celebrate, feedback): the brand is shown but the tab nav
 * is hidden, keeping the moment focused — mirrors the old app's `showNav = false`.
 */
export default function SessionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link className="brand" href="/">
            <span className="brand-dot" />
            Flowrite
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
