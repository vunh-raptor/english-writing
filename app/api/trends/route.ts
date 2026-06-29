import { NextResponse } from "next/server";
import { fetchTrends } from "@/src/lib/server/trends";

// Refresh at most every 30 minutes (edge cache); a Vercel Cron job will warm
// this in production.
export const revalidate = 1800;

export async function GET() {
  try {
    const customUrl = process.env.CUSTOM_TRENDS_URL || undefined;
    const trends = await fetchTrends({ customUrl });
    return NextResponse.json({ trends });
  } catch (e) {
    return NextResponse.json(
      { trends: [], error: e instanceof Error ? e.message : "failed to fetch trends" },
      { status: 502 },
    );
  }
}
