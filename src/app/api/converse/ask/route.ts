import { NextResponse } from "next/server";
import { ask } from "@/lib/server/mission";
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

/** "Ask · anything": a free translate / explain / rephrase aide for the margin. */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ context?: string; question?: string }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const question = typeof body.question === "string" ? body.question.trim().slice(0, 500) : "";
  if (!question) return badRequest("Missing question.");
  const context = typeof body.context === "string" ? body.context.slice(0, 800) : "";

  try {
    return NextResponse.json(await ask(ctx.snapshot, context, question));
  } catch (e) {
    return upstreamFailed(e, "Ask help unavailable.");
  }
}
