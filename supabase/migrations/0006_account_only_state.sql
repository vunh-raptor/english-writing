-- Flowrite — Supabase phase, migration 6: the rest of the learner's state.
--
-- Migrations 0001-0005 landed the account anchor (profiles), News Chat
-- conversations, and the shared phrase library. Everything else a learner
-- accumulates still lived only in the browser, which is what made the app
-- guest-first. This migration lands the remainder so the server can hold the
-- WHOLE of `Store` (src/types.ts) and `localStorage` can be removed outright:
--
--   profiles          + the two Settings dials, and "has written once"
--   phrases           + the learner's own sentence per item (the `echo` drill),
--                       and the missing halves of capture provenance
--   vocab             words they have actually WRITTEN, and when they first did
--   word_days         which curated words each local day issued
--   phrase_applied    clean applications per day (the "this week" strips)
--   respond_sessions  the reading, the thinking, and the idea bank
--   transcribe_sessions  where in a clip the ear got to
--
-- Every table is per-user and RLS'd: `to authenticated` plus an ownership
-- predicate, with `with check` on every insert/update so a row can never be
-- written or reassigned to somebody else.
--
-- Note: ALTER TYPE ... ADD VALUE is safe here because the new value is not
-- used elsewhere in this same migration.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Transcribe mints library items too: a word misheard twice becomes tomorrow's
-- review, and its provenance should say so rather than masquerading as a
-- highlight the learner chose.
alter type public.phrase_source add value if not exists 'transcribe';

-- Where a Respond session got to. Mirrors `RespondSession.status`.
create type public.respond_status as enum ('thinking', 'ideas', 'drafting', 'done');

-- Whether a clip still has chunks left. Mirrors `TranscribeSession.status`.
create type public.transcribe_status as enum ('active', 'complete');

-- ---------------------------------------------------------------------------
-- profiles — settings live with the account, not the device
-- ---------------------------------------------------------------------------

alter table public.profiles
  -- The deliberate daily dose (Settings.wordsPerDay). Bounded because the set
  -- has to stay finishable — that is the whole habit argument.
  add column if not exists words_per_day integer not null default 5
    constraint profiles_words_per_day_sane check (words_per_day between 1 and 20),
  -- Completion sound (Settings.sound).
  add column if not exists sound boolean not null default true,
  -- Whether they have finished a first session; nudges are deferred until then.
  add column if not exists has_written boolean not null default false;

comment on column public.profiles.words_per_day is
  'How many brand-new words a daily set introduces. Small enough to always finish.';

-- ---------------------------------------------------------------------------
-- phrases — the learner's own line, and the rest of capture provenance
-- ---------------------------------------------------------------------------

alter table public.phrases
  -- The last sentence they wrote with this item. Weeks later the `echo` drill
  -- gaps their own words back to them, which beats any sentence we could
  -- generate as a retrieval cue (docs/DAILY_WORDS.md).
  add column if not exists my_line text,
  -- 0003 stored the highlighted passage but not the other two thirds of
  -- `CaptureSource` — which surface captured it, and on what day.
  add column if not exists captured_module text,
  add column if not exists captured_day date;

comment on column public.phrases.my_line is
  'The learner''s own most recent sentence using this item — the `echo` drill''s cue.';

-- ---------------------------------------------------------------------------
-- vocab — words they have written, not words they have seen
-- ---------------------------------------------------------------------------

-- Vocabulary is counted only from sentences the learner actually produced, so
-- "your words" never inflates with words they merely read. One row per word.
create table public.vocab (
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Lowercased token (see tokenize() in lib/shared/stats.ts).
  word       text not null,
  first_seen date not null,
  count      integer not null default 1 check (count >= 0),
  primary key (user_id, word)
);

comment on table public.vocab is
  'Per-user vocabulary, built only from words the learner wrote. Keyed by lowercased token.';

-- "New words this week" scans by first_seen within a user.
create index vocab_user_first_seen_idx on public.vocab (user_id, first_seen desc);

alter table public.vocab enable row level security;

create policy "Vocab is self-readable"
  on public.vocab for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Vocab is self-insertable"
  on public.vocab for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Vocab is self-updatable"
  on public.vocab for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Vocab is self-deletable"
  on public.vocab for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- word_days — today's set is drawn once and then fixed
-- ---------------------------------------------------------------------------

-- Reopening the app must never reshuffle today's words, so which curated ids a
-- day issued is recorded the first time and then read back.
create table public.word_days (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  -- Curriculum ids (`w-<word>`), in the order the day issued them.
  word_ids text[] not null default '{}',
  primary key (user_id, day)
);

comment on table public.word_days is
  'Which curated word ids each local day introduced — keeps today''s set stable across reloads.';

