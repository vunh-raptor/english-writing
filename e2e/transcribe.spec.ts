import { expect, test, type Page } from "@playwright/test";
import { CLIPS } from "../src/lib/shared/clips";
import { cutIntoChunks, localMilestone, passageRange } from "../src/lib/shared/transcribe";

/**
 * Transcribe's gate, guest-first and offline: listen → write it down → the
 * score and the diff → say it back → the milestone.
 *
 * Like the daily-words suite, this runs against a production build with NO env
 * keys, so `/api/transcribe/*` 503s throughout and everything here is the local
 * path: the bundled clip and its transcript, deterministic scoring, and the
 * offline milestone. That is exactly the claim worth protecting — the mode's
 * whole design rests on the score being computed in code rather than by a
 * model, so it has to hold with no model available at all.
 *
 * The expected chunk text comes from the shared engine itself rather than a
 * copied string, so a change to chunking updates the fixture instead of
 * silently disagreeing with it.
 */

const CLIP = CLIPS[0];
const CHUNKS = cutIntoChunks(CLIP.cues);
const FIRST = CHUNKS[0].text;

/** The design's own worked example: three slips in forty-one words. */
const THREE_SLIPS = FIRST.replace("warms", "warm")
  .replace("algae", "algy")
  .replace("turns", "turn");

async function openFirstClip(page: Page) {
  await page.goto("/transcribe");
  await expect(page.getByRole("heading", { name: /Write what you hear/ })).toBeVisible();
  await page.getByRole("button", { name: "Start" }).first().click();
  await expect(page.getByRole("heading", { name: /Write down every word/ })).toBeVisible();
}

test("a guest can start a clip with no account, no keys and no network calls", async ({ page }) => {
  await openFirstClip(page);
  await expect(page.getByText(`Chunk 1 of ${CHUNKS.length} · Dictation`)).toBeVisible();
  await expect(page.getByText(/Passage 1 · chunks 1–/)).toBeVisible();
});

test("the writing surface never corrects mid-flow", async ({ page }) => {
  await openFirstClip(page);
  const surface = page.getByLabel("What you heard");
  // The product's first non-negotiable: no spellcheck, no autocorrect, no
  // grammar UI while somebody is producing.
  await expect(surface).toHaveAttribute("spellcheck", "false");
  await expect(surface).toHaveAttribute("autocorrect", "off");
});

test("scaffolds unlock language without ever finishing the line", async ({ page }) => {
  await openFirstClip(page);

  await page.getByRole("button", { name: "Peek at first letters" }).click();
  await expect(page.getByText(/counts as one miss/)).toBeVisible();

  // Every word reduced to an initial: enough shape to unstick, never enough to
  // transcribe from.
  const peek = await page.getByText(/^C r c l/).first().innerText();
  expect(peek).not.toContain("Coral");
  expect(peek.split(/\s+/).every((t) => t.replace(/[^A-Za-z]/g, "").length <= 1)).toBe(true);

  await page.getByRole("button", { name: "Reveal one word" }).click();
  await expect(page.getByText("One word", { exact: true })).toBeVisible();
});

test("the score is computed on-device, and the diff is ochre, never red", async ({ page }) => {
  await openFirstClip(page);
  await page.getByLabel("What you heard").fill(THREE_SLIPS);
  await page.getByRole("button", { name: "Check it" }).click();

  await expect(page.getByText("93%")).toBeVisible();
  await expect(page.getByText(/pass line 90%/)).toBeVisible();

  // Three substitutions: what they wrote struck, what was said in ochre.
  await expect(page.locator("b.annot-issue")).toHaveCount(3);
  await expect(page.locator("span.line-through")).toHaveCount(3);
  await expect(page.locator("b.annot-issue").first()).toHaveText("warms");

  // With no key the explanation is absent and the score still stands alone.
  await expect(page.getByText("Kept for tomorrow")).toHaveCount(0);
});

test("the diff hands back the learner's sentence, punctuation and all", async ({ page }) => {
  await openFirstClip(page);
  await page.getByLabel("What you heard").fill(THREE_SLIPS);
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("93%")).toBeVisible();

  const written = await page.locator("p", { has: page.locator("b.annot-issue") }).innerText();
  expect(written).toContain("ocean floor, yet");
  expect(written.trimEnd().endsWith("white.")).toBe(true);
});

