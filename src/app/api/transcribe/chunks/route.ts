import { NextResponse } from "next/server";
import { fetchTranscript, parseVideoId } from "@/lib/server/transcribe";

export const dynamic = "force-dynamic";

/**
 * A pasted video link → its captions, as timed cues the client cuts into
 * chunks. No AI is involved, so this works with no provider key at all — same
 * posture as `/api/respond/source`.
 */
export async function POST(req: Request) {
  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw = typeof body.url === "string" ? body.url.slice(0, 400) : "";
  const videoId = parseVideoId(raw);
  if (!videoId) {
    return NextResponse.json({ error: "That doesn't look like a YouTube link." }, { status: 400 });
  }

  try {
    const { title, cues } = await fetchTranscript(videoId);
    return NextResponse.json({ videoId, title, cues });
  } catch (e) {
    // No captions is the common case and it is not a server fault — the UI
    // tells the learner to pick a curated clip instead.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That clip couldn't be cut." },
      { status: 502 },
    );
  }
}
