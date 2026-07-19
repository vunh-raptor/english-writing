-- Flowrite — Supabase phase, migration 1: foundation.
--
-- The account anchor for all durable learning data. Today the app is
-- guest-first (localStorage); this migration lands the server side of the
-- "Profile" (streak + lifetime totals) plus the rolling News Chat level, so
-- multi-device sync can turn on the moment Supabase Auth is wired. See
-- docs/DATA_MODEL.md for the whole picture and docs/ARCHITECTURE.md for the
-- guest-first → account migration plan.
--
-- Everything is per-user and protected by Row-Level Security: a signed-in user
-- can only ever see or touch their own rows.

-- CEFR-ish level the News Chat mission is planned at, and the axis tomorrow's
-- mission adapts along. Mirrors the `NewsLevel` union in src/types.ts.
create type public.news_level as enum ('A2', 'B1', 'B2', 'C1');

-- Keep `updated_at` honest without trusting the client's clock. Attached to
-- every mutable table below.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- One row per account, 1:1 with auth.users. Holds the learner's durable
-- "Profile" (src/types.ts): streak-with-forgiveness + lifetime totals, plus the
-- rolling News Chat level. AI provider keys stay browser-only by design and are
-- deliberately NOT stored here.
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  -- Optional first name, only used to greet warmly (Settings.name).
  display_name   text,

  -- Streak engine (see src/lib/shared/streak.ts). Freezes forgive missed days.
  streak         integer not null default 0,
  longest_streak integer not null default 0,
  -- Local calendar day (YYYY-MM-DD), the learner's own timezone. NULL = never written.
  last_write_day date,
  freezes        integer not null default 2,

  -- Lifetime totals rolled up across sessions.
  total_words    integer not null default 0,
  total_entries  integer not null default 0,
  total_ms       bigint  not null default 0,

  -- Rolling News Chat level; tomorrow's mission is planned at it.
  news_level     public.news_level not null default 'B1',

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.profiles is
  'Per-account learning profile: streak + lifetime totals + rolling News Chat level. 1:1 with auth.users.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-provision a profile the moment an account is created, so no code path
-- ever has to race to create one. Standard Supabase pattern (security definer,
-- empty search_path → fully-qualified names).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row-Level Security: a user sees and edits only their own profile. Deletion is
-- intentionally omitted — profiles die with the auth.users row (cascade).
alter table public.profiles enable row level security;

create policy "Profiles are self-readable"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Profiles are self-insertable"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Profiles are self-updatable"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
