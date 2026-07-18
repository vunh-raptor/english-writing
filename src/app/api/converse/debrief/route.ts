import { NextResponse } from "next/server";
import { missionDebrief, isMissionShaped, sanitizeMessages } from "@/lib/server/mission";
import { aiConfigured } from "@/lib/server/ai";
import type { MissionProgress } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { mission?: unknown; progress?: Partial<MissionProgress>; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!isMissionShaped(body.mission)) {
    return NextResponse.json({ error: "Missing or malformed mission." }, { status: 400 });
  }
  try {
    const debrief = await missionDebrief(
      body.mission,
      body.progress,
      sanitizeMessages(body.messages),
    );
    return NextResponse.json(debrief);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed." },
      { status: 502 },
    );
  }
}
