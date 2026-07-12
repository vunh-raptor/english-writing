import { NextResponse } from "next/server";
import { fetchNewsHeadlines } from "@/lib/server/news";
import { curateSubject } from "@/lib/server/newsChat";
import { aiConfigured } from "@/lib/server/ai";

// News Chat is inherently online: the subject is curated live from today's news.
// Cache the result at the edge for 30 min (a Vercel Cron can warm it).
export const revalidate = 1800;

export async function GET() {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "This mode needs a server AI key — it's inherently online." },
      { status: 503 },
    );
  }
  try {
    const headlines = await fetchNewsHeadlines();
    if (headlines.length === 0) {
      // Never fake a subject — say so honestly.
      return NextResponse.json(
        { error: "Couldn't reach today's news — try again." },
        { status: 502 },
      );
    }
    const subject = await curateSubject(headlines);
    return NextResponse.json({ subject });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't reach today's news — try again." },
      { status: 502 },
    );
  }
}
