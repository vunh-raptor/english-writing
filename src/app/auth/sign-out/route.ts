import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Sign out. POST-only on purpose: a GET would let any page log somebody out
 * with an <img> tag, and a prefetch could do it by accident.
 */
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  await supabaseServer().auth.signOut();
  return NextResponse.redirect(`${origin}/sign-in`, { status: 303 });
}
