import { NextResponse } from "next/server";
import { polishDraft } from "@/lib/server/respond";
import { aiConfigured } from "@/lib/server/ai";
import {
  aiUnavailable,
  badRequest,
  readJson,
  requestContext,
  unauthorized,
  upstreamFailed,
} from "@/lib/server/request";
import type { SourceRef } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Encouragement-first feedback on the finished piece.
 *
 * This used to be ungated and unable to fail, because it fell back to a warm
 * local note. The note praised a word count it had computed rather than the
 * writing it never read, so it is gone: a failure is now a failure the learner
 * can retry, and their draft is already saved either way.
 */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{
    source?: Partial<SourceRef>;
    hook?: string;
    draft?: string;
  }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const draft = typeof body.draft === "string" ? body.draft.trim().slice(0, 4000) : "";
  if (!draft) return badRequest("Missing draft.");

  const source: SourceRef = {
    title: typeof body.source?.title === "string" ? body.source.title.slice(0, 160) : "Untitled",
    site: typeof body.source?.site === "string" ? body.source.site.slice(0, 60) : undefined,
    words: typeof body.source?.words === "number" ? body.source.words : 0,
  };
  const hook = typeof body.hook === "string" ? body.hook.slice(0, 240) : "";

  try {
    return NextResponse.json(await polishDraft(ctx.snapshot, source, hook, draft));
  } catch (e) {
    return upstreamFailed(e, "Couldn't read your piece just now — try again.");
  }
}
