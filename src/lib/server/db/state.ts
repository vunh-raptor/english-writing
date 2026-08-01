import "server-only";
import type {
  ChunkResult,
  DayKey,
  NewsLevel,
  Phrase,
  RespondSession,
  Settings,
  Store,
  TranscribeSession,
  Vocab,
} from "@/types";
import type { Db } from "@/lib/server/supabase";
import type { PhraseRow, PhraseSource } from "./types";
import { todayKey } from "@/lib/shared/date";
import { countWords, tokenize } from "@/lib/shared/stats";
import { applyWrite } from "@/lib/shared/streak";
import { reviewCard } from "@/lib/shared/srs";

/**
 * The learner's whole durable state, read from and written to Postgres.
 *
 * This module is the seam that replaced `localStorage`. Every mutation the UI
 * used to perform against a browser blob is now an action here, executed as the
 * signed-in user under RLS — so a request can only ever touch its own rows, and
 * the same data follows the learner to any device.
 *
 * The *rules* did not move. Streak, SRS scheduling and vocabulary counting are
 * still the pure functions in `lib/shared` (`streak.ts`, `srs.ts`, `stats.ts`);
 * this module only decides which rows they apply to. That was the point of
 * keeping them isomorphic: the migration is a change of storage, not of
 * behaviour, and the Vitest suites over them still cover the real logic.
 */

/** Keep the lexical pool bounded — roomy, but finite. */
const MAX_MINED_PHRASES = 400;
const MAX_NEWS_SESSIONS = 40;
const MAX_RESPOND_SESSIONS = 20;
const MAX_TRANSCRIBE_SESSIONS = 12;
/** How much day-keyed history the "this week" strips can lean on. */
const KEEP_DAYS = 70;

// ---------------------------------------------------------------------------
// Row → domain
// ---------------------------------------------------------------------------

function toPhrase(row: PhraseRow): Phrase {
  return {
    id: row.slug,
    text: row.text,
    meaning: row.meaning,
    example: row.example,
    kind: row.kind,
    register: row.register ?? undefined,
    origin: row.origin ?? undefined,
    alternatives: row.alternatives?.length ? row.alternatives : undefined,
    collocations: row.collocations?.length ? row.collocations : undefined,
    captured: row.captured_module
      ? {
          module: row.captured_module,
          context: row.captured_context ?? undefined,
          day: row.captured_day ?? todayKey(),
        }
      : undefined,
  };
}

