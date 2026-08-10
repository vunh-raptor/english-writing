import { NextResponse } from "next/server";
import { getDailyMission } from "@/lib/server/mission";
import { aiConfigured } from "@/lib/server/ai";
import { aiUnavailable, requestContext, unauthorized, upstreamFailed } from "@/lib/server/request";

// News Chat is inherently online: the mission is planned live from today's
// news, against this learner's own record, and remembered per account in
// `ai_content` — never shared between accounts, because the plan now carries
// their due items and the subjects they choose.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  try {
    const mission = await getDailyMission(ctx.db, ctx.userId, ctx.snapshot, ctx.snapshot.level);
    return NextResponse.json({ mission });
  } catch (e) {
    // Never fake a mission — say so honestly.
    return upstreamFailed(e, "Couldn't plan today's mission — try again.");
  }
}
