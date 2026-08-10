import { NextResponse } from "next/server";
import { judgeDrill } from "@/lib/server/phrasebook";
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

  const body = await readJson<{
    phrase?: { text?: string; meaning?: string };
    situation?: string;
    sentence?: string;
  }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const text = typeof body.phrase?.text === "string" ? body.phrase.text.trim().slice(0, 120) : "";
  const sentence = typeof body.sentence === "string" ? body.sentence.trim().slice(0, 600) : "";
  if (!text || !sentence) return badRequest("Missing phrase or sentence.");

  const meaning =
    typeof body.phrase?.meaning === "string" ? body.phrase.meaning.slice(0, 200) : "";
  const situation = typeof body.situation === "string" ? body.situation.slice(0, 400) : "";

  try {
    return NextResponse.json(
      await judgeDrill(ctx.snapshot, { text, meaning }, situation, sentence),
    );
  } catch (e) {
    // judgeDrill already fails soft internally; this is the last-resort guard.
    return upstreamFailed(e, "Judgment unavailable.");
  }
}
