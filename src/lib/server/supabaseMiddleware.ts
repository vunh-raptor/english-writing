import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabasePublishableKey } from "@/lib/shared/supabaseEnv";

/**
 * Refresh the Supabase auth session on every request, mirror the refreshed
 * cookies onto the response, and turn away anyone who isn't signed in.
 *
 * This is the gate. The app used to be guest-first, with all durable state in
 * `localStorage`; it is now account-only, and this is the single place that is
 * enforced. Learning data lives in Postgres under RLS, so a request with no
 * session has nothing it could usefully read anyway — bouncing here just makes
 * that honest instead of returning a wall of empty screens.
 *
 * Edge-safe: imports no `server-only` code and holds no secret (the publishable
 * key is public by design).
 */

/** Paths reachable without a session. Everything else needs one. */
const PUBLIC_PATHS = ["/sign-in", "/auth/callback", "/auth/sign-out", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  let url: string;
  let key: string;
  try {
    url = supabaseUrl();
    key = supabasePublishableKey();
  } catch {
    // Supabase isn't configured on this deployment. Bouncing every request to a
    // sign-in page that cannot work would brick the app entirely, so pass
    // through and let /sign-in explain the missing configuration.
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Validates against the Auth server rather than trusting the cookie, and
  // refreshes an expired access token into the cookies as a side effect.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  if (user || isPublic(pathname)) return response;

  // An unauthenticated API call gets a 401, not a redirect to an HTML page —
  // `fetch` callers need a status they can branch on.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }

  // Remember where they were headed so the callback can put them back.
  const signIn = request.nextUrl.clone();
  signIn.pathname = "/sign-in";
  signIn.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(signIn);
}
