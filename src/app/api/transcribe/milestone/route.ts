import { NextResponse } from "next/server";
import { milestoneCheck } from "@/lib/server/transcribe";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

/** The two questions and two phrases that close a passage. */
export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; passage?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const passage = typeof body.passage === "string" ? body.passage.trim().slice(0, 6000) : "";
  if (!passage) {
    return NextResponse.json({ error: "Missing the passage." }, { status: 400 });
  }
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";

  try {
    return NextResponse.json(await milestoneCheck(level, passage));
  } catch (e) {
    // The client falls back to its local milestone — a passage is never blocked
    // by a provider outage.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Milestone unavailable." },
      { status: 502 },
    );
  }
}
