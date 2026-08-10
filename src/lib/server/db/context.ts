import "server-only";
import type { DayKey, NewsLevel } from "@/types";
import type { Db } from "@/lib/server/supabase";
import { emptySnapshot, type LearnerSnapshot } from "@/lib/shared/prompt";
import { todayKey } from "@/lib/shared/date";

/**
 * The learner, as a prompt sees them.
 *
 * Every generation job in the app now reads this instead of being handed a bare
 * CEFR letter. That is the whole point of storing what people produce: a word
 * list, a practice moment or a listening passage written against *this* record
 * — these words are already known, that construction keeps breaking, these are
 * the subjects they choose — is a different object from one written against
 * "B1".
 *
 * Cost is deliberately bounded. One `Promise.all` of six narrow, indexed reads,
 * every one of them capped, and the result is loaded ONCE per request and
 * passed down to whichever prompts want it. The renderer
 * (`lib/shared/prompt.ts`) then takes only the facets a given job will actually
 * use, so a judging call doesn't pay for a curriculum's worth of context.
 */

/** Read caps. Roomy enough to be evidence, tight enough to stay cheap. */
const LIMITS = {
  /** Items they have met. The don't-teach-this-again list, so it is the big one. */
  known: 120,
  due: 20,
  recent: 8,
  /** Missed productions scanned for the "keeps going wrong" list. */
  misses: 24,
  topics: 8,
  /** Most recently generated curriculum entries, for the semantic-field spread. */
  fields: 24,
} as const;

export async function loadSnapshot(
  db: Db,
  userId: string,
  day: DayKey = todayKey(),
): Promise<LearnerSnapshot> {
  const [profile, phrases, due, productions, misses, news, respond, fields] = await Promise.all([
    db.from("profiles").select("news_level, streak, total_entries").eq("id", userId).maybeSingle(),
    db
      .from("phrases")
      .select("slug, text")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(LIMITS.known),
    db
      .from("phrases")
      .select("text")
      .eq("user_id", userId)
      .lte("srs_due", day)
      .order("srs_box")
      .limit(LIMITS.due),
    db
      .from("productions")
      .select("text, verdict, mode")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(LIMITS.recent),
    db
      .from("productions")
      .select("item_slug")
      .eq("user_id", userId)
      .eq("verdict", "missed")
      .not("item_slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(LIMITS.misses),
    db
      .from("news_sessions")
      .select("title")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(LIMITS.topics),
    db
      .from("respond_sessions")
      .select("source")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(LIMITS.topics),
    db
      .from("word_items")
      .select("field")
      .eq("user_id", userId)
      .order("rank", { ascending: false })
      .limit(LIMITS.fields),
  ]);

  const p = profile.data;
  const known = phrases.data ?? [];
  const bySlug = new Map(known.map((r) => [r.slug, r.text]));

  // A slug is only useful to a model as the thing it names, so a miss resolves
  // through the pool; an item since deleted degrades to its readable stem
  // rather than disappearing (it is still where production broke down).
  const struggles = dedupe(
    (misses.data ?? [])
      .map((r) => (r.item_slug ? bySlug.get(r.item_slug) ?? readableSlug(r.item_slug) : ""))
      .filter(Boolean),
  );

  const topics = dedupe([
    ...(news.data ?? []).map((r) => r.title),
    ...(respond.data ?? []).map((r) => r.source?.title ?? ""),
  ]);

  return {
    ...emptySnapshot((p?.news_level as NewsLevel) ?? "B1", day),
    streak: p?.streak ?? 0,
    totalEntries: p?.total_entries ?? 0,
    known: known.map((r) => r.text).filter(Boolean),
    due: (due.data ?? []).map((r) => r.text).filter(Boolean),
    recent: (productions.data ?? []).map((r) => ({
      text: r.text,
      verdict: r.verdict,
      ...(r.mode ? { mode: r.mode } : {}),
    })),
    struggles,
    topics,
    fields: dedupe((fields.data ?? []).map((r) => r.field).filter(Boolean)),
  };
}

/** `w-run-out-of` → `run out of`. The stem a deleted item still reads as. */
function readableSlug(slug: string): string {
  return slug.replace(/^(?:w|tr|p)-/, "").replace(/-/g, " ").trim();
}

/** Order-preserving, case-insensitive dedupe. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v.trim());
  }
  return out;
}
