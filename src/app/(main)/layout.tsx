"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The primary tabs and the routes they map to. */
const TABS = [
  { href: "/", label: "Write" },
  { href: "/trending", label: "Trending" },
  { href: "/coach", label: "Coach" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
] as const;

/**
 * Chrome for the main tabbed screens: brand + nav. The writing surface and the
 * celebrate/feedback screens live outside this layout so they render without it.
 */
export default function MainLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar-inner">
          <Link className="brand" href="/">
            <span className="brand-dot" />
            Flowrite
          </Link>
          <nav className="nav">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={pathname === tab.href ? "active" : ""}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
