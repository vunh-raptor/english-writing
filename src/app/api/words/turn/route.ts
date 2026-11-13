import { NextResponse } from "next/server";
import { wordTurn } from "@/lib/server/words";
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

/** One turn of a word's conversation: the sentence they sent, judged. */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{
    word?: { word?: string; pos?: string; meaning?: string };
    said?: string;
    sentence?: string;
    misses?: number;
  }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const word = typeof body.word?.word === "string" ? body.word.word.trim().slice(0, 80) : "";
  const sentence = typeof body.sentence === "string" ? body.sentence.trim().slice(0, 600) : "";
  if (!word || !sentence) return badRequest("Missing word or sentence.");

  const pos = typeof body.word?.pos === "string" ? body.word.pos.slice(0, 20) : "";
  const meaning = typeof body.word?.meaning === "string" ? body.word.meaning.slice(0, 200) : "";
  const said = typeof body.said === "string" ? body.said.slice(0, 500) : "";
  const misses =
    typeof body.misses === "number" && Number.isFinite(body.misses)
      ? Math.max(0, Math.min(9, Math.floor(body.misses)))
      : 0;

  try {
    return NextResponse.json(
      await wordTurn(ctx.snapshot, { word, pos, meaning }, said, sentence, misses),
    );
  } catch (e) {
    // wordTurn already fails soft internally; this is the last-resort guard.
    return upstreamFailed(e, "Couldn't read that one — send it again.");
  }
}
