"use client";

import { useRouter } from "next/navigation";
import { Trending } from "@/components/Trending";
import { useSessionFlow } from "@/store/SessionFlowContext";

export default function TrendingPage() {
  const router = useRouter();
  const { beginScenario } = useSessionFlow();

  return (
    <Trending
      onStartScenario={(scenario) => {
        beginScenario(scenario);
        router.push("/write");
      }}
    />
  );
}
