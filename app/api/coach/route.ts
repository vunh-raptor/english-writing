import { NextResponse } from "next/server";
import { runCoach } from "@/src/lib/server/coach";
import { aiConfigured, type ChatTurn } from "@/src/lib/server/ai";
import type { Phrase } from "@/src/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { phrases?: Phrase[]; messages?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const phrases = Array.isArray(body.phrases) ? body.phrases : [];
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (phrases.length === 0) {
    return NextResponse.json({ error: "No target phrases." }, { status: 400 });
  }
  try {
    const turn = await runCoach(phrases, messages);
    return NextResponse.json(turn);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed." },
      { status: 502 },
    );
  }
}
