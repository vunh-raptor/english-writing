# `supabase/` — database schema

SQL migrations for Flowrite's Postgres schema (the Supabase phase — see
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)). Each table mirrors a
slice of the localStorage `Store` (`src/types.ts`); the mapping for a given
feature is documented in that feature's doc — [`DAILY_WORDS.md`](../docs/DAILY_WORDS.md),
[`PHRASEBOOK.md`](../docs/PHRASEBOOK.md), [`NEWS_CHAT_V2.md`](../docs/NEWS_CHAT_V2.md)
— under "Data".

Two rules hold across all of them: every table is per-user with Row-Level
Security, and domain logic is never re-implemented here — the data-access layer
imports the isomorphic `src/lib/shared/*` helpers (e.g. `reviewCard`) so client
and server can't drift.

## Migrations

Applied **oldest first**. Each is plain, idempotent-per-fresh-DB SQL; they
assume a standard Supabase project (the `auth` schema and `auth.uid()` exist).

| File | What it creates |
| --- | --- |
| `migrations/0001_foundation.sql` | `news_level` enum; the `set_updated_at()` / `handle_new_user()` triggers; **`profiles`** (account anchor: streak + totals + rolling level) with RLS. |
| `migrations/0002_news_learning.sql` | `news_session_status` / `phrase_kind` / `phrase_source` enums; **`news_sessions`** and **`phrases`** (the `/news` learning data) with indexes and RLS. |
| `migrations/0003_phrasebook.sql` | Phrasebook capture: `phrase_source` value `'captured'` + `phrases.captured_context` (the highlighted passage). |
| `migrations/0004_lexical_kinds.sql` | General lexical units: `phrase_kind` values `word`/`idiom`/`collocation`/`sentence` + `phrases.collocations` (partner chunks). |
| `migrations/0005_daily_words.sql` | Daily words: `phrase_source` value `'daily'`, so a met curriculum word is distinguishable from a highlight or a mission target. |

Everything is per-user and protected by Row-Level Security: a signed-in user can
only read or write their own rows.

## Applying them

**With the Supabase CLI** (recommended), from the repo root:

```bash
supabase link --project-ref <your-project-ref>   # once
supabase db push                                  # applies migrations/*.sql in order
```

`link` prompts for the project's Postgres password. That password is the CLI's
business, not the app's: no code reads it, and it does not belong in
`.env.local`. To run the CLI non-interactively (CI), pass it as the CLI's own
`SUPABASE_DB_PASSWORD` from an encrypted secret store.

**Or by hand:** paste each file, oldest first, into the Supabase Studio SQL
editor and run it.

**Reset a local/dev database** to re-run everything from scratch:

```bash
supabase db reset
```

## After applying

The env vars in [`../.env.example`](../.env.example) (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and — for server writes —
`SUPABASE_SECRET_KEY`; the legacy `ANON_KEY`/`SERVICE_ROLE_KEY` names also work)
let the clients in `src/lib/server/supabase.ts` (server), `src/lib/client/supabase.ts`
(browser), and `src/middleware.ts` (session refresh) connect. The typed
data-access layer for these tables lives in `src/lib/server/db/`.

> These tables are **the app's only durable storage**. Every learner-visible
> route reaches them through `/api/state`; nothing is written to the device. A
> signed-out request gets a redirect (pages) or a 401 (API) — never an empty
> store that looks like a new learner.

## Keeping the types in sync

There's no ORM. When you change a migration, update the hand-authored `Database`
type in `src/lib/server/db/types.ts` to match (or regenerate it with
`supabase gen types typescript`), and run `npm run typecheck`.


## Migration 0006 — the rest of the learner's state

`0001`-`0005` covered the account anchor, News Chat conversations and the shared
phrase library. `0006` lands everything else, which is what let `localStorage`
be deleted outright:

| Table / column | Holds |
| --- | --- |
| `profiles.words_per_day`, `.sound`, `.has_written` | the Settings dials, and whether a first session has landed |
| `phrases.my_line` | the learner's own sentence per item — the `echo` drill's cue |
| `phrases.captured_module`, `.captured_day` | the two thirds of `CaptureSource` 0003 left out |
| `vocab` | words they have **written**, and when they first did |
| `word_days` | which curated ids each local day issued, so today's set never reshuffles |
| `phrase_applied` | clean applications per day — the "this week" strips |
| `respond_sessions` | the source, the thinking ladder, the idea bank, the draft |
| `transcribe_sessions` | the frozen clip + transcript, per-chunk outcomes, the resume cursor |

Plus a `transcribe` value on `phrase_source`, and the `respond_status` /
`transcribe_status` enums.

Every table follows the same RLS shape: `to authenticated` **and** an ownership
predicate in `using`, with `with check` on insert and update so a row can never
be written or reassigned to another account. All access goes through the
request-scoped client, so RLS — not application code — is what enforces it.

**Not yet applied anywhere.** These migrations were authored without a Supabase
project attached, so they are unrun: no `supabase db advisors`, no live query,
no verification beyond review. Apply them to a scratch project and run the
advisors before trusting them.
