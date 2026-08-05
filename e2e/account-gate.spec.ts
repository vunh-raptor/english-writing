import { expect, test } from "@playwright/test";

/**
 * What can honestly be asserted about an account-only app with no Supabase
 * project attached.
 *
 * This suite replaced `daily-words.spec.ts` and `transcribe.spec.ts`. Those
 * proved the old core promise — that a guest could complete a whole session
 * offline, with no account and no keys — and that promise was deliberately
 * removed when durable state moved to Postgres. Their assertions are not
 * failing; they are no longer true, so keeping them would have been theatre.
 *
 * **This is a real loss of coverage.** The learner journeys are now
 * unverifiable in CI until a Supabase project (or a seeded local stack) is
 * available to sign into. Restoring them needs `supabase start` in CI plus a
 * fixture user, and is the single most valuable follow-up to this change.
 *
 * `playwright.config.ts` still runs a production build with NO env, so what is
 * exercised below is the unconfigured path: the app has to fail honestly rather
 * than pretend, and it must never silently fall back to writing on the device.
 */

test("the app is live and reports its configuration honestly", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body).toHaveProperty("ai");
});

test("state is refused without a session rather than served empty", async ({ request }) => {
  // 401, not 200-with-an-empty-store: an unauthenticated caller must be able to
  // tell "you are signed out" from "you have no work yet".
  const res = await request.get("/api/state");
  expect(res.status()).toBe(401);
  expect((await res.json()).error).toMatch(/sign in/i);
});

test("state cannot be written without a session", async ({ request }) => {
  const res = await request.post("/api/state", {
    data: { type: "setLevel", level: "C1" },
  });
  expect(res.status()).toBe(401);
});

test("an unknown action is rejected before it reaches the database", async ({ request }) => {
  const res = await request.post("/api/state", { data: { type: "dropEverything" } });
  // Still 401 here because auth is checked first — which is the correct order.
  expect([400, 401]).toContain(res.status());
});

test("sign-in explains itself when no Supabase project is attached", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: /Sign in to pick up/ })).toBeVisible();
  // Copy uses a curly apostrophe (isn&rsquo;t), so match either form.
  await expect(page.getByText(/isn.t configured on this deployment/)).toBeVisible();
});

test("sign-out is POST-only, so no link or prefetch can trigger it", async ({ request }) => {
  const res = await request.get("/auth/sign-out", { maxRedirects: 0 });
  expect(res.status()).toBe(405);
});

test("nothing durable is written to the device", async ({ page }) => {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");

  // The one non-negotiable this change introduced: no learner state on the
  // device, under any key.
  const stored = await page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
  }));
  expect(stored.local.filter((k) => k.startsWith("flowrite."))).toEqual([]);
  expect(stored.session.filter((k) => k.startsWith("flowrite."))).toEqual([]);
});
