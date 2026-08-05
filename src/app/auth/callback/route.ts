import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Where a magic link and an OAuth redirect both land.
 *
 * Supabase sends the browser here with a one-time `code`; exchanging it sets the
 * session cookies on the response, which is why this has to be a route handler
 * and not a page — a Server Component cannot write cookies.
 *
 * Anything that goes wrong lands back on /sign-in with a readable reason rather
 * than a stack trace: an expired link is the single most common way this fails,
 * and it is not an error state worth alarming anyone about.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  /** Where the learner was heading before they were asked to sign in. */
  const next = searchParams.get("next") ?? "/";

  // Supabase reports its own failures in the query string (e.g. an expired or
  // already-used link) — surface that text rather than a generic message.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(providerError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent("That link is missing its code. Ask for a new one.")}`,
    );
  }

  const { error } = await supabaseServer().auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent("That link has expired. Ask for a new one.")}`,
    );
  }

  // Only ever redirect somewhere inside this app — an open redirect here would
  // hand a freshly-signed-in session to whatever host the query string named.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
