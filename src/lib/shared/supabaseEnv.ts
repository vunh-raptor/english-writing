/**
 * Public Supabase connection config — safe in any bundle. The project URL and
 * the *publishable* key are designed to ship to the browser (Row-Level Security
 * is what protects data, not key secrecy). The secret/service-role key is NOT
 * here — it stays in the server-only module (src/lib/server/supabase.ts).
 *
 * Newer Supabase projects issue `publishable`/`secret` keys; older ones issue
 * `anon`/`service_role`. We read the new names first and fall back to the legacy
 * ones, so either key system works. References are static `process.env.NEXT_...`
 * accesses on purpose — that's what lets Next.js inline them into the client and
 * edge bundles (dynamic `process.env[x]` would come back undefined there).
 */

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set (see .env.example).");
  return url;
}

export function supabasePublishableKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set (legacy NEXT_PUBLIC_SUPABASE_ANON_KEY also accepted; see .env.example).",
    );
  }
  return key;
}

/** True when the public Supabase config is present — lets callers no-op cleanly. */
export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
