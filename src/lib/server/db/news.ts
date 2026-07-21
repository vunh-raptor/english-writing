import "server-only";
import type {
  ChatMessage,
  Mission,
  MissionProgress,
  NewsLevel,
  NewsSession,
  Phrase,
  SrsRecord,
} from "@/types";
import { reviewCard } from "@/lib/shared/srs";
import { todayKey } from "@/lib/shared/date";
import { supabaseAdmin } from "../supabase";
import type { Database, NewsSessionRow, PhraseRow } from "./types";

/**
 * Server-side persistence for the News Chat learning data — the `/news` slice
 * of the Supabase phase. A faithful port of the localStorage contracts in
 * src/store/StoreContext.tsx (`saveNewsSession`, `saveMissionOutcome`) plus the
 * reads the /news dashboard needs, now backed by Postgres.
 *
 * Every function takes an explicit `userId` and scopes every query by it — the
 * seam this waits on is Auth (`getUserId()` in ../supabase). Business logic is
 * NOT re-implemented here: the Leitner scheduler (lib/shared/srs) and day math
 * (lib/shared/date) are isomorphic and reused directly, so the server and the
 * client can never drift.
 */

type NewsSessionInsert = Database["public"]["Tables"]["news_sessions"]["Insert"];
type NewsSessionUpdate = Database["public"]["Tables"]["news_sessions"]["Update"];
type PhraseInsert = Database["public"]["Tables"]["phrases"]["Insert"];

/** Keep saved conversations bounded, newest-first (mirrors StoreContext). */
const MAX_NEWS_SESSIONS = 40;

/** A saved conversation to create or update — mirrors StoreContext's input. */
export interface NewsSessionInput {
  /** Omit for a brand-new session (the DB mints a uuid); pass to update/resume. */
  id?: string;
  mission: Mission;
  messages: ChatMessage[];
  progress: MissionProgress;
  status: "active" | "complete";
  /** Only meaningful when status is "complete". */
  goalHit?: boolean;
}

/** What a finished mission hands persistence — mirrors StoreContext's outcome. */
export interface MissionOutcomeInput {
  /** The mission's targets with their final verdicts. */
  targets: { phrase: Phrase; verdict: "produced" | "assisted" | "missed" }[];
  /** Bonus phrases worth keeping from the chat. */
  keep: Phrase[];
  /** Rolling level, persisted so tomorrow's mission is planned at it. */
  level: NewsLevel;
  /** Optional link back to the session these phrases were minted in. */
  sessionId?: string;
}

/** Count targets produced or produced-with-help — the phrase tally. */
function countProduced(progress: MissionProgress): number {
  return Object.values(progress.targets).filter(
    (s) => s === "produced" || s === "assisted",
  ).length;
}

// --- Row ⇆ domain mappers --------------------------------------------------

function rowToNewsSession(row: NewsSessionRow): NewsSession {
  return {
    id: row.id,
    day: row.day,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    level: row.level,
    title: row.title,
    source: row.source,
    url: row.url ?? undefined,
    goal: row.goal,
    status: row.status,
    wordsProduced: row.words_produced,
    targetsProduced: row.targets_produced,
    targetsTotal: row.targets_total,
    goalHit: row.goal_hit ?? undefined,
    mission: row.mission,
    messages: row.messages,
    progress: row.progress,
  };
}

function rowToPhrase(row: PhraseRow): Phrase {
  return {
    id: row.slug,
    text: row.text,
    meaning: row.meaning,
    example: row.example,
    register: row.register ?? undefined,
    origin: row.origin ?? undefined,
    alternatives: row.alternatives.length > 0 ? row.alternatives : undefined,
    kind: row.kind,
    collocations: row.collocations.length > 0 ? row.collocations : undefined,
  };
}

/** A NULL box means "new, never scheduled" — no record, which srs treats as due. */
function srsFromRow(row: PhraseRow): SrsRecord | undefined {
  if (row.srs_box === null || row.srs_due === null || row.srs_last_reviewed === null) {
    return undefined;
  }
  return {
    box: row.srs_box,
    due: row.srs_due,
    reps: row.srs_reps,
    last: row.srs_last_reviewed,
  };
}

function phraseInsert(userId: string, p: Phrase, sessionId?: string): PhraseInsert {
  return {
    user_id: userId,
    // Phrase.id is already the content-derived slug (phraseId in NewsChat.tsx).
    slug: p.id,
    text: p.text,
    meaning: p.meaning ?? "",
    example: p.example ?? "",
    // Explicit kind when known; else a gap marks a pattern, otherwise phrase.
    kind: p.kind ?? (p.text.includes("___") ? "pattern" : "phrase"),
    register: p.register ?? null,
    origin: p.origin ?? null,
    alternatives: p.alternatives ?? [],
    collocations: p.collocations ?? [],
    source: "news",
    source_session_id: sessionId ?? null,
  };
}

// --- Rolling level (profiles.news_level) -----------------------------------

/** The learner's rolling News Chat level; defaults to B1 before any session. */
export async function getNewsLevel(userId: string): Promise<NewsLevel> {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("news_level")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.news_level ?? "B1";
}

/** Persist the rolling level (self-heals a missing profile row via upsert). */
export async function setNewsLevel(userId: string, level: NewsLevel): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("profiles")
    .upsert({ id: userId, news_level: level }, { onConflict: "id" });
  if (error) throw error;
}

// --- Saved conversations ----------------------------------------------------

