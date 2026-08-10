import { NextResponse } from "next/server";
import { missionConverse, isMissionShaped, sanitizeMessages } from "@/lib/server/mission";
import { aiConfigured } from "@/lib/server/ai";
import {
  aiUnavailable,
  badRequest,
  readJson,
  requestContext,
  unauthorized,
  upstreamFailed,
} from "@/lib/server/request";
import type { MissionProgress } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiConfigured()) return aiUnavailable();
  const ctx = await requestContext();
  if (!ctx) return unauthorized();

  const body = await readJson<{
    mission?: unknown;
    progress?: Partial<MissionProgress>;
    messages?: unknown;
  }>(req);
  if (!body) return badRequest("Invalid JSON.");
  if (!isMissionShaped(body.mission)) return badRequest("Missing or malformed mission.");

  try {
    return NextResponse.json(
      await missionConverse(body.mission, body.progress, sanitizeMessages(body.messages)),
    );
  } catch (e) {
    return upstreamFailed(e, "AI request failed.");
  }
}
