import { NextResponse } from "next/server";
import { ensureClips, generateClip, loadClips } from "@/lib/server/listening";
import { aiConfigured } from "@/lib/server/ai";
import { aiUnavailable, requestContext, unauthorized, upstreamFailed } from "@/lib/server/request";

export const dynamic = "force-dynamic";

/**
 * The learner's listening library.
 *
 * GET returns what is stored, topping it up by one passage if it is short.
 * POST always writes a new one, which is the "give me another" button — a
 * learner who has heard enough about coral should not have to wait for the
 * library to run down before getting something else.
 */
export async function GET() {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  try {
    const clips = await ensureClips(ctx.db, ctx.userId, ctx.snapshot, ctx.snapshot.level);
    return NextResponse.json({ clips });
  } catch (e) {
    return upstreamFailed(e, "Couldn't write you a passage just now — try again.");
  }
}

export async function POST() {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  try {
    const existing = await loadClips(ctx.db, ctx.userId);
    const clip = await generateClip(
      ctx.db,
      ctx.userId,
      ctx.snapshot,
      ctx.snapshot.level,
      new Set(existing.map((c) => c.id)),
    );
    return NextResponse.json({ clips: [clip, ...existing] });
  } catch (e) {
    return upstreamFailed(e, "Couldn't write you a passage just now — try again.");
  }
}
