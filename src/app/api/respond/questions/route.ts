import { NextResponse } from "next/server";
import { thinkQuestions } from "@/lib/server/respond";
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

/** Four source-grounded questions climbing grasp → assume → push → extend. */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ source?: Partial<SourceRef>; text?: string }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const text = typeof body.text === "string" ? body.text.slice(0, 12_000) : "";
  if (text.trim().length < 100) return badRequest("Missing source text.");

  const source: SourceRef = {
    title: typeof body.source?.title === "string" ? body.source.title.slice(0, 160) : "Untitled",
    site: typeof body.source?.site === "string" ? body.source.site.slice(0, 60) : undefined,
    words: typeof body.source?.words === "number" ? body.source.words : 0,
  };

  try {
    return NextResponse.json({ questions: await thinkQuestions(ctx.snapshot, source, text) });
  } catch (e) {
    return upstreamFailed(e, "Questions unavailable.");
  }
}
