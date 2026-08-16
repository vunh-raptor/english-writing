-- Flowrite — migration 7: the curriculum becomes the learner's, and every
-- production is recorded.
--
-- Two changes land together because they are the same idea from both ends.
--
-- 1. NOTHING IS BUNDLED ANY MORE. The frequency-ordered word spine and the
--    three listening passages used to live in the repo as TypeScript arrays —
--    the same 890 lines for everybody, exhausted after a few hundred days, and
--    unable to lean on anything the learner had actually done. They are now
--    generated per account and stored here (`word_items`, `listening_clips`),
--    so a learner's curriculum is theirs and can grow forever.
--
-- 2. WHAT THE LEARNER PRODUCES IS THE RECORD. Until now a session left behind
--    only its consequences — a Leitner box moved, a streak advanced, a counter
--    incremented. The sentences themselves were thrown away. `productions`
--    keeps every one of them with the verdict it earned, which is both the
--    honest answer to "what have I actually learned?" and the material every
--    generation prompt now reads to pitch the next thing at this person.
--
-- `ai_content` is the third leg: the generated material itself, keyed so that
-- reopening a session shows the same words it showed an hour ago rather than a
-- freshly hallucinated set.
--
-- Every table follows the house RLS shape: `to authenticated` plus an ownership
-- predicate in `using`, and `with check` on insert and update so a row can
-- never be written or reassigned to another account.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Which surface a sentence was produced on. Deliberately a value set rather
-- than free text: the retrospective ("you have written 214 sentences, 40 of
-- them under listening pressure") is only meaningful if the surfaces are closed.
create type public.production_surface as enum (
  'words',       -- Daily Words: the drill ladder and the "use it" round
  'bridge',      -- Daily Words: the day's closing two-word sentence
  'phrasebook',  -- a practice drill answer
  'news',        -- a News Chat turn
  'respond',     -- a thinking-ladder answer or a finished draft
  'transcribe'   -- a milestone sentence written from a passage
);

-- How a production was judged. `unjudged` is honest rather than absent: some
-- surfaces (a Respond answer, a News Chat turn) are production without a pass
-- mark, and pretending otherwise would poison the "what am I getting wrong"
-- context that the generation prompts read.
create type public.production_verdict as enum (
  'clean',
  'helped',
  'missed',
  'unjudged'
);

-- The part of speech a generated word carries. Mirrors `WordPos` in types.ts.
create type public.word_pos as enum ('verb', 'noun', 'adjective', 'adverb');

-- ---------------------------------------------------------------------------
-- word_items — the learner's own vocabulary curriculum, generated on demand
-- ---------------------------------------------------------------------------

-- One row per word this learner's curriculum has ever offered. Rows are minted
-- in batches by `lib/server/curriculum.ts` when the queue runs low, and are
-- never deleted on being met: a met word becomes a `phrases` row too (the pool
-- the Leitner schedule drives), while this row stays as the record of what the
-- curriculum has already covered, so the next batch can avoid repeating it.
create table public.word_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- Stable content id (`w-<word>`), and this item's id in the phrase pool once
  -- it is met. Unique per learner, which is what makes generation idempotent:
  -- a model that returns "decide" twice writes one row.
  slug         text not null,
  word         text not null,
  pos          public.word_pos not null,
  -- The band that meets this word; a day's set is drawn near the learner's level.
  band         public.news_level not null,
  -- Plain-words gloss, at the band's level.
  meaning      text not null default '',
  -- One natural example — the first encounter's context.
  example      text not null default '',
  -- 2-4 natural partner chunks: words are learned in company, not alone.
  collocations text[] not null default '{}',
  -- Semantic field. A day's set never repeats one, because words taught in a
  -- semantic cluster interfere with each other (Tinkham; Erten & Tekin). The
  -- generator is told the recent fields so consecutive batches vary too.
  field        text not null default '',

  -- Position in this learner's queue: ascending, the order words are offered.
  -- Assigned at generation time so ordering survives a re-read.
  rank         integer not null default 0,

  created_at   timestamptz not null default now(),

  unique (user_id, slug)
);

comment on table public.word_items is
  'The learner''s own generated word curriculum — replaces the bundled WORD_SEEDS spine.';
comment on column public.word_items.rank is
  'Queue position; a day''s new words are drawn in ascending rank among unmet items.';

-- The only hot query: unmet items for this learner, in queue order.
create index word_items_user_rank_idx on public.word_items (user_id, rank);

alter table public.word_items enable row level security;

create policy "Word items are self-readable"
  on public.word_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Word items are self-insertable"
  on public.word_items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Word items are self-updatable"
  on public.word_items for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Word items are self-deletable"
  on public.word_items for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- listening_clips — generated passages, cued once and then frozen
-- ---------------------------------------------------------------------------

