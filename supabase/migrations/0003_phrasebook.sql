-- Flowrite — Supabase phase, migration 3: Phrasebook capture.
--
-- Captured highlights join the per-user phrase library (migration 0002) as a
-- third source. The passage the learner highlighted is kept for provenance —
-- the library shows where a phrase came from, and enrichment/practice prompts
-- can ground themselves in it. Mirrors the localStorage shape
-- (`Phrase.captured` in src/types.ts); see docs/PHRASEBOOK.md.
--
-- Note: ALTER TYPE ... ADD VALUE is safe here because the new value is not
-- used elsewhere in this same migration.

alter type public.phrase_source add value if not exists 'captured';

alter table public.phrases
  add column if not exists captured_context text;

comment on column public.phrases.captured_context is
  'For source=captured: the sentence/passage the learner highlighted the phrase in.';
