# Flowrite — working agreement

Read this first, every session. It is the short list of things that are true
about this product and non-negotiable about how we change it. Everything else
lives in `docs/` and is linked from here.

## What this product is

A calm English-learning app for people who can read far more than they can
produce, built around one goal:

> **Maximize production, minimize the anxiety that makes people quit.**

Every change is judged against that sentence. A feature that adds friction,
correction, or judgement to the *producing* moment is wrong even if it is
well-built. Read `README.md` for the full product argument.

## Non-negotiables

Break these and the change is a regression, however green the tests are.

**Product**
- **No correction mid-flow.** Writing surfaces keep `spellCheck={false}`, no
  autocorrect, no grammar UI, no red squiggles. Feedback is opt-in and always
  *after* producing, and always leads with what went well.
- **Never a blank page.** Every entry point supplies the material to work from —
  a word card, a real-life moment, a question, a source. The learner is never
  asked to produce from nothing.
- **Nothing completes the learner's turn.** Hints unlock ideas or language,
  never a finished sentence: setups never contain the item they elicit, worked
  examples and outlines are inert, and Respond asks questions but never supplies
  a summary, an opinion or an angle. A session someone can finish without
  producing is a broken session.
- **Account-only, server-owned state.** Every durable thing a learner
  accumulates — streak, vocabulary, phrase library and its schedule, saved
  sessions — lives in Postgres under RLS and is reached through `/api/state`.
  **Nothing durable is written to the device**: no `localStorage`, no
  `sessionStorage`, not even a layout preference. A signed-out request gets a
  redirect (pages) or a 401 (API), never an empty store that looks like a new
  learner.

  > This replaced the previous **guest-first** rule, which said the core loop
  > had to work with no account and no network. That was a deliberate product
  > decision, not a drift — see `docs/ARCHITECTURE.md`. The cost is real and
  > should be weighed before anyone reverses it again: sign-up now precedes the
  > first win, which is exactly the friction the old rule existed to avoid.
- **Nothing is pre-written.** Every word a learner meets, every moment they
  write into, every listening passage is generated *for them* from what the
  database knows about them, and stored. There is no bundled curriculum, no
  canned situation, no generic ladder, no stand-in feedback. A surface that
  cannot get real material says so and offers a retry.

  > This replaced **"AI degrades, never breaks"**, which said the app fell back
  > to a bundled curriculum, local moments and deterministic judging when no
  > provider key was configured. That was a deliberate product decision, not
  > drift. The cost is real: **AI is now a hard dependency alongside Supabase**,
  > a provider outage is a session nobody can start, and the offline spine that
  > let Daily Words and Transcribe run on a train is gone. What it buys is a
  > curriculum that never repeats a word someone knows, never runs out, and is
  > pitched at the person rather than at a generic B1.
  >
  > What did *not* change: **code still rescues, and code still floors.** The
  > deterministic checks — production detection, the borrowing check, the
  > phrase-detection floor — are unaffected, because they judge rather than
  > invent. A one-line note attached to a verdict the code computed is not
  > preset content; a situation, a question or a celebration is.
- **Everything a learner produces is kept.** Sentences go to `productions` with
  the ask that drew them out and the verdict they earned, written the moment
  they are judged rather than at the end of a session that might be abandoned.
  That ledger is both the learner's record and the context every generation
  prompt reads.
- **Code can rescue a production, never invent one.** Where a model judges the
  learner's output, deterministic checks are unioned in so a lazy model can't
  erase real work — and where a model judges originality, the deterministic
  check is the floor the model may tighten but never loosen.

**Architecture** (details in `docs/ARCHITECTURE.md`)
- **The `lib` split is a hard boundary.** `lib/shared` is pure and isomorphic
  (no I/O, no keys); `lib/client` is browser-only; `lib/server` carries
  `import "server-only"` and is the only place a secret may be touched. Never
  import `lib/server` from a component.
