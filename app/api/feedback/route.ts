import { NextResponse } from "next/server";
import { generateFeedback } from "@/src/lib/server/aiTasks";
import { aiConfigured } from "@/src/lib/server/ai";
import type { Entry } from "@/src/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { entry?: Entry };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const entry = body.entry;
  if (!entry || typeof entry.text !== "string") {
    return NextResponse.json({ error: "Missing entry." }, { status: 400 });
  }
  try {
    const feedback = await generateFeedback(entry);
    return NextResponse.json(feedback);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed." },
      { status: 502 },
    );
  }
}
