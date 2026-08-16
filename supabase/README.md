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

## Migration 0007 — the curriculum becomes the learner's

`0001`-`0006` moved everything the learner *accumulated* into Postgres. `0007`
moves what the app *gives* them, and keeps what they produce:

| Table | Holds |
| --- | --- |
| `word_items` | The learner's own word curriculum, generated in batches and held in queue order (`rank`). Replaces the 890-line `WORD_SEEDS` array that used to ship with the app. Rows are never deleted on being met — the row is the record of what has been covered, so the next batch can avoid repeating it. |
| `listening_clips` | Generated listening passages: prose, the speaking rate, and the cues derived from both. Frozen at generation time so a half-finished clip scores against exactly the text it played. |
| `ai_content` | Per-session generated material, keyed `(user_id, kind, content_key)` and stamped with the `prompt_version` that built it. A reload replays the stored payload instead of generating a different question mid-answer; a prompt change misses its own cache by design. |
| `productions` | **Every sentence the learner has written**, with the ask that drew it out and the verdict it earned. The app used to keep only a production's consequences and throw the sentence away. |

Plus the `production_surface`, `production_verdict` and `word_pos` enums.

`productions` earns its keep three times over: the learner can see what they
have actually written, the schedule has evidence behind it, and every
generation prompt reads the recent rows (`src/lib/server/db/context.ts`) so the
next word, moment or passage is pitched at the person who wrote them rather
than at a generic B1.

Two indexes carry the load: `productions_user_created_idx` for "their recent
writing" (the snapshot's hot path) and a partial
`productions_user_item_idx` for "how has this item gone for them".

**Not yet applied anywhere.** Like `0006`, this was authored without a Supabase
project attached: no `supabase db advisors`, no live query, no verification
beyond review. Apply to a scratch project and run the advisors before trusting
it.
