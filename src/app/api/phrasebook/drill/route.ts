import { NextResponse } from "next/server";
import { drillRounds } from "@/lib/server/phrasebook";
import { aiConfigured } from "@/lib/server/ai";
import { contentDigest, remember } from "@/lib/server/db/generated";
import {
  aiUnavailable,
  badRequest,
  readJson,
  requestContext,
  unauthorized,
  upstreamFailed,
} from "@/lib/server/request";
import { DRILL_VERSION } from "@/lib/server/prompts/phrasebook";
import { todayKey } from "@/lib/shared/date";
import type { DrillRoundSetup, LexKind } from "@/types";

export const dynamic = "force-dynamic";

const KINDS = new Set<LexKind>(["word", "phrase", "idiom", "pattern", "collocation", "sentence"]);
const MAX_ITEMS = 8;

/**
 * One practice session's rounds. Remembered per (day, item set) so a reload
 * mid-session returns the same situations rather than a fresh set the learner
 * has to read from scratch.
 */
export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{ items?: unknown }>(req);
  if (!body) return badRequest("Invalid JSON.");

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      return {
        id: typeof o.id === "string" ? o.id.slice(0, 60) : "",
        text: typeof o.text === "string" ? o.text.trim().slice(0, 120) : "",
        meaning: typeof o.meaning === "string" ? o.meaning.slice(0, 200) : "",
        example: typeof o.example === "string" ? o.example.slice(0, 200) : undefined,
        kind: KINDS.has(o.kind as LexKind) ? (o.kind as LexKind) : undefined,
      };
    })
    .filter((p) => p.id && p.text)
    .slice(0, MAX_ITEMS);
  if (items.length === 0) return badRequest("Missing items.");

  try {
    const rounds = await remember<DrillRoundSetup[]>(
      ctx.db,
      ctx.userId,
      {
        kind: "drill_rounds",
        key: `${todayKey()}:${contentDigest(items.map((i) => i.id).join(","))}`,
        version: DRILL_VERSION,
      },
      () => drillRounds(ctx.snapshot, items),
    );
    return NextResponse.json({ rounds });
  } catch (e) {
    return upstreamFailed(e, "Couldn't build your practice rounds — try again.");
  }
}
