# `supabase/` — database schema

SQL migrations for Flowrite's Postgres schema (the Supabase phase — see
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)). The data model and the
`Store → Postgres` mapping are documented in
[`../docs/DATA_MODEL.md`](../docs/DATA_MODEL.md).

## Migrations

Applied **oldest first**. Each is plain, idempotent-per-fresh-DB SQL; they
assume a standard Supabase project (the `auth` schema and `auth.uid()` exist).

| File | What it creates |
| --- | --- |
| `migrations/0001_foundation.sql` | `news_level` enum; the `set_updated_at()` / `handle_new_user()` triggers; **`profiles`** (account anchor: streak + totals + rolling level) with RLS. |
| `migrations/0002_news_learning.sql` | `news_session_status` / `phrase_kind` / `phrase_source` enums; **`news_sessions`** and **`phrases`** (the `/news` learning data) with indexes and RLS. |
| `migrations/0003_phrasebook.sql` | Phrasebook capture: `phrase_source` value `'captured'` + `phrases.captured_context` (the highlighted passage). |
| `migrations/0004_lexical_kinds.sql` | General lexical units: `phrase_kind` values `word`/`idiom`/`collocation`/`sentence` + `phrases.collocations` (partner chunks). |

Everything is per-user and protected by Row-Level Security: a signed-in user can
only read or write their own rows.

## Applying them

**With the Supabase CLI** (recommended), from the repo root:

```bash
supabase link --project-ref <your-project-ref>   # once
supabase db push                                  # applies migrations/*.sql in order
```

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

> The schema is **ready to wire, not yet wired**: no route calls the DB until
> Supabase Auth provides a signed-in `userId`. Until then the app runs entirely
> on the guest-first `localStorage` path, unchanged.

## Keeping the types in sync

There's no ORM. When you change a migration, update the hand-authored `Database`
type in `src/lib/server/db/types.ts` to match (or regenerate it with
`supabase gen types typescript`), and run `npm run typecheck`.
