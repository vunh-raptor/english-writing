-- Flowrite — Supabase phase, migration 5: the daily-word curriculum.
--
-- Daily Words (docs/DAILY_WORDS.md) hands the learner a small set of curated
-- high-frequency words each day. A word that survives its "use it" round joins
-- the same per-user library as everything else (migration 0002) with
-- kind='word' and its Leitner schedule folded in — one pool, one scheduler,
-- three surfaces. This migration only adds the provenance value, because the
-- payload columns it needs (text, meaning, example, collocations, kind) all
-- already exist.
--
-- `slug` for these rows is the curriculum id (`w-<word>`), so the same word
-- dedupes no matter which surface met it first, and the client's localStorage
-- ids map straight through.
--
-- Note: ALTER TYPE ... ADD VALUE is safe here because the new value is not
-- used elsewhere in this same migration.

alter type public.phrase_source add value if not exists 'daily';

comment on type public.phrase_source is
  'Where a library item entered: a News Chat mission (news), a learner highlight (captured), or the daily-word curriculum (daily). The legacy coach value predates the Phrasebook.';
