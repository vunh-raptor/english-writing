import { NextResponse } from "next/server";
import { polishDraft } from "@/lib/server/respond";
import type { NewsLevel, SourceRef } from "@/types";

export const dynamic = "force-dynamic";

const LEVELS: NewsLevel[] = ["A2", "B1", "B2", "C1"];

/** Encouragement-first feedback on the finished piece. polishDraft() fails
 *  soft internally, so a finished draft never ends on an error. */
export async function POST(req: Request) {
  let body: { level?: string; source?: Partial<SourceRef>; hook?: string; draft?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const draft = typeof body.draft === "string" ? body.draft.trim().slice(0, 4000) : "";
  if (!draft) return NextResponse.json({ error: "Missing draft." }, { status: 400 });

  const source: SourceRef = {
    title: typeof body.source?.title === "string" ? body.source.title.slice(0, 160) : "Untitled",
    site: typeof body.source?.site === "string" ? body.source.site.slice(0, 60) : undefined,
    words: typeof body.source?.words === "number" ? body.source.words : 0,
  };
  const level: NewsLevel = LEVELS.includes(body.level as NewsLevel)
    ? (body.level as NewsLevel)
    : "B1";
  const hook = typeof body.hook === "string" ? body.hook.slice(0, 240) : "";

  return NextResponse.json(await polishDraft(level, source, hook, draft));
}
