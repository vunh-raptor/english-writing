---
description: Bring the docs back in line with what the code now does
---

Check the docs against the current change and fix what drifted. Docs here are
load-bearing — the next session reads them before touching anything, so a stale
doc actively causes bad changes.

Diff the change (`git diff main...HEAD`, or the working tree if unpushed) and
work through this table. Only touch what actually moved.

| If the change touched… | Check |
| --- | --- |
| `src/app/api/**` | `docs/ARCHITECTURE.md` — the API surface table |
| `supabase/migrations/**`, `src/lib/server/db/**` | `docs/DATA_MODEL.md` |
| News Chat / converse contracts | `docs/NEWS_CHAT_V2.md` |
| `globals.css`, `tailwind.config.ts`, UI primitives | `docs/DESIGN_SYSTEM.md` |
| `src/lib/shared/**`, the `lib` split, layering | `docs/ARCHITECTURE.md` |
| What actually ships today | `README.md` → **Status** |
| A rule future sessions must follow | `CLAUDE.md` |
| Routes, modes, or the project layout | `README.md` |

Rules:

- **Correct, don't append.** If a doc now says something false, fix that
  sentence; do not leave it and add a newer paragraph below.
- **Match the existing voice** — these docs explain *why*, in prose, with tables
  where they earn their place. Don't turn them into changelogs.
- **Never invent status.** If Supabase auth still isn't wired, the README says
  so. Report what is true, not what is planned.

Then report which files you changed and which you checked and left alone.
