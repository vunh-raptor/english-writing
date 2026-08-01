import { NextResponse } from "next/server";
import { sharpen } from "@/lib/server/respond";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

/** "Push me": one harder question about the answer they just gave. */
export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; question?: string; answer?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.slice(0, 400) : "";
  const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 1200) : "";
  if (!answer) return NextResponse.json({ error: "Missing answer." }, { status: 400 });
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";
  // sharpen() already fails soft to a generic push, so this can't 5xx.
  return NextResponse.json({ question: await sharpen(level, question, answer) });
}
