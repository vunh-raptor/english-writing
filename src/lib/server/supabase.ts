import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./db/types";

/**
 * The Supabase entry points, server-only so keys never reach the bundle
 * (docs/ARCHITECTURE.md). Env is read lazily inside each factory, so importing
 * this module never throws at build time while the Supabase phase is only
 * partially wired — a route calls a factory only when it actually needs the DB.
 *
 * Two clients, on purpose:
 *   supabaseAdmin()  — service role, bypasses RLS. For trusted server paths
 *                      that already know whose data they touch and scope every
 *                      query by user_id in code (the data-access layer does).
 *   supabaseServer() — request-scoped, bound to the caller's auth cookies;
 *                      every query runs AS the signed-in user under RLS. Use
 *                      this once Supabase Auth is wired.
 */

export type Db = SupabaseClient<Database>;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set — the Supabase phase needs it (see .env.example).`);
  }
  return value;
}

/**
 * Full-access client. Never expose to the browser. Callers are responsible for
 * scoping by user_id; RLS is not a backstop here.
 */
export function supabaseAdmin(): Db {
  return createClient<Database>(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
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
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
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
