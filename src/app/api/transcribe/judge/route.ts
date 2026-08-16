import { NextResponse } from "next/server";
import { judgeMilestone } from "@/lib/server/transcribe";
import { aiConfigured } from "@/lib/server/ai";
import {
  aiUnavailable,
  badRequest,
  readJson,
  requestContext,
  unauthorized,
  upstreamFailed,
} from "@/lib/server/request";
import type { MilestoneQuiz } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{
    quiz?: Partial<MilestoneQuiz>;
    answers?: unknown;
    sentence?: string;
  }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const questions = (Array.isArray(body.quiz?.questions) ? body.quiz!.questions : [])
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.slice(0, 300))
    .slice(0, 2);
  const phrases = (Array.isArray(body.quiz?.phrases) ? body.quiz!.phrases : [])
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.slice(0, 60))
    .slice(0, 2);
  const sentence = typeof body.sentence === "string" ? body.sentence.trim().slice(0, 600) : "";
  if (questions.length < 2 || phrases.length < 2 || !sentence) {
    return badRequest("Missing quiz or sentence.");
  }

  const answers = (Array.isArray(body.answers) ? body.answers : [])
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.slice(0, 600))
    .slice(0, 2);

  try {
    return NextResponse.json(
      await judgeMilestone(ctx.snapshot, { questions, phrases }, answers, sentence),
    );
  } catch (e) {
    return upstreamFailed(e, "Judgment unavailable.");
  }
}
