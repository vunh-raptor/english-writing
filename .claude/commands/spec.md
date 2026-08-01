---
description: Turn an idea into a short, reviewable spec before any code is written
argument-hint: [what you want to build]
---

Write a short spec for: **$ARGUMENTS**

First read what already exists — `README.md`, `CLAUDE.md`, and the relevant
`docs/` file — so the spec builds on this codebase instead of inventing a
parallel one. Do not write implementation code in this step.

Produce a spec with exactly these sections, and keep the whole thing under a
page:

**Outcome** — one sentence describing what a *learner* will experience.
If you cannot write this sentence, say so and ask; that is the signal the idea
isn't understood yet.

**Why it serves the goal** — how this maximizes production or reduces the
anxiety that makes people quit. If it does neither, say that plainly.

**Surfaces touched** — the specific files and layers (`lib/shared` /
`lib/client` / `lib/server` / route handlers / components), and the seam where
the change goes.

**Non-negotiables in play** — which rules from `CLAUDE.md` this comes near, and
how the design respects them. Flag any genuine tension instead of resolving it
silently.

**Out of scope** — what this deliberately does not do.

**How we'll know it worked** — the specific Vitest cases, the Playwright
assertion, or the manual `verify`-skill run that constitutes evidence.

**Open questions** — only ones whose answer would change the design. If there
are none, say none.

Then stop and wait for approval before implementing.
