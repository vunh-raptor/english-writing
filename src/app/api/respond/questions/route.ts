import { NextResponse } from "next/server";
import { thinkQuestions } from "@/lib/server/respond";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel, SourceRef } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

/** Four source-grounded questions climbing grasp → assume → push → extend.
 *  A failure is survivable: the client runs the generic ladder instead. */
export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; source?: Partial<SourceRef>; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.slice(0, 12_000) : "";
  if (text.trim().length < 100) {
    return NextResponse.json({ error: "Missing source text." }, { status: 400 });
  }
  const source: SourceRef = {
    title: typeof body.source?.title === "string" ? body.source.title.slice(0, 160) : "Untitled",
    site: typeof body.source?.site === "string" ? body.source.site.slice(0, 60) : undefined,
    words: typeof body.source?.words === "number" ? body.source.words : 0,
  };
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";

  try {
    const questions = await thinkQuestions(level, source, text);
    return NextResponse.json({ questions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Questions unavailable." },
      { status: 502 },
    );
  }
}
