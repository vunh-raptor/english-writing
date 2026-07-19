# Flowrite — User learning-data model (Supabase phase)

How the learner's durable data is modeled in Postgres. This is **step 2** of the
Supabase phase in [`ARCHITECTURE.md`](ARCHITECTURE.md) — the schema — landed
**News-Chat-first**. Auth (step 1) and moving the client reads behind the API
(step 3) are separate, still-pending steps; this document is the map they build
against.

> **Status.** Migrations for the `/news` slice + its foundation are in
> `supabase/`. The typed data-access layer is in `src/lib/server/db/`. It is
> **ready to wire, not yet wired**: the live app still runs entirely on
> `localStorage` (guest-first), and no route calls the DB until Supabase Auth
> provides a `userId`. Nothing here changes current runtime behavior.

---

## Principles

1. **Guest-first, then sync.** The app must keep working with no account
   (`localStorage`, `src/lib/client/storage.ts`). The DB is *additive*: the same
   shapes, persisted server-side once a learner signs in, with their guest data
   claimed on signup. So every table maps cleanly onto today's `Store`
   (`src/types.ts`).
2. **One row-owner, enforced by RLS.** Every table is per-user and carries a
   `user_id` (or *is* the user, for `profiles`). Row-Level Security makes
   "you can only touch your own rows" a database guarantee, not app etiquette.
3. **No ORM.** `supabase-js` from the server (`ARCHITECTURE.md`). "Models" are
   the hand-authored `Database` types in `src/lib/server/db/types.ts` (kept in
   lockstep with the SQL) plus a thin data-access layer per domain.
4. **Don't re-implement domain logic.** Streak, stats, and the Leitner
   scheduler already live in `src/lib/shared/*` and are isomorphic. The server
   data-access layer *imports* them (e.g. `reviewCard`), so client and server
   can never drift.
5. **Local time is the learner's time.** Day keys are `date` columns
   (`YYYY-MM-DD`), matching `DayKey` and `src/lib/shared/date.ts`.

---

## The whole picture: `Store` → Postgres

The localStorage `Store` (`src/types.ts`) is the source of truth for what needs
persisting. Each field maps to a table (or a column). **Bold** rows are
implemented in this slice; the rest are the planned shape, sketched so the news
tables don't box them in later.

| `Store` field | Postgres | Status |
| --- | --- | --- |
| `profile` (streak, totals) | **`profiles`** (columns) | **done** |
| `newsLevel` | **`profiles.news_level`** | **done** |
| `settings.name` | **`profiles.display_name`** | **done** |
| `settings.*` (goal, difficulty, focuses, AI keys…) | — stays device-local | by design¹ |
| `newsSessions[]` | **`news_sessions`** | **done** |
| `minedPhrases[]` + `phraseSrs{}` | **`phrases`** (schedule folded in) | **done** |
| `entries[]` | `entries` | planned |
| `vocab{}` | `vocab` | planned |
| `aiPrompts[]` | `ai_prompts` (or kept device-local) | planned |
| `hasWritten` | derivable (`total_entries > 0`) | n/a |
| `version` | migrations | n/a |

¹ **Settings stay in `localStorage`.** They're device preferences, and
`settings.ai.providers[*].apiKey` is a secret the product promises never leaves
the browser (`src/types.ts`). Only `name` is mirrored (as `display_name`) so a
greeting survives a device switch. Everything else that reaches Postgres is
*learning data*, not configuration.

---

## Implemented: the `/news` slice

Three tables. `profiles` is the account anchor every future table also hangs
off; `news_sessions` and `phrases` are the News Chat learning data proper.

```
auth.users ──1:1── profiles ──1:many── news_sessions ──(soft)── phrases.source_session_id
                      │                                            │
                      └───────────────── 1:many ───────────────────┘
```

### `profiles` — the account anchor (migration `0001`)

1:1 with `auth.users`, auto-created on signup by a trigger. Holds the durable
`Profile` (streak-with-forgiveness + lifetime totals, per
`src/lib/shared/streak.ts`) and the rolling `news_level`.

- **Key:** `id uuid` = `auth.users.id` (`on delete cascade`).
- **Streak:** `streak`, `longest_streak`, `last_write_day date`, `freezes`.
- **Totals:** `total_words`, `total_entries`, `total_ms bigint`.
- **News:** `news_level` (`enum A2|B1|B2|C1`, default `B1`).
- **RLS:** select/insert/update where `auth.uid() = id`. No delete (dies with
  the account).

### `news_sessions` — saved conversations (migration `0002`)

One row per saved News Chat conversation — the `NewsSession` type. Powers the
`/news` dashboard: the stats strip, the resume card, and the recent list
(`NewsDashboard.tsx`).

- **Key:** `id uuid` (DB-minted); `user_id` → `auth.users`.
- **Scalars for the dashboard** (so it never parses JSON to render a row):
  `day`, `level`, `title`, `source`, `url`, `goal`, `status`
  (`active|complete`), `words_produced`, `targets_produced`, `targets_total`,
  `goal_hit`.
