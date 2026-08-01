import { NextResponse } from "next/server";
import { wordRounds, type WordRoundInput } from "@/lib/server/words";
import { aiConfigured } from "@/lib/server/ai";
import type { NewsLevel, WordPos } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];
const POS = new Set<WordPos>(["verb", "noun", "adjective", "adverb"]);
const MAX_WORDS = 10;

/**
 * Build the "use it" round for each word in today's set — one call per session.
 * A 5xx here is expected and survivable: the client runs the day on its local
 * setups instead (docs/DAILY_WORDS.md, "fail-soft everywhere").
 */
export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { level?: string; words?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const words: WordRoundInput[] = (Array.isArray(body.words) ? body.words : [])
    .map((raw) => {
      const o = (raw ?? {}) as Record<string, unknown>;
      return {
        id: typeof o.id === "string" ? o.id.slice(0, 60) : "",
        word: typeof o.word === "string" ? o.word.trim().slice(0, 40) : "",
        pos: POS.has(o.pos as WordPos) ? (o.pos as WordPos) : ("verb" as WordPos),
        meaning: typeof o.meaning === "string" ? o.meaning.slice(0, 200) : "",
        collocations: Array.isArray(o.collocations)
          ? o.collocations
              .filter((c): c is string => typeof c === "string")
              .map((c) => c.slice(0, 60))
              .slice(0, 4)
          : [],
      };
    })
    .filter((w) => w.id && w.word)
    .slice(0, MAX_WORDS);

  if (words.length === 0) {
    return NextResponse.json({ error: "Missing words." }, { status: 400 });
  }

  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";

  try {
    const rounds = await wordRounds(level, words);
    return NextResponse.json({ rounds });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Rounds unavailable." },
      { status: 502 },
    );
  }
}
