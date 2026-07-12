import { NextResponse } from "next/server";
import { recap } from "@/lib/server/newsChat";
import { aiConfigured, type ChatTurn } from "@/lib/server/ai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI is not configured on the server." }, { status: 503 });
  }
  let body: { subject?: string; messages?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const subject = (body.subject || "").trim();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  try {
    const result = await recap(subject, messages);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed." },
      { status: 502 },
    );
  }
}