- **JSONB for exact resume** — the plan is fixed at session start, so we freeze
  it whole: `mission` (`Mission`), `messages` (`ChatMessage[]`), `progress`
  (`MissionProgress`). A resumed chat replays turns with no re-plan.
- **Indexes:** `(user_id, updated_at desc)` for the recent list; a partial index
  on `status = 'active'` for the single resume card; `(user_id, day desc)`.
- **RLS:** full self-scoped CRUD.

### `phrases` — the phrase library + its schedule (migration `0002`)

Merges `minedPhrases` (the `Phrase` shape) with `phraseSrs` (the `SrsRecord` per
phrase) into one row-per-phrase. This is the loop that makes News Chat a
*curriculum* (`NEWS_CHAT_V2.md` §9): a mission's debrief deposits its targets
here on their SRS schedule, and the Phrase Coach picks them up when due.

- **Identity:** `unique (user_id, slug)`. `slug` is the **content-derived** id
  (`phraseId()` in `NewsChat.tsx`: `"nc-" + slugified text`), so the same phrase
  dedupes across missions.
- **Payload:** `text`, `meaning`, `example`, `kind` (`pattern|phrase`),
  `register`, `origin`, `alternatives jsonb`.
- **Provenance:** `source` (`news|coach`), `source_session_id` (soft FK,
  `on delete set null`).
- **Schedule (folded-in `SrsRecord`):** `srs_box`, `srs_due date`, `srs_reps`,
  `srs_last_reviewed`.
- **Index:** `(user_id, srs_due)` — the Coach's "what's due?" query.
- **RLS:** full self-scoped CRUD.

#### The one modeling decision worth calling out: `srs_box IS NULL`

In the localStorage model a phrase can exist with **no** SRS record, and
`src/lib/shared/srs.ts` treats "no record" as **due today** (`isDue(undefined) →
true`, `phraseState(undefined) → "new"`). We preserve that exactly: a phrase row
with `srs_box IS NULL` is *new / never scheduled / due now*. So the debrief's
handoff maps straight through (`NEWS_CHAT_V2.md` §9):

| Verdict | What the data-access layer writes | Meaning |
| --- | --- | --- |
| `produced` | `reviewCard(prev, true)` → box 1, due tomorrow | earned an interval |
| `assisted` | new phrase, `srs_box` left NULL | due today → Coach practices it now |
| `missed` | new phrase, `srs_box` left NULL | same |
| `keep[]` | phrase inserted, no schedule | joins the pool as today |

(An `assisted`/`missed` target that *already* had a record lapses via
`reviewCard(prev, false)`, exactly as the client does.)

---

## The models: `src/lib/server/db/`

| File | Role |
| --- | --- |
| `../supabase.ts` | Two server-only clients: `supabaseAdmin()` (service role, scopes by `user_id` in code) and `supabaseServer()` (request-scoped, RLS as the user), plus `getUserId()` — the Auth seam. |
| `db/types.ts` | The hand-authored `Database` type (Row/Insert/Update per table). Passing it to `createClient<Database>()` makes every query typed; JSONB columns are typed as their domain shapes. |
| `db/news.ts` | The `/news` data-access layer — a faithful port of `StoreContext`'s `saveNewsSession` / `saveMissionOutcome` and the dashboard reads. |

`db/news.ts` API (each takes an explicit `userId`):

```ts
getNewsLevel(userId)                     // profiles.news_level, default "B1"
setNewsLevel(userId, level)
listNewsSessions(userId, limit?)         // dashboard recent list, newest first
getActiveNewsSession(userId)             // the resume card's one unfinished chat
upsertNewsSession(userId, input)         // create/update by id (StoreContext parity)
saveMissionOutcome(userId, outcome)      // phrases + SRS + rolling level, in one go
listPhrases(userId)                      // read back the library
```

### How this wires up (once Auth lands)

The routes stay thin (`ARCHITECTURE.md`). Persistence becomes a call after the
existing stateless AI turn:

```ts
// e.g. POST /api/converse/debrief, after computing the Debrief
const userId = await getUserId();       // ../supabase — null for a guest
if (userId) {
  await saveMissionOutcome(userId, { targets, keep, level, sessionId });
}
```

Guests (no `userId`) keep using `localStorage` unchanged. The client swaps its
`makeId()` for `crypto.randomUUID()` so a client-created session id is a valid
`news_sessions.id`, and swaps its `localStorage` reads for these calls. No
business logic moves — it already lives in `lib/shared`.

---

## Applying the migrations

See [`../supabase/README.md`](../supabase/README.md). In short: they're plain
SQL under `supabase/migrations/`, applied with the Supabase CLI
(`supabase db push`) or pasted into the SQL editor, oldest first. They assume a
standard Supabase project (the `auth` schema and `auth.uid()` exist).
