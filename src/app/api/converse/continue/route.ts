import { NextResponse } from "next/server";
import { continueHelp } from "@/lib/server/mission";
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

/** "Next words": a stalled draft → next-word options + a continuation frame. */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ currentDemand?: string; draft?: string }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const draft = typeof body.draft === "string" ? body.draft.trim().slice(0, 600) : "";
  if (!draft) return badRequest("Missing draft.");
  const currentDemand =
    typeof body.currentDemand === "string" ? body.currentDemand.slice(0, 400) : "";

  try {
    return NextResponse.json(await continueHelp(ctx.snapshot, currentDemand, draft));
  } catch (e) {
    return upstreamFailed(e, "Next-word help unavailable.");
  }
}
