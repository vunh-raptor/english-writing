import { NextResponse } from "next/server";
import { bridge } from "@/lib/server/mission";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; currentDemand?: string; intent?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const intent = typeof body.intent === "string" ? body.intent.trim().slice(0, 500) : "";
  if (!intent) {
    return NextResponse.json({ error: "Missing intent." }, { status: 400 });
  }
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";
  const currentDemand =
    typeof body.currentDemand === "string" ? body.currentDemand.slice(0, 500) : "";
  try {
    const help = await bridge(level, currentDemand, intent);
    return NextResponse.json(help);
  } catch (e) {
    // The client falls back to the beat's pre-planned ladder — help never blocks.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bridge help unavailable." },
      { status: 502 },
    );
  }
}
