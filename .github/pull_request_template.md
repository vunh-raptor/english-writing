## Outcome

<!-- One sentence: what a learner will now experience. Not the implementation. -->

## What changed

<!-- The seam you cut and why there. Keep it to what a reviewer needs. -->

## Evidence

<!-- Paste the real gate output, and for AI surfaces the actual observed
     response/transcript. "I verified it" is not evidence. -->

- [ ] `npm run verify` (lint · typecheck · unit tests · build)
- [ ] `npm run e2e` — required if the write → celebrate path changed
- [ ] New pure logic has Vitest coverage (happy path, empty case, boundary)
- [ ] A bug fix has a test that failed before the fix

## What I did NOT verify

<!-- Required. Name the gaps: AI modes not exercised, browsers not covered,
     migrations not run against a real database, etc. Write "nothing" only if
     that is true. -->

## Non-negotiables

<!-- Delete any line that this change genuinely does not touch. -->

- [ ] No correction mid-flow — `spellCheck` still off, no grammar UI while writing
- [ ] Core loop still works guest-first, offline, with no AI keys
- [ ] `lib/server` still unreachable from components; no secret in a tracked file
- [ ] Design system respected — no red, no emoji, tokens not raw hex
- [ ] Docs updated (`docs/`, `README.md` Status) if behaviour moved
