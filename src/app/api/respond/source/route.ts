import { NextResponse } from "next/server";
import { fetchArticle, fromPastedText, MAX_SOURCE_CHARS } from "@/lib/server/extract";

export const dynamic = "force-dynamic";

/**
 * Turn what the learner handed over into a readable source: either their
 * pasted text (always works, no network) or a link we fetch and extract
 * (docs/RESPOND.md). No AI here — this route is pure plumbing, so pasting
 * works with no provider key configured at all.
 */
export async function POST(req: Request) {
  let body: { text?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const text = typeof body.text === "string" ? body.text : "";

  if (url) {
    try {
      return NextResponse.json(await fetchArticle(url.slice(0, 2000)));
    } catch (e) {
      // Every failure here is expected and survivable — the learner pastes
      // instead — so the message is the one they should act on.
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "That link couldn't be read." },
        { status: 422 },
      );
    }
  }

  if (text.trim().length < 200) {
    return NextResponse.json(
      { error: "That's a bit short to think against — paste a few paragraphs." },
      { status: 400 },
    );
  }

  return NextResponse.json(fromPastedText(text.slice(0, MAX_SOURCE_CHARS * 2)));
}
