import { describe, expect, it } from "vitest";
import { RUNG_ORDER, THINK_RUNGS, checkBorrowing, ideaText } from "../respond";

/**
 * The source these run against. Short on purpose: the borrowing check works on
 * 6-word windows, so a realistic paragraph is enough to prove the boundary.
 */
const SOURCE = `Remote work has quietly changed which cities people can afford to live in.
For a decade the rule was simple: move to the job. That rule has loosened, and the
second-order effects are only starting to show up in rents, schools and local politics.
The companies that handled it best did not simply allow remote work. They rewrote how
decisions get recorded, so that being in a room stopped being an advantage.`;

describe("the thinking ladder", () => {
  it("offers four rungs in Bloom order, understand → create", () => {
    expect(RUNG_ORDER).toEqual(["grasp", "assume", "push", "extend"]);
  });

  it("describes every rung, and describes only rungs", () => {
    // The rungs carry UI chrome — a label and why it is worth climbing — and
    // deliberately no question of their own. A generic ladder that could be
    // asked about any source is exactly what this mode exists to avoid, so the
    // questions are written against the learner's actual source every time.
    expect(Object.keys(THINK_RUNGS).sort()).toEqual([...RUNG_ORDER].sort());
    for (const rung of RUNG_ORDER) {
      expect(THINK_RUNGS[rung].label, rung).not.toBe("");
      expect(THINK_RUNGS[rung].why, rung).not.toBe("");
      expect(THINK_RUNGS[rung].why, rung).not.toContain("?");
    }
  });
});

describe("checkBorrowing — is the angle theirs, or the source restated?", () => {
  it("catches a straight lift", () => {
    const r = checkBorrowing(
      SOURCE,
      "The companies that handled it best did not simply allow remote work",
    );
    expect(r.own).toBe(false);
    expect(r.longest).toContain("handled it best");
  });

  it("still catches a lift padded with a few words of their own", () => {
    const r = checkBorrowing(
      SOURCE,
      "I think the companies that handled it best did not simply allow remote work here",
    );
    expect(r.own).toBe(false);
  });

  it("passes a genuine angle on the same subject", () => {
    const r = checkBorrowing(
      SOURCE,
      "Why my team in Da Nang still meets in person twice a week, and what we get from it",
    );
    expect(r.own).toBe(true);
    expect(r.ratio).toBe(0);
  });

  it("passes an angle that AGREES with the source in the learner's own words", () => {
    // Agreeing is fine and normal. Only borrowed *wording* is the failure —
    // the check measures phrasing, never opinion.
    const r = checkBorrowing(
      SOURCE,
      "Recording decisions is the real unlock — here is the template we use every Monday",
    );
    expect(r.own).toBe(true);
  });

  it("passes a short hook that is too small to measure", () => {
    expect(checkBorrowing(SOURCE, "What remote work did to my rent").own).toBe(true);
  });

  it("catches a short hook that is nonetheless copied verbatim", () => {
    const r = checkBorrowing(SOURCE, "move to the job");
    expect(r.own).toBe(false);
  });

  it("treats an empty candidate as theirs rather than crashing", () => {
    expect(checkBorrowing(SOURCE, "").own).toBe(true);
    expect(checkBorrowing("", "anything at all here").own).toBe(true);
  });

  it("ignores case and punctuation when comparing wording", () => {
    const r = checkBorrowing(
      SOURCE,
      "THE COMPANIES THAT HANDLED IT BEST, DID NOT SIMPLY ALLOW REMOTE WORK!",
    );
    expect(r.own).toBe(false);
  });
});

describe("ideaText", () => {
  it("joins the hook and its bullets — what the check actually reads", () => {
    expect(ideaText({ hook: "A hook", bullets: ["one", "two"] })).toBe("A hook one two");
  });

  it("skips empty bullets so unfilled slots do not distort the ratio", () => {
    expect(ideaText({ hook: "A hook", bullets: ["", "two", ""] })).toBe("A hook two");
  });
});
