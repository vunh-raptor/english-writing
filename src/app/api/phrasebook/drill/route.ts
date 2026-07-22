import { NextResponse } from "next/server";
import { drillRounds } from "@/lib/server/phrasebook";
import { aiConfigured } from "@/lib/server/ai";
import type { LexKind, NewsLevel } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];
const KINDS = new Set<LexKind>(["word", "phrase", "idiom", "pattern", "collocation", "sentence"]);
const MAX_ITEMS = 8;

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
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
  if (items.length === 0) {
    return NextResponse.json({ error: "Missing items." }, { status: 400 });
  }
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";
  try {
    const rounds = await drillRounds(level, items);
    return NextResponse.json({ rounds });
  } catch (e) {
    // The client falls back to its local situations — practice never blocks.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Drill unavailable." },
      { status: 502 },
    );
  }
}
