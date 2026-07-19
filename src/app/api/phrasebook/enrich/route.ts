import { NextResponse } from "next/server";
import { enrichCapture } from "@/lib/server/phrasebook";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; text?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 200) : "";
  if (!text) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";
  const context = typeof body.context === "string" ? body.context.slice(0, 240) : "";
  try {
    const enrichment = await enrichCapture(level, text, context);
    return NextResponse.json(enrichment);
  } catch (e) {
    // The client saves the raw highlight instead — capture never fails.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Enrichment unavailable." },
      { status: 502 },
    );
  }
}
