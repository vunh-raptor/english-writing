import { NextResponse } from "next/server";
import { sharpen } from "@/lib/server/respond";
import { aiConfigured } from "@/lib/server/ai";
import {
  aiUnavailable,
  badRequest,
  readJson,
  requestContext,
  unauthorized,
  upstreamFailed,
} from "@/lib/server/request";

export const dynamic = "force-dynamic";

/** "Push me": one harder question about the answer they just gave. */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ question?: string; answer?: string }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const question = typeof body.question === "string" ? body.question.slice(0, 400) : "";
  const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 1200) : "";
  if (!answer) return badRequest("Missing answer.");

  try {
    return NextResponse.json({ question: await sharpen(ctx.snapshot, question, answer) });
  } catch (e) {
    return upstreamFailed(e, "Couldn't sharpen that one — try again.");
  }
}
