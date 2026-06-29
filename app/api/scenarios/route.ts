import { NextResponse } from "next/server";
import { generateScenario } from "@/src/lib/server/scenario";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { subject?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const subject = (body.subject || "").trim();
  if (!subject) {
    return NextResponse.json({ error: "Missing subject." }, { status: 400 });
  }
  // Always returns a scenario (AI when configured, local fallback otherwise).
  const scenario = await generateScenario(subject, body.platform);
  return NextResponse.json({ scenario });
}
