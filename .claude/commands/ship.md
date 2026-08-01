---
description: Gate, commit, and push the current change on the session branch
argument-hint: [optional commit subject]
---

Ship the current change. Do the steps in order and stop at the first real
failure rather than pushing past it.

1. **Review your own diff.** `git status` and `git diff`. Remove debug logging,
   stray scratch files, and anything you added to make a test pass rather than
   to make the product work.

2. **Secrets check.** Confirm no key, token, password, connection string, or
   personal data landed in a tracked file. `.env.example` may contain empty
   placeholders only. If you find one, stop and tell the user — a committed
   secret needs rotating, not just deleting.

3. **Run the gate.** `npm run verify`, plus `npm run e2e` if the daily-words
   path changed. It must be green. If it isn't, fix it; if the failure
   is genuinely pre-existing on the base branch, verify that claim before making
   it.

4. **Commit.** Stage deliberately (never `git add -A` without looking at what it
   sweeps up). Write the subject as the learner-visible outcome, imperative
   mood, matching the existing log style — e.g. *"Phrasebook: handle raw,
   unenriched captures gracefully"*. Body: why, not what. Suggested subject:
   $ARGUMENTS

5. **Push** to the session branch with `git push -u origin <branch>`. Never to
   `main`. On network failure retry with backoff (2s, 4s, 8s, 16s).

6. **Report** the branch, the commit, and the gate result. Do not open a pull
   request unless the user asked for one — say the branch is ready and offer.

If the user does ask for a PR: fill in `.github/pull_request_template.md`
honestly, including the "what I did not verify" section, and target `main`.
