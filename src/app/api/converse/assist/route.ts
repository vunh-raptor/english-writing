import { NextResponse } from "next/server";
import { assist } from "@/lib/server/newsChat";
import { aiConfigured } from "@/lib/server/ai";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Stall help fails soft — even without AI we hand back local starters so the
  // learner is never blocked.
  let body: { subject?: string; currentDemand?: string; partialText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const subject = (body.subject || "").trim();
  const currentDemand = (body.currentDemand || "").trim();
  const partialText = body.partialText || "";
  if (!aiConfigured()) {
    // Mirror the server-side local fallback shape without calling a provider.
    return NextResponse.json({
      simplerQuestion: "In one simple sentence — what do you think or feel about this?",
      options: [
        { angle: "feeling", starter: "I feel that" },
        { angle: "personal", starter: "In my country," },
        { angle: "example", starter: "For example," },
      ],
    });
  }
  try {
    const help = await assist(subject, currentDemand, partialText);
    return NextResponse.json(help);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI request failed." },
      { status: 502 },
    );
  }
}