/** Which provenance value a phrase id implies. Ids are minted per surface. */
function sourceOf(phrase: Phrase): PhraseSource {
  const surface = phrase.captured?.module;
  if (surface === "Transcribe") return "transcribe";
  if (surface) return "captured";
  if (phrase.id.startsWith("w-")) return "daily";
  return "news";
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/**
 * The whole `Store` for one account, in a handful of queries.
 *
 * Deliberately one round trip per table rather than a nested select: the tables
 * have no useful join between them (they are parallel facets of one learner),
 * and issuing them together keeps the shape obvious at the call site.
 */
export async function loadState(db: Db, userId: string): Promise<Store> {
  const [profile, phrases, vocabRows, wordDayRows, appliedRows, news, respond, transcribe] =
    await Promise.all([
      db.from("profiles").select("*").eq("id", userId).maybeSingle(),
      db.from("phrases").select("*").eq("user_id", userId).order("created_at"),
      db.from("vocab").select("*").eq("user_id", userId),
      db.from("word_days").select("*").eq("user_id", userId).order("day", { ascending: false }).limit(KEEP_DAYS),
      db.from("phrase_applied").select("*").eq("user_id", userId).order("day", { ascending: false }).limit(KEEP_DAYS),
      db.from("news_sessions").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(MAX_NEWS_SESSIONS),
      db.from("respond_sessions").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(MAX_RESPOND_SESSIONS),
      db.from("transcribe_sessions").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(MAX_TRANSCRIBE_SESSIONS),
    ]);

  const p = profile.data;
  const phraseRows = phrases.data ?? [];

  const vocab: Vocab = {};
  for (const v of vocabRows.data ?? []) vocab[v.word] = { firstSeen: v.first_seen, count: v.count };

  const wordDays: Record<DayKey, string[]> = {};
  for (const d of wordDayRows.data ?? []) wordDays[d.day] = d.word_ids;

  const phraseApplied: Record<DayKey, number> = {};
  for (const a of appliedRows.data ?? []) phraseApplied[a.day] = a.applications;

  const phraseSrs: Store["phraseSrs"] = {};
  const myLines: Record<string, string> = {};
  for (const row of phraseRows) {
    if (row.srs_box !== null && row.srs_due) {
      phraseSrs[row.slug] = {
        box: row.srs_box,
        due: row.srs_due,
        reps: row.srs_reps,
        last: row.srs_last_reviewed ?? row.srs_due,
      };
    }
    if (row.my_line) myLines[row.slug] = row.my_line;
  }

  return {
    // Kept for shape compatibility with the type; storage version no longer
    // means anything now that the server owns the schema.
    version: 3,
    profile: {
      streak: p?.streak ?? 0,
      longestStreak: p?.longest_streak ?? 0,
      lastWriteDay: p?.last_write_day ?? null,
      freezes: p?.freezes ?? 2,
      totalWords: p?.total_words ?? 0,
      totalEntries: p?.total_entries ?? 0,
      totalMs: p?.total_ms ?? 0,
    },
    settings: {
      name: p?.display_name ?? "",
      wordsPerDay: p?.words_per_day ?? 5,
      sound: p?.sound ?? true,
    },
    vocab,
    phraseSrs,
    phraseApplied,
    minedPhrases: phraseRows.map(toPhrase),
    wordDays,
    myLines,
    newsSessions: (news.data ?? []).map((r) => ({
      id: r.id,
      day: r.day,
      createdAt: Date.parse(r.created_at),
      updatedAt: Date.parse(r.updated_at),
      level: r.level,
      title: r.title,
      source: r.source,
      url: r.url ?? undefined,
      goal: r.goal,
      status: r.status,
      wordsProduced: r.words_produced,
      targetsProduced: r.targets_produced,
      targetsTotal: r.targets_total,
      goalHit: r.goal_hit ?? undefined,
      mission: r.mission,
      messages: r.messages,
      progress: r.progress,
    })),
    respondSessions: (respond.data ?? []).map((r) => ({
      id: r.id,
      day: r.day,
      createdAt: Date.parse(r.created_at),
      updatedAt: Date.parse(r.updated_at),
      source: r.source,
      text: r.source_text,
      turns: r.turns,
      ideas: r.ideas,
      chosenId: r.chosen_id ?? undefined,
      draft: r.draft,
      polish: r.polish ?? undefined,
      status: r.status,
    })),
    transcribeSessions: (transcribe.data ?? []).map((r) => ({
      id: r.id,
      day: r.day,
      createdAt: Date.parse(r.created_at),
      updatedAt: Date.parse(r.updated_at),
      clipId: r.clip_id,
      clip: r.clip,
      chunkSeconds: r.chunk_seconds,
      chunkCount: r.chunk_count,
      cursor: r.cursor,
      results: numericKeys(r.results),
      milestonesPassed: r.milestones_passed,
      status: r.status,
    })),
    newsLevel: p?.news_level ?? "B1",
    hasWritten: p?.has_written ?? false,
  };
}

/** JSONB object keys come back as strings; `ChunkResult` is keyed by index. */
function numericKeys(results: Record<string, ChunkResult>): Record<number, ChunkResult> {
  const out: Record<number, ChunkResult> = {};
  for (const [k, v] of Object.entries(results ?? {})) out[Number(k)] = v;
  return out;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Every mutation the UI can ask for. One shape, so the route stays thin. */
export type StateAction =
  | { type: "updateSettings"; patch: Partial<Settings> }
  | { type: "setLevel"; level: NewsLevel }
  | { type: "issueWordDay"; ids: string[] }
  | { type: "finishWordSession"; sentences: string[]; lines: Record<string, string>; durationMs: number }
  | { type: "reviewPhrases"; ids: string[]; success: boolean }
  | { type: "collectPhrase"; phrase: Phrase }
  | { type: "removePhrase"; id: string }
  | { type: "keepMisheard"; words: { text: string; heard: string }[] }
  | { type: "saveRespondSession"; session: RespondSession }
  | { type: "removeRespondSession"; id: string }
  | { type: "saveTranscribeSession"; session: TranscribeSession }
  | { type: "removeTranscribeSession"; id: string }
  | { type: "reset" };

/**
 * Apply one action, then hand back the fresh state.
 *
 * Returning the whole store rather than a patch keeps the client honest: it
 * never has to guess what a write implied elsewhere (a clean production moves
 * the schedule, the streak and the day's tally at once), and it cannot drift
 * from the server's view.
 */
export async function applyAction(db: Db, userId: string, action: StateAction): Promise<Store> {
  switch (action.type) {
    case "updateSettings": {
      const { name, wordsPerDay, sound } = action.patch;
      await db
        .from("profiles")
        .update({
          ...(name !== undefined ? { display_name: name } : {}),
          ...(wordsPerDay !== undefined ? { words_per_day: wordsPerDay } : {}),
          ...(sound !== undefined ? { sound } : {}),
        })
        .eq("id", userId);
      break;
    }

    case "setLevel":
      await db.from("profiles").update({ news_level: action.level }).eq("id", userId);
      break;

    case "issueWordDay": {
      const day = todayKey();
      // Today's set is drawn once and then fixed — reopening never reshuffles
      // it, so an existing row wins.
      const { data: existing } = await db
        .from("word_days")
        .select("day")
        .eq("user_id", userId)
        .eq("day", day)
        .maybeSingle();
      if (!existing) {
        await db.from("word_days").insert({ user_id: userId, day, word_ids: action.ids });
      }
      break;
    }

    case "finishWordSession": {
      const day = todayKey();
      const text = action.sentences.join("\n");
      const { data: p } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (p) {
        // The streak lives on the daily words: showing up and producing IS the
        // habit. Same pure function the client used to call.
        const streakFields = applyWrite(
          {
            streak: p.streak,
            longestStreak: p.longest_streak,
            lastWriteDay: p.last_write_day,
            freezes: p.freezes,
            totalWords: p.total_words,
            totalEntries: p.total_entries,
            totalMs: p.total_ms,
          },
          day,
        );
        await db
          .from("profiles")
          .update({
            streak: streakFields.streak,
            longest_streak: streakFields.longestStreak,
            last_write_day: streakFields.lastWriteDay,
            freezes: streakFields.freezes,
            total_words: p.total_words + countWords(text),
            total_entries: p.total_entries + 1,
            total_ms: p.total_ms + action.durationMs,
            has_written: true,
          })
          .eq("id", userId);
      }

      await mergeVocabRows(db, userId, tokenize(text), day);

      // Their own sentence per item — the `echo` drill's cue weeks later.
      for (const [slug, line] of Object.entries(action.lines)) {
        if (!line.trim()) continue;
        await db
          .from("phrases")
          .update({ my_line: line.trim().slice(0, 300) })
          .eq("user_id", userId)
          .eq("slug", slug);
      }
      break;
    }

    case "reviewPhrases": {
      if (action.ids.length === 0) break;
      const day = todayKey();
      const { data: rows } = await db
        .from("phrases")
        .select("slug, srs_box, srs_due, srs_reps, srs_last_reviewed")
        .eq("user_id", userId)
        .in("slug", action.ids);

      for (const id of action.ids) {
        const row = rows?.find((r) => r.slug === id);
        const rec = reviewCard(
          row?.srs_box !== null && row?.srs_due
            ? { box: row.srs_box, due: row.srs_due, reps: row.srs_reps, last: row.srs_last_reviewed ?? row.srs_due }
            : undefined,
          action.success,
          day,
        );
        await db
          .from("phrases")
          .update({ srs_box: rec.box, srs_due: rec.due, srs_reps: rec.reps, srs_last_reviewed: rec.last })
          .eq("user_id", userId)
          .eq("slug", id);
      }
      if (action.success) await bumpApplied(db, userId, day, action.ids.length);
      break;
    }

    case "collectPhrase": {
      await upsertPhrase(db, userId, action.phrase);
      break;
    }

    case "removePhrase":
      await db.from("phrases").delete().eq("user_id", userId).eq("slug", action.id);
      break;

    case "keepMisheard": {
      const day = todayKey();
      for (const { text, heard } of action.words) {
        const slug = `tr-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;
        if (slug === "tr-") continue;
        const { data: existing } = await db
          .from("phrases")
          .select("slug, srs_box, srs_due, srs_reps, srs_last_reviewed")
          .eq("user_id", userId)
          .eq("slug", slug)
          .maybeSingle();

        if (existing) {
          // Heard wrong again: once is a slip, twice is a gap — send it back to
          // the front of the queue.
          const rec = reviewCard(
            existing.srs_box !== null && existing.srs_due
              ? { box: existing.srs_box, due: existing.srs_due, reps: existing.srs_reps, last: existing.srs_last_reviewed ?? existing.srs_due }
              : undefined,
            false,
            day,
          );
          await db
            .from("phrases")
            .update({ srs_box: rec.box, srs_due: rec.due, srs_reps: rec.reps, srs_last_reviewed: rec.last })
            .eq("user_id", userId)
            .eq("slug", slug);
          continue;
        }

        await upsertPhrase(db, userId, {
          id: slug,
          text,
          meaning: "",
          example: heard,
          kind: "word",
          captured: { module: "Transcribe", context: heard, day },
        });
      }
      break;
    }

    case "saveRespondSession": {
      const s = action.session;
      await db.from("respond_sessions").upsert(
        {
          id: s.id,
          user_id: userId,
          day: s.day,
          source: s.source,
          source_text: s.text,
          turns: s.turns,
          ideas: s.ideas,
          chosen_id: s.chosenId ?? null,
          draft: s.draft,
          polish: s.polish ?? null,
          status: s.status,
        },
        { onConflict: "id" },
      );
      await prune(db, userId, "respond_sessions", MAX_RESPOND_SESSIONS);
      break;
    }

    case "removeRespondSession":
      await db.from("respond_sessions").delete().eq("user_id", userId).eq("id", action.id);
      break;

    case "saveTranscribeSession": {
      const s = action.session;
      // One session per clip per learner — resuming updates it in place.
      await db.from("transcribe_sessions").upsert(
        {
          user_id: userId,
          day: s.day,
          clip_id: s.clipId,
          clip: s.clip,
          chunk_seconds: s.chunkSeconds,
          chunk_count: s.chunkCount,
          cursor: s.cursor,
          results: s.results as Record<string, ChunkResult>,
          milestones_passed: s.milestonesPassed,
          status: s.status,
        },
        { onConflict: "user_id,clip_id" },
      );
      await prune(db, userId, "transcribe_sessions", MAX_TRANSCRIBE_SESSIONS);
      break;
    }

    case "removeTranscribeSession":
      await db.from("transcribe_sessions").delete().eq("user_id", userId).eq("id", action.id);
      break;

    case "reset": {
      // Everything except the account itself. Profile columns go back to their
      // defaults rather than the row being deleted, since auth.users owns it.
      await Promise.all([
        db.from("phrases").delete().eq("user_id", userId),
        db.from("vocab").delete().eq("user_id", userId),
        db.from("word_days").delete().eq("user_id", userId),
        db.from("phrase_applied").delete().eq("user_id", userId),
        db.from("news_sessions").delete().eq("user_id", userId),
        db.from("respond_sessions").delete().eq("user_id", userId),
        db.from("transcribe_sessions").delete().eq("user_id", userId),
      ]);
      await db
        .from("profiles")
        .update({
          streak: 0,
          longest_streak: 0,
          last_write_day: null,
          freezes: 2,
          total_words: 0,
          total_entries: 0,
          total_ms: 0,
          has_written: false,
        })
        .eq("id", userId);
      break;
    }
  }

  return loadState(db, userId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** First save wins — re-capturing the same phrase keeps its history. */
async function upsertPhrase(db: Db, userId: string, phrase: Phrase): Promise<void> {
  if (!phrase.id || !phrase.text) return;
  await db.from("phrases").upsert(
    {
      user_id: userId,
      slug: phrase.id,
      text: phrase.text,
      meaning: phrase.meaning ?? "",
      example: phrase.example ?? "",
      kind: phrase.kind ?? "phrase",
      register: phrase.register ?? null,
      origin: phrase.origin ?? null,
      alternatives: phrase.alternatives ?? [],
      collocations: phrase.collocations ?? [],
      source: sourceOf(phrase),
      captured_module: phrase.captured?.module ?? null,
      captured_context: phrase.captured?.context ?? null,
      captured_day: phrase.captured?.day ?? null,
    },
    { onConflict: "user_id,slug", ignoreDuplicates: true },
  );
  await prune(db, userId, "phrases", MAX_MINED_PHRASES);
}

/** Vocabulary grows only from words the learner actually wrote. */
async function mergeVocabRows(db: Db, userId: string, tokens: string[], day: DayKey): Promise<void> {
  if (tokens.length === 0) return;
  const counts = new Map<string, number>();
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);

  const { data: existing } = await db
    .from("vocab")
    .select("word, count")
    .eq("user_id", userId)
    .in("word", [...counts.keys()]);
  const seen = new Map((existing ?? []).map((r) => [r.word, r.count]));

  await db.from("vocab").upsert(
    [...counts.entries()].map(([word, n]) => ({
      user_id: userId,
      word,
      first_seen: day,
      count: (seen.get(word) ?? 0) + n,
    })),
    { onConflict: "user_id,word" },
  );
}

/** Record `n` clean applications on `day`. */
async function bumpApplied(db: Db, userId: string, day: DayKey, n: number): Promise<void> {
  const { data } = await db
    .from("phrase_applied")
    .select("applications")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  await db
    .from("phrase_applied")
    .upsert({ user_id: userId, day, applications: (data?.applications ?? 0) + n }, { onConflict: "user_id,day" });
}

/**
 * Keep a per-user table bounded, oldest first. The client used to do this with
 * `.slice()` on an array; here it is a delete of whatever falls past the tail.
 */
async function prune(
  db: Db,
  userId: string,
  table: "phrases" | "respond_sessions" | "transcribe_sessions",
  keep: number,
): Promise<void> {
  const { data } = await db
    .from(table)
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(keep, keep + 200);
  const doomed = (data ?? []).map((r) => r.id);
  if (doomed.length > 0) await db.from(table).delete().eq("user_id", userId).in("id", doomed);
}
