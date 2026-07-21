-- Flowrite — Supabase phase, migration 4: general lexical kinds + collocations.
--
-- The Phrasebook holds every kind of lexical unit — words, phrases, idioms,
-- patterns, collocations, whole sentences — and practice adapts to the kind
-- (a single word drills with its partner words). Extends the phrase_kind enum
-- accordingly and stores a word's natural partners. Mirrors `LexKind` and
-- `Phrase.collocations` in src/types.ts; see docs/PHRASEBOOK.md.
--
-- Note: ALTER TYPE ... ADD VALUE is safe here because the new values are not
-- used elsewhere in this same migration.

alter type public.phrase_kind add value if not exists 'word';
alter type public.phrase_kind add value if not exists 'idiom';
alter type public.phrase_kind add value if not exists 'collocation';
alter type public.phrase_kind add value if not exists 'sentence';

alter table public.phrases
  add column if not exists collocations jsonb not null default '[]'::jsonb;

comment on column public.phrases.collocations is
  'Natural partner chunks (mainly for kind=word), e.g. ["make a decision","tough decision"].';
