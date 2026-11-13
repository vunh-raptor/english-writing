import { NextResponse } from "next/server";
import { MoveError, dayBridge, dayFinish, dayLeave, dayPeek, dayTurn } from "@/lib/server/wordDay";
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

const MOVES = new Set(["say", "peek", "leave", "bridge", "finish"]);

/**
 * One move in today's session. The server owns the session, so the body only
 * names the move — which word, and the sentence if there is one. How many
 * misses a line has had, what was asked, and the learner's level are all read
 * from what is stored, never from the request.
 */
export async function POST(req: Request) {
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ move?: string; wordId?: string; sentence?: string }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const move = typeof body.move === "string" && MOVES.has(body.move) ? body.move : "";
  if (!move) return badRequest("Unknown move.");
  const wordId = typeof body.wordId === "string" ? body.wordId.slice(0, 120) : "";
  const sentence = typeof body.sentence === "string" ? body.sentence.trim().slice(0, 600) : "";

  if ((move === "say" || move === "peek" || move === "leave") && !wordId) {
    return badRequest("Missing word.");
  }
  if ((move === "say" || move === "bridge") && !sentence) return badRequest("Missing sentence.");
  // Only a sentence in a conversation needs a model; the rest is bookkeeping.
  if (move === "say" && !aiConfigured()) return aiUnavailable();

  try {
    const day =
      move === "say"
        ? await dayTurn(ctx, wordId, sentence)
        : move === "peek"
          ? await dayPeek(ctx, wordId)
          : move === "leave"
            ? await dayLeave(ctx, wordId)
            : move === "bridge"
              ? await dayBridge(ctx, sentence)
              : await dayFinish(ctx);
    return NextResponse.json({ day });
  } catch (e) {
    if (e instanceof MoveError) return NextResponse.json({ error: e.message }, { status: 409 });
    return upstreamFailed(e, "Couldn't read that one — send it again.");
  }
}
