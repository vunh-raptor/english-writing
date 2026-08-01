import { expect, test } from "@playwright/test";

/**
 * The core loop, guest-first and offline: land → today's set → meet → drill →
 * your own sentence. If this suite goes red, the product's one non-negotiable
 * path is broken.
 *
 * It runs against a production build with NO env keys, so `/api/words/daily`
 * 503s throughout and everything here is the local path: the bundled
 * curriculum, the local moments, the deterministic judging. That is the point —
 * the daily habit cannot depend on a provider key or on the network.
 */

/** The `meet` beat holds its card for a few seconds before "Got it" unlocks. */
const MEET_HOLD = 15_000;

test("the app is live and degrades honestly without AI keys", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
  // `ai` may be true or false depending on env — it just has to be reported.
  expect(body).toHaveProperty("ai");
});

test("the day starts at today's words", async ({ page }) => {
  await page.goto("/");
  // The store gates render on hydration — wait for real content, not `load`.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("new words a day");
  await expect(page.getByRole("button", { name: /Start today's words/ })).toBeVisible();
});

test("a guest can meet a word and use it, with no account and no keys", async ({ page }) => {
  await page.goto("/words");

  const start = page.getByRole("button", { name: /Start today's words/ });
  await expect(start).toBeVisible();

  // New words are masked until the session — the first look is worth more when
  // it isn't the fifth. The set card renders twice (mobile + desktop), so this
  // has to pick the one actually on screen at this viewport.
  await expect(page.getByText(/^·+$/).filter({ visible: true }).first()).toBeVisible();
  await start.click();

  // 1 — MEET. The card is held briefly so nobody skips the one encounter.
  await expect(page.getByText("meet it")).toBeVisible({ timeout: 30_000 });
  const card = page.locator("main div.bg-card").first();
  const word = (await card.locator(".font-serif").first().innerText()).trim();
  expect(word.length).toBeGreaterThan(1);

  const gotIt = page.getByRole("button", { name: /Got it/ });
  await expect(gotIt).toBeDisabled();
  await expect(gotIt).toBeEnabled({ timeout: MEET_HOLD });
  await gotIt.click();

  // 2 — DRILL. A brand-new word retrieves from its meaning, and the word
  // itself must be gone from the screen or it isn't retrieval.
  await expect(page.getByText("Which word means")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(new RegExp(`\\b${word}\\b`));

  await page.getByPlaceholder("type the word…").fill(word);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("That's the one")).toBeVisible();

  await page.getByRole("button", { name: /Use it in your own sentence/ }).click();

  // 3 — USE. With no AI key the moment comes from the local packs, and says so.
  await expect(page.getByText("The moment", { exact: false })).toBeVisible();
  await expect(page.getByText(/offline/i).first()).toBeVisible();

  const send = page.getByRole("button", { name: /^Send$/ });
  await expect(send).toBeDisabled(); // nothing written yet

  await page
    .locator("main textarea")
    .fill(`Last week I really had to ${word} about it, and I am glad I did in the end.`);
  await expect(send).toBeEnabled();
  await send.click();

  // Judged locally when the API is unavailable — a real production is never
  // erased just because there is no provider key.
  await expect(page.getByText(/Yours now/)).toBeVisible({ timeout: 20_000 });
});

test("peeking always works and is honest about what it costs", async ({ page }) => {
  await page.goto("/words");
  await page.getByRole("button", { name: /Start today's words/ }).click();
  const gotIt = page.getByRole("button", { name: /Got it/ });
  await expect(gotIt).toBeEnabled({ timeout: MEET_HOLD });
  await gotIt.click();

  await expect(page.getByText("Which word means")).toBeVisible();
  await page.getByRole("button", { name: /Show me/ }).click();

  await expect(page.getByText(/No cost — you'll see it again/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Use it in your own sentence/ })).toBeVisible();
});

test("the writing surfaces never switch on the inner critic", async ({ page }) => {
  // The whole design rests on this: no spellcheck, no autocorrect, no red
  // squiggles mid-flow. Re-enabling them is a product regression, not a
  // cosmetic one.
  await page.goto("/words");
  await page.getByRole("button", { name: /Start today's words/ }).click();
  const gotIt = page.getByRole("button", { name: /Got it/ });
  await expect(gotIt).toBeEnabled({ timeout: MEET_HOLD });
  await gotIt.click();

  const recall = page.getByPlaceholder("type the word…");
  await expect(recall).toHaveAttribute("spellcheck", "false");
  await expect(recall).toHaveAttribute("autocorrect", "off");
});

test("Respond takes a pasted source and asks rather than answers", async ({ page }) => {
  await page.goto("/respond");

  await page.locator("main textarea").first().fill(
    "Remote work has quietly changed which cities people can afford to live in. " +
      "For a decade the rule was simple: move to the job. That rule has loosened, and the " +
      "second-order effects are only starting to show up in rents, schools and local politics. " +
      "The companies that handled it best did not simply allow remote work.",
  );
  await page.getByRole("button", { name: /Start thinking/ }).click();

  // With no AI key the ladder is the local one — generic, but four real
  // questions in Bloom order, so the mode still runs end to end.
  await expect(page.getByText("Say it back")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("you think · we only ask")).toBeVisible();
  await expect(page.locator("main")).toContainText("?");
});

test("a source too short to think against is refused before any work starts", async ({ page }) => {
  await page.goto("/respond");
  await page.locator("main textarea").first().fill("too short to think against");
  await expect(page.getByRole("button", { name: /Start thinking/ })).toBeDisabled();
});
