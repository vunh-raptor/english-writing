"use client";

import { useRouter } from "next/navigation";
import { Home } from "@/components/Home";
import { useSessionFlow } from "@/store/SessionFlowContext";

export default function HomePage() {
  const router = useRouter();
  const { beginWriting } = useSessionFlow();

  return (
    <Home
      onStart={(prompt) => {
        beginWriting(prompt);
        router.push("/write");
      }}
    />
  );
}
