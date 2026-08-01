import { expect, test } from "@playwright/test";

/**
 * The core loop, guest-first and offline: land → prompt → write → celebrate.
 * If this suite goes red, the product's one non-negotiable path is broken.
 */

test("the app is live and degrades honestly without AI keys", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.ok).toBe(true);
  // `ai` may be true or false depending on env — it just has to be reported.
  expect(body).toHaveProperty("ai");
});

test("a guest can write and reach the celebration without an account", async ({ page }) => {
  await page.goto("/");

  // The store gates render on hydration — wait for real content, not `load`.
  const start = page.getByRole("button", { name: "Start writing" });
  await expect(start).toBeVisible();

  // Never a blank page: a prompt is always offered, with no AI configured.
  await expect(page.getByText("Today's prompt").or(page.locator(".prompt-surface"))).toBeVisible();

  await start.click();

  const editor = page.locator("textarea.app-editor");
  await expect(editor).toBeVisible();

  const done = page.getByRole("button", { name: /I'm done/i });
  await expect(done).toBeDisabled(); // nothing written yet

  await editor.fill(
    "Today I walked to the market near my house and bought some fruit. " +
      "The seller smiled at me and I answered him in English without stopping to think.",
  );

  await expect(done).toBeEnabled();
  await done.click();

  await expect(page).toHaveURL(/\/celebrate/);
  await expect(page.getByText("words written")).toBeVisible();
});

test("the editor never switches on the inner critic", async ({ page }) => {
  // The whole design rests on this: no spellcheck, no autocorrect, no
  // red squiggles mid-flow. A UI change that re-enables them is a product
  // regression, not a cosmetic one.
  await page.goto("/");
  await page.getByRole("button", { name: "Start writing" }).click();

  const editor = page.locator("textarea.app-editor");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("spellcheck", "false");
  await expect(editor).toHaveAttribute("autocorrect", "off");
});

test("a hard refresh into /write sends the writer back to pick a prompt", async ({ page }) => {
  await page.goto("/write");
  await expect(page).toHaveURL(/\/$|\/\?/);
  await expect(page.getByRole("button", { name: "Start writing" })).toBeVisible();
});
