---
name: verify
description: Build, launch, and drive Flowrite (Next.js app) to verify changes at their real surface — API routes via curl/node, UI via Playwright headless.
---

# Verifying Flowrite changes

## Launch

```bash
npm run dev -- --port 3457 > /tmp/dev.log 2>&1 &   # dev server, ~2s to ready
curl -s http://localhost:3457/api/health            # {"ok":true,"ai":true,...}
```

- AI keys live in `.env` (Groq + Gemini set). `"ai":false` in health → AI
  modes will 503 by design; only non-AI surfaces are verifiable.
- The app is local-first: state is browser localStorage, server is stateless —
  every API call carries its full context, so sessions replay from scripts.

## Drive the API surfaces

News Chat v2 (mission engine) example — client round-trips `mission` +
`progress` + `messages` each turn:

```bash
curl -s "http://localhost:3457/api/news/mission?level=B1"   # planned lesson (cached per day+level)
# then POST /api/converse {mission, progress, messages}, /api/converse/bridge,
# /api/converse/debrief — see src/lib/client/clientApi.ts for exact payloads.
```

- First mission call runs the planner: 15–25s. Cached after: ~10ms.
- Free-tier Groq rate-limits under bursts → instant 502s from our routes.
  Retry after ~5s like a user would; it is not a code bug.
- Planner validation failures log as `[mission] …` in the dev log — read them
  before assuming breakage; one retry usually repairs.
- Write a node .mjs driver (fetch, no deps) simulating learner turns; assert
  the merged `state` (beatIndex/targets/words) after each turn.

## Drive the UI

Playwright works headless. In a sandbox that already ships a Chromium, point at
it rather than downloading a second copy — `launchOptions.executablePath`, or
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` for the repo's own config.

Key selectors: News Chat — placeholder "Write your reply…", buttons "Stuck?",
"More help", "Use frame", "Say it your way". Daily Words — "Start today's
words", "Got it", placeholder "type the word…", "Check", "Show me", "Use it in
your own sentence". Respond — "Start thinking", "Push me", "Check my angles",
"Write this one", "I'm done".

**Seed `localStorage` to reach states a fresh install can't.** The store is one
key (`flowrite.v1`), so `page.addInitScript` can put words at chosen Leitner
boxes and jump straight to the drill rung under test — otherwise `echo` is
weeks away and `repair` needs a box-3 word.

Gotchas that bit before:
- The store gates render on hydration; wait for real text, not `load`.
- Cards that render twice (mobile + desktop, `lg:hidden` / `hidden lg:block`)
  make `.first()` resolve to the hidden copy. Filter to `{ visible: true }`.
- Running `next build` while a dev server is up clobbers `.next` and the dev
  server starts 500ing on chunk loads. Restart it after a build.
- Editing server files hot-clears the in-process mission cache → the page may
  show a DIFFERENT mission than an earlier fetch. Fetch the mission from the
  API at script start and assert against that, never a saved file.
- Wait for `.typing-dot` to disappear before interacting between turns.

## What "verified" means here

One acceptance test across every mode: **no interaction path where tapping
alone produces the learner's output.** News Chat — send stays disabled while
`___` remains, model answers blur after ~7s, keywords are inert bricks. Daily
Words — a setup never contains the word it elicits, worked examples are inert.
Respond — the app returns questions only; no summary, angle, or insertable
line, and the draft's outline is `select-none`.
