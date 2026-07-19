-- Flowrite — Supabase phase, migration 2: News Chat learning data.
--
-- The `/news` slice of "user learning data", ported faithfully from the
-- localStorage model (src/types.ts, src/store/StoreContext.tsx):
--
--   news_sessions  ← Store.newsSessions  (saved conversations; powers the
--                                          dashboard's stats, resume, recent list)
--   phrases        ← Store.minedPhrases + Store.phraseSrs
--                                         (the learner's phrase library with its
--                                          Leitner schedule folded in — the SRS
--                                          loop that makes News Chat a curriculum)
--
-- The rolling level lives on profiles.news_level (migration 1). All tables are
-- per-user under RLS. See docs/NEWS_CHAT_V2.md §4/§9 and docs/DATA_MODEL.md.

create type public.news_session_status as enum ('active', 'complete');
create type public.phrase_kind         as enum ('pattern', 'phrase');
-- Where a phrase entered the library. News mints most; the Phrase Coach is the
-- other producer today.
create type public.phrase_source       as enum ('news', 'coach');

-- ---------------------------------------------------------------------------
-- news_sessions — a saved News Chat conversation (the `NewsSession` type).
-- ---------------------------------------------------------------------------
-- Denormalized columns power the dashboard's queries and roll-ups cheaply; the
-- three JSONB columns hold the full frozen session so a chat can be resumed
-- turn-for-turn with no re-plan (the mission is fixed at session start).
create table public.news_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,

  -- Mission day (local YYYY-MM-DD) and the level it was planned at.
  day              date not null,
  level            public.news_level not null,

  -- Dashboard display: the conversation's headline + honest attribution + goal.
  title            text not null,
  source           text not null,
  url              text,
  goal             text not null,

  -- 'active' until the debrief lands; 'complete' after.
  status           public.news_session_status not null default 'active',

  -- Roll-up metrics (the dashboard sums these; also shown per-row).
  words_produced   integer not null default 0,
  targets_produced integer not null default 0,
  targets_total    integer not null default 0,
  -- Did the learner accomplish the mission goal? NULL until complete.
  goal_hit         boolean,

  -- The frozen `Mission` (scenario, goal, 3 targets, 4 beats + hint ladders).
  mission          jsonb not null,
  -- The transcript so far: `ChatMessage[]` ({ role: 'coach' | 'user', content }).
  messages         jsonb not null default '[]'::jsonb,
  -- Client-held `MissionProgress`, merged server-side each turn.
  progress         jsonb not null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.news_sessions is
  'Saved News Chat conversations. JSONB holds the frozen mission + transcript + progress for exact resume; scalar columns power the dashboard.';

-- Dashboard lists newest-first; the resume card wants the single active chat.
create index news_sessions_user_updated_idx
  on public.news_sessions (user_id, updated_at desc);
create index news_sessions_user_day_idx
  on public.news_sessions (user_id, day desc);
create index news_sessions_user_active_idx
  on public.news_sessions (user_id)
  where status = 'active';

create trigger news_sessions_set_updated_at
  before update on public.news_sessions
  for each row execute function public.set_updated_at();

alter table public.news_sessions enable row level security;

create policy "News sessions are self-readable"
  on public.news_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "News sessions are self-insertable"
  on public.news_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "News sessions are self-updatable"
  on public.news_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "News sessions are self-deletable"
  on public.news_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- phrases — the learner's personal phrase library + its Leitner schedule.
-- ---------------------------------------------------------------------------
-- Merges `Store.minedPhrases` (the `Phrase` shape) with `Store.phraseSrs` (the
-- `SrsRecord` per phrase). One row per distinct phrase; the SRS columns are the
-- schedule. A NULL `srs_box` means "new, never scheduled" — which
-- lib/shared/srs.ts treats as due today (so an assisted/missed target lands in
-- the Phrase Coach immediately; see NEWS_CHAT_V2.md §9).
create table public.phrases (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,

  -- Content-derived identity: the same phrase text dedupes across sessions.
  -- Mirrors phraseId() in NewsChat.tsx ("nc-" + slugified text).
  slug              text not null,

  -- The `Phrase` payload.
  text              text not null,
  meaning           text not null default '',
  example           text not null default '',
  kind              public.phrase_kind not null default 'phrase',
  register          text,
  origin            text,
  -- `PhraseAlternative[]`: [{ text, note? }, ...].
  alternatives      jsonb not null default '[]'::jsonb,

  -- Provenance: which producer minted it, and (for news) which session first did.
  source            public.phrase_source not null,
  source_session_id uuid references public.news_sessions (id) on delete set null,

  -- Leitner SRS schedule (SrsRecord). NULL box ⇒ new ⇒ due today.
  srs_box           integer,
  srs_due           date,
  srs_reps          integer not null default 0,
  srs_last_reviewed date,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One library entry per phrase per learner.
  unique (user_id, slug)
);

comment on table public.phrases is
  'The learner''s phrase library with its Leitner SRS schedule folded in. NULL srs_box = new/due-today. Fed by News Chat debriefs and the Phrase Coach.';

-- "What's due?" is the Phrase Coach's core query.
create index phrases_user_due_idx
  on public.phrases (user_id, srs_due);

create trigger phrases_set_updated_at
  before update on public.phrases
  for each row execute function public.set_updated_at();

alter table public.phrases enable row level security;

create policy "Phrases are self-readable"
  on public.phrases for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Phrases are self-insertable"
  on public.phrases for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Phrases are self-updatable"
  on public.phrases for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Phrases are self-deletable"
  on public.phrases for delete
  to authenticated
  using ((select auth.uid()) = user_id);
