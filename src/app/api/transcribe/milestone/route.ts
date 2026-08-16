import { NextResponse } from "next/server";
import { milestoneCheck } from "@/lib/server/transcribe";
import { aiConfigured } from "@/lib/server/ai";
import { contentDigest, remember } from "@/lib/server/db/generated";
import {
  aiUnavailable,
  badRequest,
  readJson,
  requestContext,
  unauthorized,
  upstreamFailed,
} from "@/lib/server/request";
import { MILESTONE_VERSION } from "@/lib/server/prompts/transcribe";
import type { MilestoneQuiz } from "@/types";

export const dynamic = "force-dynamic";

/** The two questions and two phrases that close a passage. */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ passage?: string }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const passage = typeof body.passage === "string" ? body.passage.trim().slice(0, 6000) : "";
  if (passage.length < 80) return badRequest("Missing passage.");

  try {
    const quiz = await remember<MilestoneQuiz>(
      ctx.db,
      ctx.userId,
      // Keyed by the passage itself, so re-opening a milestone asks the same
      // two questions rather than moving the goalposts mid-attempt.
      { kind: "milestone", key: contentDigest(passage), version: MILESTONE_VERSION },
      () => milestoneCheck(ctx.snapshot, passage),
    );
    return NextResponse.json(quiz);
  } catch (e) {
    return upstreamFailed(e, "Milestone unavailable.");
  }
}
