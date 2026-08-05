import { NextResponse } from "next/server";
import { judgeMilestone } from "@/lib/server/transcribe";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

function strings(v: unknown, max: number, chars: number): string[] {
  return (Array.isArray(v) ? v : [])
    .map((s) => (typeof s === "string" ? s.trim().slice(0, chars) : ""))
    .slice(0, max);
}

/** Judge a milestone attempt: two answers plus one sentence of their own. */
export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; quiz?: unknown; answers?: unknown; sentence?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const q = (body.quiz ?? {}) as Record<string, unknown>;
  const quiz = {
    questions: strings(q.questions, 2, 300).filter(Boolean),
    phrases: strings(q.phrases, 2, 80).filter(Boolean),
  };
  const answers = strings(body.answers, 2, 600);
  const sentence = typeof body.sentence === "string" ? body.sentence.trim().slice(0, 600) : "";

  if (quiz.questions.length < 2 || quiz.phrases.length < 2 || !sentence) {
    return NextResponse.json({ error: "Missing the check or the sentence." }, { status: 400 });
  }
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";

  try {
    return NextResponse.json(await judgeMilestone(level, quiz, answers, sentence));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Judging unavailable." },
      { status: 502 },
    );
  }
}
