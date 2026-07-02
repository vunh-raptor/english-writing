import { NextResponse } from "next/server";
import { generateSparks } from "@/src/lib/server/aiTasks";
import { aiConfigured } from "@/src/lib/server/ai";
import type { Difficulty } from "@/src/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ sparks: [] }, { status: 200 }); // silent no-op; local sparks carry
  }
  let body: { subject?: string; text?: string; level?: Difficulty };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const subject = (body.subject || "").trim();
  const text = body.text || "";
  const level = ([1, 2, 3] as Difficulty[]).includes(body.level as Difficulty)
    ? (body.level as Difficulty)
    : 1;
  if (!subject) {
    return NextResponse.json({ error: "Missing subject." }, { status: 400 });
  }
  try {
    const sparks = await generateSparks(subject, text, level);
    return NextResponse.json({ sparks });
  } catch {
    // Sparks are a nicety; never surface an error mid-flow.
    return NextResponse.json({ sparks: [] }, { status: 200 });
  }
}
