"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Entry, Prompt, Scenario, WriteSession } from "@/types";

/**
 * Ephemeral, cross-route flow state for a single writing session.
 *
 * `writeSession` and `activeEntry` are handed between screens (pick → write →
 * celebrate → feedback) but are *not* URL-addressable resources, so they live in
 * a client context rather than in route params. A hard refresh loses them by
 * design — each screen guards for their absence and redirects home.
 */
interface SessionFlowValue {
  writeSession: WriteSession | null;
  activeEntry: Entry | null;
  /** Turn a single prompt into a one-beat session and arm the write screen. */
  beginWriting(prompt: Prompt): void;
  /** Turn a sectioned scenario into a multi-beat session and arm the write screen. */
  beginScenario(scenario: Scenario): void;
  setActiveEntry(entry: Entry): void;
  /** Clear the flow once a session is fully done (back to a blank slate). */
  clear(): void;
}

const SessionFlowContext = createContext<SessionFlowValue | null>(null);

export function SessionFlowProvider({ children }: { children: ReactNode }) {
  const [writeSession, setWriteSession] = useState<WriteSession | null>(null);
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null);

  const beginWriting = useCallback((prompt: Prompt) => {
    setWriteSession({
      promptId: prompt.id,
      subject: prompt.text,
      beats: [{ id: prompt.id, prompt: prompt.text, starter: prompt.starter }],
    });
  }, []);

  const beginScenario = useCallback((scenario: Scenario) => {
    setWriteSession({
      promptId: scenario.id,
      subject: scenario.subject,
      platform: scenario.platform,
      beats: scenario.steps.map((step) => ({
        id: step.id,
        prompt: step.prompt,
        starter: step.starter,
        hint: step.hint,
      })),
    });
  }, []);

  const clear = useCallback(() => {
    setWriteSession(null);
    setActiveEntry(null);
  }, []);

  const value = useMemo(
    () => ({
      writeSession,
      activeEntry,
      beginWriting,
      beginScenario,
      setActiveEntry,
      clear,
    }),
    [writeSession, activeEntry, beginWriting, beginScenario, clear],
  );

  return (
    <SessionFlowContext.Provider value={value}>
      {children}
    </SessionFlowContext.Provider>
  );
}

export function useSessionFlow(): SessionFlowValue {
  const ctx = useContext(SessionFlowContext);
  if (!ctx) throw new Error("useSessionFlow must be used within SessionFlowProvider");
  return ctx;
}
