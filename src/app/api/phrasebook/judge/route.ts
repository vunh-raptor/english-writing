import { NextResponse } from "next/server";
import { judgeDrill } from "@/lib/server/phrasebook";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: {
    level?: string;
    phrase?: { text?: string; meaning?: string };
    situation?: string;
    sentence?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const text =
    typeof body.phrase?.text === "string" ? body.phrase.text.trim().slice(0, 120) : "";
  const sentence =
    typeof body.sentence === "string" ? body.sentence.trim().slice(0, 600) : "";
  if (!text || !sentence) {
    return NextResponse.json({ error: "Missing phrase or sentence." }, { status: 400 });
  }
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";
  const meaning =
    typeof body.phrase?.meaning === "string" ? body.phrase.meaning.slice(0, 200) : "";
  const situation =
    typeof body.situation === "string" ? body.situation.slice(0, 400) : "";
  try {
    const judgment = await judgeDrill(level, { text, meaning }, situation, sentence);
    return NextResponse.json(judgment);
  } catch (e) {
    // judgeDrill already fails soft internally; this is the last-resort guard.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Judging unavailable." },
      { status: 502 },
    );
  }
}
