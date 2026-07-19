import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseUrl, supabasePublishableKey } from "@/lib/shared/supabaseEnv";

/**
 * Refresh the Supabase auth session on each request and mirror the refreshed
 * cookies onto the response, so Server Components always read a current session
 * (the recommended `@supabase/ssr` middleware pattern).
 *
 * Deliberately defensive for this guest-first app:
 *   - if Supabase env is absent (not yet configured, or a guest-only deploy),
 *     it's a transparent pass-through — never a 500;
 *   - guests carry no auth cookie, so `getUser()` is a cheap no-op for them.
 *
 * Edge-safe: this module imports no `server-only` code and holds no secret (the
 * publishable key is public by design).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  let url: string;
  let key: string;
  try {
    url = supabaseUrl();
    key = supabasePublishableKey();
  } catch {
    return response; // Supabase not configured — leave the request untouched.
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

  // Touch the session so an expired access token is refreshed into the cookies.
  // Do not gate anything else on this — a network hiccup must not block the app.
  await supabase.auth.getUser();

  return response;
}
