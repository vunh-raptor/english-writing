import { NextResponse } from "next/server";
import { aiConfigured } from "@/src/lib/server/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    ai: aiConfigured(),
    time: new Date().toISOString(),
  });
}
