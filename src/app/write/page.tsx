"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Write } from "@/components/Write";
import { useStore } from "@/store/StoreContext";
import { useSessionFlow } from "@/store/SessionFlowContext";

export default function WritePage() {
  const router = useRouter();
  const { store, finishSession } = useStore();
  const { writeSession, setActiveEntry } = useSessionFlow();

  // Guard: reaching /write without an armed session (e.g. a hard refresh or a
  // deep link) sends the writer back to pick a subject.
  useEffect(() => {
    if (!writeSession) router.replace("/");
  }, [writeSession, router]);

  if (!writeSession) return null;

  const { settings } = store;
  return (
    <Write
      session={writeSession}
      goalType={settings.goalType}
      goalValue={settings.goalValue}
      gentleNudge={settings.gentleNudge}
      aiOn={settings.ai.enabled}
      level={settings.difficulty}
      onFinish={(text, durationMs) => {
        const entry = finishSession({
          promptId: writeSession.promptId,
          promptText: writeSession.subject,
          text,
          durationMs,
        });
        setActiveEntry(entry);
        router.push("/celebrate");
      }}
      onExit={() => router.push("/")}
    />
  );
}
