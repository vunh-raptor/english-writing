import { NextResponse } from "next/server";
import { converse } from "@/lib/server/newsChat";
import { aiConfigured, type ChatTurn } from "@/lib/server/ai";
import type { NewsSubject, DirectorState } from "@/types";

export const dynamic = "force-dynamic";

const DEFAULT_STATE: DirectorState = {
  level: "B1",
  facetsCovered: [],
  wordsProduced: 0,
  turn: 0,
  stalls: 0,
};

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { subject?: NewsSubject; state?: DirectorState; messages?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const subject = body.subject;
  if (!subject || !subject.subject) {
    return NextResponse.json({ error: "Missing subject." }, { status: 400 });
  }
  const state: DirectorState = { ...DEFAULT_STATE, ...(body.state ?? {}) };
  const messages = Array.isArray(body.messages) ? body.messages : [];
  try {
    const turn = await converse(subject, state, messages);
    return NextResponse.json(turn);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed." },
      { status: 502 },
    );
  }
}
