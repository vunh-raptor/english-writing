import { NextResponse } from "next/server";
import { explainSlips } from "@/lib/server/transcribe";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];
const MAX_MISSED = 12;

/**
 * The pattern behind a chunk's slips. The score and the missed-word list are
 * computed on the client and passed in — this route only explains them, and a
 * failure costs an explanation, never a score.
 */
export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; reference?: unknown; attempt?: unknown; missed?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 2000) : "";
  const attempt = typeof body.attempt === "string" ? body.attempt.trim().slice(0, 2000) : "";
  const missed = (Array.isArray(body.missed) ? body.missed : [])
    .map((w) => (typeof w === "string" ? w.trim().slice(0, 40) : ""))
    .filter(Boolean)
    .slice(0, MAX_MISSED);

  if (!reference || !attempt) {
    return NextResponse.json({ error: "Missing the chunk or the attempt." }, { status: 400 });
  }
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";

  try {
    return NextResponse.json(await explainSlips(level, reference, attempt, missed));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Explanation unavailable." },
      { status: 502 },
    );
  }
}
