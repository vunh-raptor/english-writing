# The delivery cycle

How a change gets from an idea to `main` when Claude is doing the coding. The
short version lives in [`CLAUDE.md`](../CLAUDE.md); this is the reasoning, the
division of labour, and what to do when a stage fails.

The cycle exists to solve one problem: an agent can produce plausible code far
faster than a human can review it. So every stage below either **narrows what
gets built** or **produces evidence a human can check in seconds**.

```
  Frame ──▶ Plan ──▶ Build ──▶ Prove ──▶ Ship ──▶ Review ──▶ Merge
    │        │                   │                   │
  human    human               agent               human
  owns     approves            proves              decides
```

---

## 1. Frame — one sentence of learner-visible outcome

Before anything is written, the change is stated as what a learner will
experience:

> *"A writer who misses two days still sees their streak intact when they come
> back."*

Not "add freeze logic to the profile reducer". If the sentence can't be written,
the change isn't understood yet, and building it will produce something
plausible and wrong.

**Non-trivial work gets a spec first** — run **`/spec`**. It produces a short
document: the outcome, the surfaces touched, the non-negotiables in play, what
is explicitly out of scope, and how we will know it worked. Specs are cheap and
they are where disagreement surfaces while it is still free.

Skip the spec for: copy edits, dependency bumps, obvious bug fixes with a known
cause, and anything under ~20 lines that touches one file.

## 2. Plan — name the seam before writing code

Claude states the files it will touch and the seam it will cut, and flags any
non-negotiable the change comes near. The human approves or redirects.

This is the cheapest place to catch the two failure modes that matter:
**building in the wrong layer** (logic in a route handler instead of
`lib/server`; server code reachable from a component) and **scope drift** (a
"small fix" that quietly rewrites a store).

Plan mode is the tool for this — the plan is approved before any file changes.

## 3. Build — smallest change that fully does the job

- Match the surrounding code's idiom, naming, and comment density. This codebase
  comments *why*, especially where a choice is pedagogical rather than
  technical. Keep that.
- Prefer extending an existing module to adding a parallel one.
- Respect the `lib` split (`shared` pure · `client` browser · `server`
  server-only). It is what keeps keys out of the bundle.
- Don't widen scope mid-build. Notice something else broken? Note it in the PR;
  fix it in its own change.

## 4. Prove — evidence, not assertion

Run **`/checks`**, which is `npm run verify` (lint · typecheck · unit tests ·
build), plus `npm run e2e` when the core loop moved.

| Layer | Tool | What belongs here |
| --- | --- | --- |
| Pure logic | **Vitest** (`src/**/__tests__/*.test.ts`) | `lib/shared`: streak, SRS, stats, date. Fast, deterministic, no I/O. |
| Core loop | **Playwright** (`e2e/*.spec.ts`) | The guest daily-words path — meet → drill → their own sentence — offline, no keys. The product's one non-negotiable journey. |
| AI surfaces | **`verify` skill**, by hand | News Chat, Phrasebook, and the tailored halves of Daily Words and Respond — live third-party responses; automating them buys flakiness, not confidence. |

Two rules keep this honest:

- **A bug fix gets a test that fails before the fix.** Otherwise there is no
  evidence the bug is understood, only that it stopped reproducing.
- **A red gate is never "unrelated".** Either fix it or say plainly, in the PR,
  what is failing and why it is out of scope.

For AI-dependent work, paste the actual observed output (the API response, the
turn the model produced) into the PR. "I verified it" is not evidence; the
transcript is.

## 5. Ship — commit, push, PR

Run **`/ship`**. It runs the gate, commits, pushes to the session branch, and
opens a PR against `main` filled from
[`.github/pull_request_template.md`](../.github/pull_request_template.md).

- **Branch per session**: `claude/<topic>-<id>` (the branch the session was
  started on). Never commit to `main`.
- **Commits describe the outcome**, in the imperative, like the ones already in
  this repo: *"Phrasebook: handle raw, unenriched captures gracefully"*.
- **PRs are small enough to review in one sitting.** A PR that touches
  fifteen files needs a reason in its own description.

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) re-runs the whole
gate on neutral ground — lint, typecheck, unit tests, build, and the Playwright
smoke — because "passes on my machine" is exactly the claim an agent is worst at
evaluating about itself.

## 6. Review — what a human actually checks

CI covers correctness-in-the-small. The human review looks at the things CI
cannot:

1. **Does it serve the product goal?** Does this reduce anxiety and increase
   production, or just add a feature?
2. **Is it in the right layer?** Would this still be right after Supabase lands?
3. **Are the tests real?** A test that asserts the implementation back to itself
   passes forever and protects nothing.
4. **Did the docs move with the code?**

If a PR needs a paragraph of explanation to be reviewable, it is too big — split
it rather than explaining it.

## 7. Sync docs — the step that gets skipped

Run **`/docsync`**. Documentation in this repo is load-bearing: it is what the
next session reads before touching anything, so stale docs actively cause bad
changes.

| If you changed… | Update… |
| --- | --- |
| An API route's contract | `docs/ARCHITECTURE.md` (API surface table) |
| The database schema | a migration in `supabase/migrations/` + `supabase/README.md`, and the feature's own doc under "Data" |
| A News Chat contract | `docs/NEWS_CHAT_V2.md` |
| UI tokens, motifs, or rules | `docs/DESIGN_SYSTEM.md` |
| What actually ships today | `README.md` → **Status** |
| A rule future sessions must follow | `CLAUDE.md` |

---

## Working with Claude: what each side owns

| Claude owns | The human owns |
| --- | --- |
| Reading the codebase before proposing | Whether the change is worth making |
| Naming the seam and the files up front | Approving the plan |
| Writing the code and the tests | Judging whether tests are meaningful |
| Running the gate and reporting it **verbatim** | Merging |
| Saying plainly when something is blocked | Rotating any leaked credential |

**Reporting rule:** failures get reported with their output, skipped steps get
named as skipped, and finished-and-verified gets stated plainly. An agent that
rounds a partial result up to "done" is worse than no agent, because it spends
the reviewer's trust.

## When a stage fails

- **Gate red on your change** → fix it. It is the change.
- **Gate red on `main` too** → say so in the PR, note the failing check, and
  don't paper over it locally.
- **A non-negotiable is in the way** → stop and raise it. That is a product
  decision, not an implementation detail. Nobody is authorized to quietly turn
  spellcheck back on because it made a test easier.
- **The task is ambiguous** → do every part that isn't, then ask the one
  question that actually changes the work. Don't block the whole change on it.

## Cadence

| Rhythm | What happens |
| --- | --- |
| Per change | The 7 stages above |
| Per merge | Delete the branch; `README.md` **Status** reflects reality |
| Per phase (e.g. server-owned state) | A spec in `docs/`, then changes small enough to review in one sitting |
