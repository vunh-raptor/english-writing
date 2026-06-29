import { NextResponse } from "next/server";
import { generatePrompts, type GenerateOptions } from "@/src/lib/server/aiTasks";
import { aiConfigured } from "@/src/lib/server/ai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: Partial<GenerateOptions>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.theme || !body.level || !body.count) {
    return NextResponse.json({ error: "Missing theme, level, or count." }, { status: 400 });
  }
  try {
    const prompts = await generatePrompts(body as GenerateOptions);
    return NextResponse.json({ prompts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed." },
      { status: 502 },
    );
  }
}
