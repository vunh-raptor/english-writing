import { NextResponse } from "next/server";
import { bridge } from "@/lib/server/mission";
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

/** "Say it your way": their intent → keywords + a gapped frame. */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ currentDemand?: string; intent?: string }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const intent = typeof body.intent === "string" ? body.intent.trim().slice(0, 600) : "";
  if (!intent) return badRequest("Missing intent.");
  const currentDemand =
    typeof body.currentDemand === "string" ? body.currentDemand.slice(0, 400) : "";

  try {
    return NextResponse.json(await bridge(ctx.snapshot, currentDemand, intent));
  } catch (e) {
    return upstreamFailed(e, "Bridge help unavailable.");
  }
}