alter table public.word_days enable row level security;

create policy "Word days are self-readable"
  on public.word_days for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Word days are self-insertable"
  on public.word_days for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Word days are self-updatable"
  on public.word_days for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Word days are self-deletable"
  on public.word_days for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- phrase_applied — clean applications per day
-- ---------------------------------------------------------------------------

create table public.phrase_applied (
  user_id      uuid not null references auth.users (id) on delete cascade,
  day          date not null,
  applications integer not null default 0 check (applications >= 0),
  primary key (user_id, day)
);

comment on table public.phrase_applied is
  'Clean applications per local day across every surface — powers the "this week" strips.';

alter table public.phrase_applied enable row level security;

create policy "Applications are self-readable"
  on public.phrase_applied for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Applications are self-insertable"
  on public.phrase_applied for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Applications are self-updatable"
  on public.phrase_applied for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Applications are self-deletable"
  on public.phrase_applied for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- respond_sessions — the reading, the thinking, and the idea bank
-- ---------------------------------------------------------------------------

-- Reading generates more angles than anyone has time to write, and the waste is
-- losing them — so an undrafted idea has to outlive the session that made it.
create table public.respond_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  day          date not null,

  -- `SourceRef`: { title, site?, url?, words }.
  source       jsonb not null,
  -- A bounded copy of the extracted article, so a session can be reopened.
  source_text  text not null default '',

  -- `ThinkTurn[]` — the four rungs and what they answered.
  turns        jsonb not null default '[]'::jsonb,
  -- `ContentIdea[]` — the idea bank, including the borrowing verdicts.
  ideas        jsonb not null default '[]'::jsonb,
  -- Which idea became the draft, if any (a ContentIdea.id, not a row id).
  chosen_id    text,
  draft        text not null default '',
  -- `Polish` — what landed, at most two upgrades, phrases worth keeping.
  polish       jsonb,

  status       public.respond_status not null default 'thinking',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.respond_sessions is
  'One pass through Respond: the source, the thinking ladder, the learner''s own angles, the draft.';

create index respond_sessions_user_updated_idx
  on public.respond_sessions (user_id, updated_at desc);

create trigger respond_sessions_set_updated_at
  before update on public.respond_sessions
  for each row execute function public.set_updated_at();

alter table public.respond_sessions enable row level security;

create policy "Respond sessions are self-readable"
  on public.respond_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Respond sessions are self-insertable"
  on public.respond_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Respond sessions are self-updatable"
  on public.respond_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Respond sessions are self-deletable"
  on public.respond_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- transcribe_sessions — where in a clip the ear got to
-- ---------------------------------------------------------------------------

-- Progress is chunk-granular because that is the unit a learner resumes at: a
-- twenty-minute clip has to survive being closed (docs/TRANSCRIBE.md).
create table public.transcribe_sessions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  day            date not null,

  -- Curated clip id, or `yt-<videoId>` for a pasted link.
  clip_id        text not null,
  -- The whole `TranscribeClip` frozen, transcript included — a pasted link has
  -- no curated entry to look up later, and the cues are what scoring needs.
  clip           jsonb not null,

  chunk_seconds  integer not null default 15
    constraint transcribe_chunk_seconds_sane check (chunk_seconds between 5 and 60),
  chunk_count    integer not null default 0 check (chunk_count >= 0),
  -- 0-based cursor: the chunk they are on now.
  cursor         integer not null default 0 check (cursor >= 0),

  -- `Record<chunkIndex, ChunkResult>` — accuracy, listens, aided, shadowed, missed.
  results        jsonb not null default '{}'::jsonb,
  -- Passage indexes whose milestone has been passed.
  milestones_passed integer[] not null default '{}',

  status         public.transcribe_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- One session per clip per learner; resuming updates it in place.
  unique (user_id, clip_id)
);

comment on table public.transcribe_sessions is
  'One pass through a clip: the frozen transcript, per-chunk outcomes, and the resume cursor.';

create index transcribe_sessions_user_updated_idx
  on public.transcribe_sessions (user_id, updated_at desc);

-- The entry screen's "where you left off" card asks only for unfinished clips.
create index transcribe_sessions_user_active_idx
  on public.transcribe_sessions (user_id)
  where status = 'active';

create trigger transcribe_sessions_set_updated_at
  before update on public.transcribe_sessions
  for each row execute function public.set_updated_at();

alter table public.transcribe_sessions enable row level security;

create policy "Transcribe sessions are self-readable"
  on public.transcribe_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Transcribe sessions are self-insertable"
  on public.transcribe_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Transcribe sessions are self-updatable"
  on public.transcribe_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Transcribe sessions are self-deletable"
  on public.transcribe_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);
