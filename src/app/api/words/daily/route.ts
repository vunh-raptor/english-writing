import { NextResponse } from "next/server";
import { openDay, readDay } from "@/lib/server/wordDay";
import { aiConfigured } from "@/lib/server/ai";
import { aiUnavailable, requestContext, unauthorized, upstreamFailed } from "@/lib/server/request";

export const dynamic = "force-dynamic";

/**
 * Today's Daily Words session.
 *
 * GET looks without touching: the stored day, or `null` when it has not been
 * opened — so the dashboard can show real progress without ever generating
 * anything. POST opens it: resumes the stored day, or builds it once.
 */
export async function GET() {
  const ctx = await requestContext();
  if (!ctx) return unauthorized();
  try {
    return NextResponse.json({ day: await readDay(ctx) });
  } catch (e) {
    return upstreamFailed(e, "Couldn't load today's words.");
  }
}

export async function POST() {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();
  try {
    return NextResponse.json({ day: await openDay(ctx) });
  } catch (e) {
    return upstreamFailed(e, "Couldn't build today's words — try again.");
  }
}