- **Prompts live in `lib/server/prompts/`, one module per surface.** They are
  composed with the kit in `lib/shared/prompt.ts`: `dataBlock` is the only way
  untrusted text enters a prompt, `jsonContract` is the only way a contract is
  stated, and `renderSnapshot` takes *the facets a job will use* rather than the
  whole learner. Rules that must hold everywhere (the injection posture, "never
  finish their sentence") live once in `prompts/blocks.ts`. Never inline a
  system prompt in an engine module.
- **The level comes from the profile, never the request body.** A client can
  claim C1; `requestContext()` reads what they actually are.
- **Route handlers stay thin**: validate input → call one `lib/server` module →
  return JSON. Logic belongs in the module, not the handler.
- **Third-party text and learner text are data, never instructions.** Crawled
  headlines, snippets, and anything typed by a learner get passed to models as
  clearly-delimited content. JSON contracts stay tiny and parse fail-soft.
- **Secrets never enter the repo.** `.env.example` holds empty placeholders
  only; real values go in `.env.local` (git-ignored) or the Vercel dashboard.

**Design** (details in `docs/DESIGN_SYSTEM.md`)
- Oxford blue for every interactive affordance; **ochre only for annotations**;
  **never red**; **no emoji**; square corners; flat surfaces; sentence case.
- Reach for tokens (`bg-card`, `text-brand`, `bg-ochre-tint`), never raw hex.

## The delivery cycle

Full version with the reasoning: **`docs/WORKFLOW.md`**. The short form:

1. **Frame** — restate the change as one sentence of learner-visible outcome.
   Non-trivial work gets a short spec first (`/spec`).
2. **Plan** — name the files and the seam before writing code. Say which
   non-negotiable the change touches, if any.
3. **Build** — smallest change that fully does the job; match surrounding style.
4. **Prove** — `/checks`. Pure logic gets a Vitest test; a change to the core
   loop gets or updates a Playwright test. See "Definition of done".
5. **Ship** — `/ship`. Conventional-ish commit, push to the session branch, open
   a PR against `main` using the template.
6. **Sync docs** — `/docsync` if behaviour, architecture, or the API surface
   moved.

## Definition of done

A change is done when **all** of these hold:

- [ ] `npm run verify` passes (lint · typecheck · unit tests · build).
- [ ] `npm run e2e` passes if anything on the daily-words path changed.
- [ ] New pure logic in `lib/shared` has Vitest tests covering the happy path,
      the empty/zero case, and the boundary the code actually cares about.
- [ ] No new secret, key, or personal data in tracked files.
- [ ] Docs updated when behaviour changed (`docs/`, `README.md` status).
- [ ] The non-negotiables above still hold.

"It builds" is not done. "The learner-visible outcome happens, and I saw it" is.

## Commands and conventions

```bash
npm run dev         # local dev, http://localhost:3000
npm run verify      # THE GATE: lint + typecheck + test + build
npm test            # Vitest (pure logic in lib/shared)
npm run e2e         # build + Playwright smoke of the core loop (no keys)
```

- Imports use `@/*` → `src/*`. Unit tests live in `src/**/__tests__/*.test.ts`;
  E2E specs live in `e2e/*.spec.ts`.
- Prefer editing an existing module over adding a parallel one. New files need a
  reason a reviewer would agree with.
- Comments explain *why* (especially where a choice is pedagogical, not
  technical). Do not narrate what the code already says.

## Verifying for real

Tests are the gate; they are not proof the feature works. For AI-dependent
surfaces (News Chat, Phrasebook, and the tailored halves of Daily Words and
Respond) drive the real thing — the
**`verify` skill** (`.claude/skills/verify/`) has the launch commands, the API
payloads, and the gotchas that have bitten before. Free-tier rate limits produce
real 502s that are not bugs; retry like a user would.

## Where to look

| Question | File |
| --- | --- |
| Why the product is shaped this way | `README.md` |
| How the system fits together | `docs/ARCHITECTURE.md` |
| The delivery cycle in full | `docs/WORKFLOW.md` |
| UI rules and tokens | `docs/DESIGN_SYSTEM.md` |
| Database schema and RLS | `supabase/README.md` |
| The daily-word method | `docs/DAILY_WORDS.md` |
| Respond's one rule + the SSRF guards | `docs/RESPOND.md` |
| Phrasebook practice modes | `docs/PHRASEBOOK.md` |
| Transcribe's two gates + the scoring rule | `docs/TRANSCRIBE.md` |
| News Chat contracts | `docs/NEWS_CHAT.md`, `docs/NEWS_CHAT_V2.md` |
| Why this architecture over alternatives | `docs/PATTERNS.md` |
