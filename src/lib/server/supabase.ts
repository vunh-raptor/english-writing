import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUrl, supabasePublishableKey } from "@/lib/shared/supabaseEnv";
import type { Database } from "./db/types";

/**
 * The Supabase entry points, server-only so the secret key never reaches the
 * bundle (docs/ARCHITECTURE.md). Env is read lazily inside each factory, so
 * importing this module never throws at build time while the Supabase phase is
 * only partially wired — a route calls a factory only when it needs the DB.
 * (Public URL + publishable key live in the shared, bundle-safe
 * `lib/shared/supabaseEnv`; the secret key is read only here.)
 *
 * Two clients, on purpose:
 *   supabaseAdmin()  — secret key, bypasses RLS. For trusted server paths that
 *                      already know whose data they touch and scope every query
 *                      by user_id in code (the data-access layer does).
 *   supabaseServer() — request-scoped, bound to the caller's auth cookies;
 *                      every query runs AS the signed-in user under RLS. Use
 *                      this once Supabase Auth is wired.
 */

export type Db = SupabaseClient<Database>;

/** The secret (service-role) key — read only on the server, never bundled. */
function secretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set (legacy SUPABASE_SERVICE_ROLE_KEY also accepted) — required for admin access; see .env.example.",
    );
  }
  return key;
}

/**
 * Full-access client. Never expose to the browser. Callers are responsible for
 * scoping by user_id; RLS is not a backstop here.
 */
export function supabaseAdmin(): Db {
  return createClient<Database>(supabaseUrl(), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Request-scoped client that reads/writes the caller's Supabase auth cookies,
 * so RLS applies as that user. Must be called within a request (it reads
 * `next/headers` cookies). Return type is inferred — `@supabase/ssr`'s
 * `createServerClient` resolves its own client generics, which also gives the
 * cookie callbacks their types.
 */
export function supabaseServer() {
  const store = cookies();
  return createServerClient<Database>(
    supabaseUrl(),
    supabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              store.set(name, value, options);
            }
          } catch {
            // Called from a Server Component where cookies are read-only —
            // safe to ignore when middleware is responsible for refreshing
            // the session cookie.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user's id, or null when there's no session. The seam the news
 * data-access layer waits on: once Auth lands, a route resolves the id here and
 * hands it to `db/news.ts`. Returns null (never throws) when Supabase env is
 * absent, so guest-first paths keep working.
 */
export async function getUserId(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabaseServer().auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
