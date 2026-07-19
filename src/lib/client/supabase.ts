import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabasePublishableKey } from "@/lib/shared/supabaseEnv";
import type { Database } from "@/lib/server/db/types";

/**
 * The browser Supabase client, for client components — auth UI (sign in / out),
 * realtime, and any client-side reads under RLS. Uses the public URL +
 * publishable key. Prefer server-side access (src/lib/server/db) where possible;
 * this exists for the interactive auth surface the guest-first flow will grow.
 *
 * (`db/types` is imported type-only — erased at build — so no server code or
 * secret reaches the browser bundle.)
 */
export function createSupabaseBrowser() {
  return createBrowserClient<Database>(supabaseUrl(), supabasePublishableKey());
}