-- Transcribe used to ship three hand-written passages. A passage is now written
-- for the learner at their band, about something they have shown they care
-- about, and stored whole: the cue timings are derived from the prose at a
-- stated speaking rate, and both are frozen here so a half-finished clip scores
-- against exactly the text it played.
create table public.listening_clips (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- Stable per-learner id (`clip-<slug>`), referenced by transcribe_sessions.clip_id.
  slug         text not null,
  title        text not null,
  -- Honest attribution. Generated passages say so rather than inventing a source.
  source       text not null default '',
  level        public.news_level not null,
  -- One line on what makes this clip easy or hard to hear.
  blurb        text not null default '',
  -- Delivery speed the cues were derived at. Narration sits near 150.
  wpm          integer not null default 150 check (wpm between 60 and 260),
  prose        text not null,
  -- `TranscribeCue[]` — derived from prose + wpm, stored so timings never drift.
  cues         jsonb not null default '[]'::jsonb,
  duration     integer not null default 0,

  created_at   timestamptz not null default now(),

  unique (user_id, slug)
);

comment on table public.listening_clips is
  'Generated listening passages, one row per clip, cued at generation time and frozen.';

create index listening_clips_user_created_idx
  on public.listening_clips (user_id, created_at desc);

alter table public.listening_clips enable row level security;

create policy "Clips are self-readable"
  on public.listening_clips for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Clips are self-insertable"
  on public.listening_clips for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Clips are self-updatable"
  on public.listening_clips for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Clips are self-deletable"
  on public.listening_clips for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- ai_content — the generated material, kept rather than regenerated
-- ---------------------------------------------------------------------------

-- Generated practice material used to be ephemeral: a page reload rebuilt
-- today's rounds from scratch, so the moment a learner was answering could
-- change under them, and nobody could say afterwards what they had been asked.
-- One row per (learner, kind, key) fixes both — reopening replays the stored
-- payload, and the row is the record of what the app actually taught.
create table public.ai_content (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- What was generated: 'word_rounds' | 'drill_rounds' | 'mission' |
  -- 'milestone' | 'think_questions'. Free text rather than an enum because new
  -- surfaces should not need a migration to start remembering themselves.
  kind         text not null,
  -- What it was generated FOR, chosen by the caller so a lookup is exact:
  -- a day for today's rounds, a session id for a mission, a chunk hash for a
  -- milestone. Bounded so the index stays small.
  content_key  text not null check (char_length(content_key) <= 200),

  -- The coerced, already-validated payload — exactly what the client received.
  payload      jsonb not null,
  -- Which prompt built it. A prompt change should invalidate its cache, and
  -- this is how the read side knows to.
  prompt_version text not null default '',

  created_at   timestamptz not null default now(),

  unique (user_id, kind, content_key)
);

comment on table public.ai_content is
  'Generated practice material, kept per (learner, kind, key): stable on reload, and the record of what was taught.';

create index ai_content_user_created_idx on public.ai_content (user_id, created_at desc);

alter table public.ai_content enable row level security;

create policy "Generated content is self-readable"
  on public.ai_content for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Generated content is self-insertable"
  on public.ai_content for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Generated content is self-updatable"
  on public.ai_content for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Generated content is self-deletable"
  on public.ai_content for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- productions — every sentence the learner wrote, and how it landed
-- ---------------------------------------------------------------------------

-- The app's whole argument is that producing is the thing. Until now it kept
-- the score and threw away the performance: totals went up, boxes moved, and
-- the sentences vanished. This is the ledger.
--
-- It earns its keep three times over: the learner can see what they have
-- actually written, the schedule has evidence behind it, and every generation
-- prompt reads the recent rows so the next word, moment or passage is pitched
-- at the person who wrote them rather than at a generic B1.
create table public.productions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Local calendar day, so the day strips and the streak agree with it.
  day        date not null,

  surface    public.production_surface not null,
  -- The lexical item this production was about, when there was one
  -- (`phrases.slug` / `word_items.slug`). Null for open production.
  item_slug  text,
  -- Which rung or method asked for it ('recall', 'fit', 'situation', …).
  mode       text,

  -- What they were answering — the moment, the question, the gapped sentence.
  -- Kept because a sentence without its ask is unreadable a month later.
  prompt     text not null default '',
  -- What they wrote. The point of the whole table.
  text       text not null,

  verdict    public.production_verdict not null default 'unjudged',
  -- The one warm line they were given back, when there was one.
  note       text,

  created_at timestamptz not null default now()
);

comment on table public.productions is
  'Every sentence the learner produced, with its ask and its verdict — the learning record, and the context every prompt reads.';
comment on column public.productions.verdict is
  'clean | helped | missed | unjudged. Unjudged is honest: some surfaces are production without a pass mark.';

-- "Their recent writing" and the retrospective both scan newest-first per user.
create index productions_user_created_idx on public.productions (user_id, created_at desc);
-- "How has this item gone for them" — the per-item history behind a drill.
create index productions_user_item_idx on public.productions (user_id, item_slug)
  where item_slug is not null;

alter table public.productions enable row level security;

create policy "Productions are self-readable"
  on public.productions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Productions are self-insertable"
  on public.productions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Productions are self-updatable"
  on public.productions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Productions are self-deletable"
  on public.productions for delete
  to authenticated
  using ((select auth.uid()) = user_id);
