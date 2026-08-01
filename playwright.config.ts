import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a **production build** with **no env keys at all** — that is
 * deliberate. The daily-words loop is the one flow that must work offline, with
 * no AI provider and no Supabase, so the smoke suite proves exactly that: the
 * bundled curriculum, the local moments, the deterministic judging.
 * AI-dependent modes (News Chat, and Respond's tailored questions) are verified
 * by hand with the `verify` skill, not here: they depend on live third-party
 * responses and would make CI flaky.
 */

const PORT = Number(process.env.E2E_PORT ?? 3457);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // CI runs `playwright install chromium` and needs no override. Sandboxes
        // and dev boxes that already ship a Chromium can point at it instead of
        // downloading a second copy.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: {
    // `npm run e2e` builds first; this only serves. Never `next dev` — dev
    // compiles per route and turns first-visit waits into flaky timeouts.
    command: `npx next start --port ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
