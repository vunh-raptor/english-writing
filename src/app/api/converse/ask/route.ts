import { NextResponse } from "next/server";
import { ask } from "@/lib/server/mission";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

/** "Ask · anything": a free translate / explain / rephrase aide for the margin. */
export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; context?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (!question) {
    return NextResponse.json({ error: "Missing question." }, { status: 400 });
  }
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";
  const context = typeof body.context === "string" ? body.context.slice(0, 800) : "";
  try {
    const help = await ask(level, context, question);
    return NextResponse.json(help);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ask help unavailable." },
      { status: 502 },
    );
  }
}
