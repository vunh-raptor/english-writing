"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Feedback } from "@/components/Feedback";
import { useSessionFlow } from "@/store/SessionFlowContext";

export default function FeedbackPage() {
  const router = useRouter();
  const { activeEntry, clear } = useSessionFlow();

  useEffect(() => {
    if (!activeEntry) router.replace("/");
  }, [activeEntry, router]);

  if (!activeEntry) return null;

  return (
    <Feedback
      entry={activeEntry}
      onBack={() => {
        clear();
        router.push("/");
      }}
    />
  );
}
