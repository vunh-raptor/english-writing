"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/client/supabase";
import { supabaseConfigured } from "@/lib/shared/supabaseEnv";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/app-nav";

/**
 * The way in. Two routes, both passwordless:
 *
 *   magic link — an email with a one-time link. Nothing to remember, nothing to
 *                reset, nothing for us to store badly.
 *   Google     — one tap for anyone who would rather not wait for an email.
 *
 * Deliberately not a password form. A password is one more thing to forget
 * before the first win, and this product's whole argument is about removing
 * friction from the moment before someone starts.
 */
export function SignIn() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get("error") ?? "");

  const next = params.get("next") ?? "/";
  const configured = supabaseConfigured();

  /** Where Supabase should send them back to once the link is followed. */
  function callbackUrl(): string {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !email.trim()) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await createSupabaseBrowser().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await createSupabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl() },
      });
      if (error) throw error;
      // On success the browser is already navigating to Google.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in isn't available right now.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <Brand className="text-[26px]" />
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Learn it today · Say it today
      </p>

      <h1 className="mt-8 font-serif text-[28px] font-medium leading-tight tracking-tight text-foreground">
        Sign in to pick up where you left off.
      </h1>
      <p className="mt-2 text-[15px] leading-normal text-muted-foreground">
        Your words, your streak and your phrasebook live with your account, so
        they follow you to whatever device you write on next.
      </p>

      {!configured ? (
        <p className="note note-warning mt-8">
          Sign-in isn&rsquo;t configured on this deployment yet — no Supabase
          project is connected. See <code className="font-mono">.env.example</code>.
        </p>
      ) : sent ? (
        <div className="mt-8 bg-card px-6 py-5">
          <div className="kicker">Check your email</div>
          <p className="mt-2 text-[15px] leading-normal text-foreground">
            A link is on its way to <strong className="font-semibold">{email}</strong>.
            Open it on this device and you&rsquo;ll be straight in.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-4 text-sm font-semibold text-brand hover:underline"
          >
            Use a different address
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={sendLink} className="mt-8">
            <label
              htmlFor="email"
              className="font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 w-full border-0 border-b-2 border-input bg-transparent py-2 text-base text-foreground outline-none transition-colors focus:border-primary placeholder:text-muted-foreground/60"
            />
            <Button type="submit" size="lg" className="mt-5 w-full" disabled={busy}>
              {busy ? "Sending…" : "Email me a link"}
            </Button>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="mt-6 w-full"
            onClick={withGoogle}
            disabled={busy}
          >
            Continue with Google
          </Button>
        </>
      )}

      {error && <p className="note note-warning mt-5">{error}</p>}
    </main>
  );
}