test("below the pass line there is no way on but listening again", async ({ page }) => {
  await openFirstClip(page);
  await page.getByLabel("What you heard").fill("nothing like what she said");
  await page.getByRole("button", { name: "Check it" }).click();

  await expect(page.getByText(/word match/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Say it back/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Listen again" })).toBeVisible();
});

test("shadowing gates the chunk but scores nothing", async ({ page }) => {
  await openFirstClip(page);
  await page.getByLabel("What you heard").fill(FIRST);
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("100%")).toBeVisible();

  await page.getByRole("button", { name: /Say it back/ }).click();
  await expect(page.getByRole("heading", { name: /say it back, over her/ })).toBeVisible();

  // The gate is real...
  const unlock = page.getByRole("button", { name: /Unlock chunk 2/ });
  await expect(unlock).toBeDisabled();

  // ...but headless has no microphone, and the mode must not dead-end there.
  await page.getByRole("button", { name: "Record your take" }).click();
  await expect(page.getByText(/No microphone here/)).toBeVisible();
  await expect(unlock).toBeEnabled();

  await unlock.click();
  await expect(page.getByText(`Chunk 2 of ${CHUNKS.length} · Dictation`)).toBeVisible();
});

test("the milestone falls due at the end of a passage and holds the clip", async ({ page }) => {
  await openFirstClip(page);

  // Jump the ear to the last chunk of passage 1 — reaching it honestly would
  // mean nine round trips and prove nothing this doesn't.
  const { to } = passageRange(0, CHUNKS.length);
  await page.evaluate(
    ({ cursor }) => {
      const store = JSON.parse(window.localStorage.getItem("flowrite.v1") as string);
      const session = store.transcribeSessions[0];
      session.cursor = cursor;
      for (let i = 0; i < cursor; i++) {
        session.results[i] = {
          index: i,
          accuracy: 92,
          listens: 2,
          aided: false,
          shadowed: true,
          missed: ["algae"],
        };
      }
      window.localStorage.setItem("flowrite.v1", JSON.stringify(store));
    },
    { cursor: to },
  );

  await page.goto("/transcribe");
  await page.getByRole("button", { name: /Resume at/ }).click();
  await expect(page.getByText(`Chunk ${to + 1} of ${CHUNKS.length} · Dictation`)).toBeVisible();

  await page.getByLabel("What you heard").fill(CHUNKS[to].text);
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("100%")).toBeVisible();
  await page.getByRole("button", { name: /Say it back/ }).click();
  await page.getByRole("button", { name: "Record your take" }).click();
  await expect(page.getByText(/No microphone here/)).toBeVisible();
  await page.getByRole("button", { name: /To the milestone/ }).click();

  await expect(page.getByRole("heading", { name: /Show me what stayed/ })).toBeVisible();
  await expect(page.getByText(/Milestone 1 · locked/)).toBeVisible();

  // With no key, the offline milestone fills in rather than blocking the clip.
  const passage = CHUNKS.slice(0, to + 1)
    .map((c) => c.text)
    .join(" ");
  const quiz = localMilestone(passage);
  await expect(page.getByText("What you understood")).toBeVisible();
  for (const phrase of quiz.phrases) {
    await expect(page.getByText(phrase, { exact: true })).toBeVisible();
  }

  // It cannot be tapped past.
  const submit = page.getByRole("button", { name: /Unlock passage 2/ });
  await expect(submit).toBeDisabled();

  // A sentence missing one of the phrases must not pass, even with no judge.
  const answers = page.locator('input[placeholder="Two lines is plenty…"]');
  await answers.nth(0).fill("It is about coral losing the algae that feeds it.");
  await answers.nth(1).fill("That a bleached reef is starving rather than dead.");
  await page.getByLabel("Your sentence").fill(`My brother ${quiz.phrases[0]} about tax.`);
  await submit.click();
  await expect(page.getByText(/Both phrases need to turn up/)).toBeVisible();

  // Both present → the deterministic floor lets it through, and the passage
  // closes on the debrief.
  await page
    .getByLabel("Your sentence")
    .fill(`My brother ${quiz.phrases[0]}, and then he ${quiz.phrases[1]} out of nowhere.`);
  await submit.click();

  await expect(page.getByText("Passage 1 · debrief")).toBeVisible();
  await expect(page.getByText("chunks passed")).toBeVisible();
});

test("misheard words reach the shared Phrasebook pool", async ({ page }) => {
  await openFirstClip(page);
  await page.getByLabel("What you heard").fill(THREE_SLIPS);
  await page.getByRole("button", { name: "Check it" }).click();
  await expect(page.getByText("93%")).toBeVisible();
  await page.getByRole("button", { name: /Say it back/ }).click();
  await page.getByRole("button", { name: "Record your take" }).click();
  await expect(page.getByText(/No microphone here/)).toBeVisible();
  await page.getByRole("button", { name: /Unlock chunk 2/ }).click();
  await expect(page.getByText(`Chunk 2 of ${CHUNKS.length} · Dictation`)).toBeVisible();

  const pooled = await page.evaluate(() => {
    const store = JSON.parse(window.localStorage.getItem("flowrite.v1") as string);
    return store.minedPhrases
      .filter((p: { captured?: { module: string } }) => p.captured?.module === "Transcribe")
      .map((p: { text: string }) => p.text);
  });
  expect(pooled).toEqual(expect.arrayContaining(["warms", "algae", "turns"]));

  await page.goto("/phrasebook");
  await expect(page.getByText("Your commonplace book")).toBeVisible();
  await expect(page.getByText("algae", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  // And they read as misheard, not as something the learner highlighted.
  await expect(page.getByText(/misheard while transcribing/).first()).toBeVisible();
});
