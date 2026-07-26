---
description: Run the full Flowrite quality gate and report the result verbatim
allowed-tools: Bash(npm run verify), Bash(npm run lint), Bash(npm run typecheck), Bash(npm test), Bash(npm run build), Bash(npm run e2e), Bash(npx playwright test:*), Read, Grep, Glob, Edit
---

Run the quality gate for the current change.

1. `npm run verify` — lint · typecheck · unit tests · build.
2. If anything on the write → celebrate path changed (`src/components/{Home,Write,Celebrate}.tsx`,
   `src/app/write/**`, `src/app/(main)/page.tsx`, `src/store/**`), also run
   `npm run e2e`.

Then report:

- **Each step's real result.** Paste the actual failing output — never
  paraphrase a failure, never claim a step passed that you did not run.
- **Anything you skipped**, and why.
- For each failure: is it caused by this change, or pre-existing on the base
  branch? Check before asserting. If it is yours, fix it and re-run the gate.

Finish with the Definition of done checklist from `CLAUDE.md`, marking each item
honestly — including the ones that are not satisfied.

$ARGUMENTS
