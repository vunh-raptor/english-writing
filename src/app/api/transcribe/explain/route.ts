import { NextResponse } from "next/server";
import { explainSlips } from "@/lib/server/transcribe";
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

const MAX_MISSED = 20;

/** The pattern behind a chunk's slips. The score itself is computed on-device
 *  and passed in, so a failure here costs the explanation, never the score. */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{
    reference?: string;
    attempt?: string;
    missed?: unknown;
  }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 3000) : "";
  const attempt = typeof body.attempt === "string" ? body.attempt.trim().slice(0, 3000) : "";
  if (!reference || !attempt) return badRequest("Missing reference or attempt.");

  const missed = (Array.isArray(body.missed) ? body.missed : [])
    .filter((m): m is string => typeof m === "string")
    .map((m) => m.slice(0, 40))
    .slice(0, MAX_MISSED);

  try {
    return NextResponse.json(await explainSlips(ctx.snapshot, reference, attempt, missed));
  } catch (e) {
    return upstreamFailed(e, "Explanation unavailable.");
  }
}
