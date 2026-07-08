"use client";

import type { ReactNode } from "react";
import { StoreProvider } from "@/store/StoreContext";
import { SessionFlowProvider } from "@/store/SessionFlowContext";

/**
 * Client provider stack mounted once at the root layout. `StoreProvider` owns
 * persisted on-device state (and gates rendering until it has hydrated from
 * localStorage); `SessionFlowProvider` holds the ephemeral write-session flow.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <SessionFlowProvider>{children}</SessionFlowProvider>
    </StoreProvider>
  );
}
