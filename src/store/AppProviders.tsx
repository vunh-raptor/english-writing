"use client";

import type { ReactNode } from "react";
import { StoreProvider } from "@/store/StoreContext";

/**
 * Client provider stack mounted once at the root layout. `StoreProvider` owns
 * persisted on-device state and gates rendering until it has hydrated from
 * localStorage, so the first paint always matches the server's.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
