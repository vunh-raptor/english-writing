import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  supabaseUrl,
  supabasePublishableKey,
  supabaseConfigured,
} from "@/lib/shared/supabaseEnv";
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
 *   supabaseAdmin()  — secret key, bypasses RLS. Stateless, so it's a memoized
 *                      singleton reused across warm invocations. For trusted
 *                      server paths that already know whose data they touch and
 *                      scope every query by user_id in code (the data-access
 *                      layer does) — RLS is not a backstop for it.
 *   supabaseServer() — request-scoped, bound to THIS request's auth cookies, so
 *                      every query runs AS the signed-in user under RLS. Built
 *                      fresh per call (never memoized) and used once Auth lands.
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

// Stateless (no per-request cookies), so one instance is safe to share and
// reuse across warm serverless invocations. Lazy so importing this module never
// throws before the secret key is configured; recreated on a cold start.
let adminClient: Db | null = null;

/**
 * Full-access client. Never expose to the browser. Callers are responsible for
 * scoping by user_id; RLS does not protect its queries.
 */
export function supabaseAdmin(): Db {
  if (!adminClient) {
    adminClient = createClient<Database>(supabaseUrl(), secretKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
}

/**
 * Request-scoped client that reads/writes the caller's Supabase auth cookies,
 * so RLS applies as that user. Must be called within a request (it reads
 * `next/headers` cookies), and must NOT be cached — each request has its own
 * cookies. Throws if Supabase env is absent; prefer `getUser()`/`getUserId()`
 * on guest-first paths, which fail soft.
 *
 * Return type is inferred — `@supabase/ssr`'s `createServerClient` resolves its
 * own client generics, which also gives the cookie callbacks their types.
 */
export function supabaseServer() {
  const store = cookies();
  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
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
  });
}

/**
 * The authenticated user, validated against the Auth server (not just decoded
 * from the cookie). Null for a guest, and — by design — null when Supabase
 * isn't configured or the Auth call fails, so guest-first paths never break on
 * it. The single place the news data-access layer's Auth seam resolves.
 */
export async function getUser(): Promise<User | null> {
  if (!supabaseConfigured()) return null;
  try {
    const { data, error } = await supabaseServer().auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
}

/** The signed-in user's id, or null when there's no (validated) session. */
export async function getUserId(): Promise<string | null> {
  return (await getUser())?.id ?? null;
}
