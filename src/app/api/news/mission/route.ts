import { NextResponse } from "next/server";
import { getDailyMission } from "@/lib/server/mission";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel } from "@/types";

// News Chat is inherently online: the mission is planned live from today's
// news. Planned once per (day, level) and cached in-process; reading the
// level query param makes this route dynamic.
export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

export async function GET(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "This mode needs a server AI key — it's inherently online." },
      { status: 503 },
    );
  }
  const raw = new URL(req.url).searchParams.get("level");
  const level: NewsLevel = LEVELS.includes(raw as NewsLevel) ? (raw as NewsLevel) : "B1";
  try {
    const mission = await getDailyMission(level);
    return NextResponse.json({ mission });
  } catch (e) {
    // Never fake a mission — say so honestly.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't plan today's mission — try again." },
      { status: 502 },
    );
  }
}
