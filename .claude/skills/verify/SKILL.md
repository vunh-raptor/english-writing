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

Playwright works headless (`chromium-headless-shell` cached in
`~/.cache/ms-playwright`; `npm i playwright` in a scratch dir — skip browser
download). Key selectors: placeholder "Write your reply…", buttons "Stuck?",
"More help", "Use frame", "Say it your way", `button[type=submit]`.

Gotchas that bit before:
- The store gates render on hydration; wait for real text, not `load`.
- Editing server files hot-clears the in-process mission cache → the page may
  show a DIFFERENT mission than an earlier fetch. Fetch the mission from the
  API at script start and assert against that, never a saved file.
- Wait for `.typing-dot` to disappear before interacting between turns.

## What "verified" means here

The v2 acceptance test: no interaction path where tapping alone yields a
sendable message — send must stay disabled while `___` remains in the input,
model answers blur after ~7s, keywords render as inert bricks.
