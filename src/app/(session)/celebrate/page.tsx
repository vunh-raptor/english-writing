"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Celebrate } from "@/components/Celebrate";
import { useSessionFlow } from "@/store/SessionFlowContext";

export default function CelebratePage() {
  const router = useRouter();
  const { activeEntry, clear } = useSessionFlow();

  useEffect(() => {
    if (!activeEntry) router.replace("/");
  }, [activeEntry, router]);

  if (!activeEntry) return null;

  return (
    <Celebrate
      entry={activeEntry}
      onFeedback={() => router.push("/feedback")}
      onDone={() => {
        clear();
        router.push("/");
      }}
    />
  );
}
