import { NextResponse } from "next/server";
import { enrichCapture } from "@/lib/server/phrasebook";
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

export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ text?: string; context?: string }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const text = typeof body.text === "string" ? body.text.trim().slice(0, 200) : "";
  if (!text) return badRequest("Missing text.");
  const context = typeof body.context === "string" ? body.context.slice(0, 240) : "";

  try {
    return NextResponse.json(await enrichCapture(ctx.snapshot, text, context));
  } catch (e) {
    // The client saves the raw highlight instead — capture never fails.
    return upstreamFailed(e, "Enrichment unavailable.");
  }
}
