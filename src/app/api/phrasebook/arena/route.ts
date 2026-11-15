import { NextResponse } from "next/server";
import {
  ArenaMoveError,
  boutClock,
  boutFinish,
  boutLeave,
  boutPeek,
  boutSay,
  openBout,
  readBout,
  readMarks,
} from "@/lib/server/arena";
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

/**
 * The stored bout (or null) and every item's Native marks. Never generates, so
 * the library can call it freely.
 */
export async function GET() {
  const ctx = await requestContext();
  if (!ctx) return unauthorized();
  const [bout, marks] = await Promise.all([readBout(ctx), readMarks(ctx)]);
  return NextResponse.json({ bout, marks });
}

const MOVES = new Set(["open", "say", "peek", "clock", "leave", "finish"]);

/**
 * One move in the arena. The server owns the bout, so the body only names the
 * move, the station it was made on, and the sentence if there is one. Misses,
 * help level, the clock and the learner's level are all read from what is
 * stored, never from the request.
 */
export async function POST(req: Request) {
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ move?: string; index?: unknown; sentence?: string; ids?: unknown }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const move = typeof body.move === "string" && MOVES.has(body.move) ? body.move : "";
  if (!move) return badRequest("Unknown move.");
  const index = typeof body.index === "number" && Number.isInteger(body.index) ? body.index : -1;
  const sentence = typeof body.sentence === "string" ? body.sentence.trim().slice(0, 600) : "";
  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.slice(0, 120))
    .slice(0, 8);

  if (["say", "peek", "clock", "leave"].includes(move) && index < 0) return badRequest("Missing station.");
  if (move === "say" && !sentence) return badRequest("Missing sentence.");
  // Building a bout and judging a sentence need a model; the rest is bookkeeping.
  if ((move === "open" || move === "say") && !aiConfigured()) return aiUnavailable();

  try {
    const bout =
      move === "open"
        ? await openBout(ctx, ids)
        : move === "say"
          ? await boutSay(ctx, index, sentence)
          : move === "peek"
            ? await boutPeek(ctx, index)
            : move === "clock"
              ? await boutClock(ctx, index)
              : move === "leave"
                ? await boutLeave(ctx, index)
                : await boutFinish(ctx);
    return NextResponse.json({ bout });
  } catch (e) {
    if (e instanceof ArenaMoveError) return NextResponse.json({ error: e.message }, { status: 409 });
    return upstreamFailed(e, move === "open" ? "Couldn't set up the arena — try again." : "Couldn't read that one — send it again.");
  }
}
