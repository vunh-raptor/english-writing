"use client";

import { useState } from "react";
import type { NewsSession } from "@/types";
import { useStore } from "@/store/StoreContext";
import { NewsDashboard } from "@/components/NewsDashboard";
import { NewsChat } from "@/components/NewsChat";

/**
 * The News module shell (Sidebar Redesign §6). The /news home is a dashboard;
 * "New chat" or resuming an unfinished conversation enters the chat, and the
 * chat's back control returns here. A `key` on the chat resets its state cleanly
 * between a fresh mission and a resumed one.
 */
type View = { mode: "dashboard" } | { mode: "chat"; resume?: NewsSession };

export function News() {
  const { store } = useStore();
  const [view, setView] = useState<View>({ mode: "dashboard" });

  if (view.mode === "chat") {
    return (
      <NewsChat
        key={view.resume?.id ?? "new"}
        resume={view.resume}
        onExit={() => setView({ mode: "dashboard" })}
      />
    );
  }

  return (
    <NewsDashboard
      sessions={store.newsSessions}
      onNewChat={() => setView({ mode: "chat" })}
      onResume={(s) => setView({ mode: "chat", resume: s })}
    />
  );
}
