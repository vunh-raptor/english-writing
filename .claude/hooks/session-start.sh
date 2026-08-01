#!/bin/bash
# SessionStart hook — make a fresh Claude Code on the web container able to run
# the full quality gate (lint · typecheck · test · build · e2e) immediately.
# Idempotent and non-interactive; safe to re-run.
set -euo pipefail

# Local machines are already set up by their owner; only prepare remote sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# `install` (not `ci`) so the post-hook container snapshot can be reused.
npm install --no-audit --no-fund

# Playwright: reuse the Chromium the image already ships instead of downloading
# a second copy. playwright.config.ts honours this env var and falls back to the
# standard Playwright-managed browser (what CI uses) when it is unset.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  chrome="$(find /opt/pw-browsers -maxdepth 3 -name chrome -type f 2>/dev/null | head -n 1 || true)"
  if [ -n "$chrome" ]; then
    echo "export PLAYWRIGHT_CHROMIUM_EXECUTABLE=\"$chrome\"" >> "$CLAUDE_ENV_FILE"
  fi
fi

echo "Flowrite session ready — run 'npm run verify' for the full gate."