/** The dashboard's recent list — newest first, bounded. */
export async function listNewsSessions(
  userId: string,
  limit = MAX_NEWS_SESSIONS,
): Promise<NewsSession[]> {
  const { data, error } = await supabaseAdmin()
    .from("news_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(rowToNewsSession);
}

/** The single unfinished conversation the dashboard's resume card offers. */
export async function getActiveNewsSession(userId: string): Promise<NewsSession | null> {
  const { data, error } = await supabaseAdmin()
    .from("news_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToNewsSession(data) : null;
}

/**
 * Create or update a saved conversation (keyed by id). Mirrors StoreContext's
 * `saveNewsSession`: `goal_hit` is only written when the session completes with
 * a known result, and is otherwise left untouched so a resume never erases it.
 */
export async function upsertNewsSession(
  userId: string,
  input: NewsSessionInput,
): Promise<NewsSession> {
  const db = supabaseAdmin();
  const { mission, progress } = input;

  const base = {
    user_id: userId,
    day: mission.day,
    level: mission.level,
    title: mission.title,
    source: mission.source,
    url: mission.url ?? null,
    goal: mission.goal,
    status: input.status,
    words_produced: progress.wordsProduced,
    targets_produced: countProduced(progress),
    targets_total: mission.targets.length,
    mission,
    messages: input.messages,
    progress,
  };

  // Set goal_hit only when it's definitely known (completing with a result).
  const goalHitToSet =
    input.status === "complete" && typeof input.goalHit === "boolean"
      ? input.goalHit
      : undefined;

  // Update-then-insert rather than a blind upsert: the service-role client
  // bypasses RLS, so we scope by (id, user_id) to be certain we never write
  // across accounts.
  if (input.id) {
    const patch: NewsSessionUpdate = { ...base };
    if (goalHitToSet !== undefined) patch.goal_hit = goalHitToSet;
    const { data, error } = await db
      .from("news_sessions")
      .update(patch)
      .eq("id", input.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (data) return rowToNewsSession(data);
    // No such row (first save of a client-created id) — fall through to insert.
  }

  const insert: NewsSessionInsert = {
    ...base,
    ...(input.id ? { id: input.id } : {}),
    goal_hit: goalHitToSet ?? null,
  };
  const { data, error } = await db.from("news_sessions").insert(insert).select().single();
  if (error) throw error;

  // A new row may push us over the cap — trim the oldest.
  await pruneNewsSessions(userId);

  return rowToNewsSession(data);
}

/** Drop conversations beyond the newest `MAX_NEWS_SESSIONS`. */
async function pruneNewsSessions(userId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("news_sessions")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(MAX_NEWS_SESSIONS, MAX_NEWS_SESSIONS + 999);
  if (error) throw error;
  const staleIds = (data ?? []).map((r) => r.id);
  if (staleIds.length > 0) {
    await db.from("news_sessions").delete().in("id", staleIds).eq("user_id", userId);
  }
}

// --- Mission outcome → phrase library + SRS + level -------------------------

/**
 * Fold a finished mission into the learner's durable data — the loop that makes
 * News Chat a curriculum (NEWS_CHAT_V2.md §9). Mirrors StoreContext's
 * `saveMissionOutcome`:
 *   - every target + kept phrase joins the library, deduped by slug (first wins);
 *   - a cleanly produced target earns an SRS interval; an assisted/missed target
 *     with a prior record lapses (back to due-today); a brand-new one is left
 *     unscheduled, which srs reads as "due today" so the Phrase Coach takes it up;
 *   - the rolling level is persisted for tomorrow's plan.
 */
export async function saveMissionOutcome(
  userId: string,
  outcome: MissionOutcomeInput,
): Promise<void> {
  const db = supabaseAdmin();
  const today = todayKey();

  // 1. Library: insert new phrases, keep the first saved version of any repeat.
  const seen = new Set<string>();
  const rows: PhraseInsert[] = [];
  for (const p of [...outcome.targets.map((t) => t.phrase), ...outcome.keep]) {
    if (!p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    rows.push(phraseInsert(userId, p, outcome.sessionId));
  }
  if (rows.length > 0) {
    const { error } = await db
      .from("phrases")
      .upsert(rows, { onConflict: "user_id,slug", ignoreDuplicates: true });
    if (error) throw error;
  }

  // 2. SRS: read the (now-present) target rows, schedule per verdict.
  const targetSlugs = outcome.targets.map((t) => t.phrase.id).filter(Boolean);
  if (targetSlugs.length > 0) {
    const { data, error } = await db
      .from("phrases")
      .select("*")
      .eq("user_id", userId)
      .in("slug", targetSlugs);
    if (error) throw error;
    const bySlug = new Map((data ?? []).map((r) => [r.slug, r]));

    for (const { phrase, verdict } of outcome.targets) {
      if (!phrase.id) continue;
      const row = bySlug.get(phrase.id);
      const prev = row ? srsFromRow(row) : undefined;

      let next: SrsRecord | undefined;
      if (verdict === "produced") {
        next = reviewCard(prev, true, today); // earns an interval
      } else if (prev) {
        next = reviewCard(prev, false, today); // lapse → due now
      } else {
        continue; // new + not produced → stays unscheduled (due today)
      }

      const { error: upErr } = await db
        .from("phrases")
        .update({
          srs_box: next.box,
          srs_due: next.due,
          srs_reps: next.reps,
          srs_last_reviewed: next.last,
        })
        .eq("user_id", userId)
        .eq("slug", phrase.id);
      if (upErr) throw upErr;
    }
  }

  // 3. Rolling level for tomorrow's mission.
  await setNewsLevel(userId, outcome.level);
}

/** The learner's phrase library (newest first) — the output of the loop above. */
export async function listPhrases(userId: string): Promise<Phrase[]> {
  const { data, error } = await supabaseAdmin()
    .from("phrases")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToPhrase);
}
