import "server-only";
import type { NewsLevel, TranscribeClip } from "@/types";
import type { Db } from "./supabase";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { extractObject, str } from "@/lib/shared/modelJson";
import { clipDuration, cueProse } from "@/lib/shared/clips";
import { countWords } from "@/lib/shared/stats";
import { rawComplete } from "./ai";
import { SYSTEM, VERSION, user as clipUser } from "./prompts/listening";

/**
 * Listening passages, written for one learner (docs/TRANSCRIBE.md).
 *
 * Transcribe used to ship three hand-written clips. Three clips is a week of
 * material; after that the mode was finished. Passages are now generated at the
 * learner's band, about subjects they have shown they engage with, and stored
 * whole — prose *and* the cues derived from it — so a half-finished clip always
 * scores against exactly the text it played.
 *
 * Generated clips carry no `videoId`, so the browser's own voice reads them and
 * the UI labels them honestly as read-aloud. Pasting a real YouTube link is
 * still the other half of the mode and is untouched by this.
 */

/** How many stored passages a learner is offered at once. */
const LIBRARY_SIZE = 3;
/** A passage this short has nothing to transcribe; this long is a slog. */
const MIN_WORDS = 150;
const MAX_WORDS = 900;
/** Sane bounds for a read-aloud rate, whatever the model suggests. */
const MIN_WPM = 110;
const MAX_WPM = 190;

function toClip(row: {
  slug: string;
  title: string;
  source: string;
  level: NewsLevel;
  blurb: string;
  cues: TranscribeClip["cues"];
  duration: number;
}): TranscribeClip {
  return {
    id: row.slug,
    title: row.title,
    source: row.source,
    level: row.level,
    blurb: row.blurb,
    duration: row.duration,
    cues: row.cues ?? [],
  };
}

/** The learner's stored passages, newest first. */
export async function loadClips(db: Db, userId: string): Promise<TranscribeClip[]> {
  const { data } = await db
    .from("listening_clips")
    .select("slug, title, source, level, blurb, cues, duration")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(LIBRARY_SIZE * 4);
  return (data ?? []).map(toClip);
}

/** `Why the reefs turn white` → `clip-why-the-reefs-turn-white`, deduped. */
function clipSlug(title: string, taken: Set<string>): string {
  const base = `clip-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}`;
  let slug = base === "clip-" ? "clip" : base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

/**
 * Write one passage, cue it, and store it.
 *
 * The prose is the only thing the model is asked for; the cues are derived from
 * it in code. Asking for timings gets you a transcript and a clock that
 * disagree, and the chunk cut trusts the clock.
 */
export async function generateClip(
  db: Db,
  userId: string,
  snapshot: LearnerSnapshot,
  level: NewsLevel,
  taken: Set<string>,
): Promise<TranscribeClip> {
  const raw = await rawComplete(SYSTEM, clipUser(snapshot, level), 1600, 0.8);
  const obj = extractObject(raw);
  if (!obj) throw new Error("Couldn't write you a passage just now — try again.");

  const prose = str(obj.prose);
  const words = countWords(prose);
  if (words < MIN_WORDS || words > MAX_WORDS) {
    throw new Error("Couldn't write you a passage just now — try again.");
  }

  const title = str(obj.title) || "Your passage";
  const wpm = Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(Number(obj.wpm)) || 150));
  const cues = cueProse(prose, wpm);
  if (cues.length === 0) throw new Error("Couldn't write you a passage just now — try again.");

  const slug = clipSlug(title, taken);
  const clip: TranscribeClip = {
    id: slug,
    title,
    // Honest attribution: a written-for-you passage says so rather than
    // borrowing the authority of a programme that never made it.
    source: str(obj.source) || "Written for you · narration",
    level,
    blurb: str(obj.blurb),
    duration: clipDuration(cues),
    cues,
  };

  const { error } = await db.from("listening_clips").insert({
    user_id: userId,
    slug,
    title: clip.title,
    source: clip.source,
    level,
    blurb: clip.blurb,
    wpm,
    prose,
    cues,
    duration: clip.duration,
  });
  if (error) console.warn("[listening] could not store clip:", error.message);

  return clip;
}

/**
 * The learner's listening library, topped up to `LIBRARY_SIZE` if it is short.
 *
 * Only ever generates ONE passage per call, even from empty: a first visit that
 * fired three AI calls before showing anything would be a thirty-second blank
 * screen, and one passage is already a session's work.
 */
export async function ensureClips(
  db: Db,
  userId: string,
  snapshot: LearnerSnapshot,
  level: NewsLevel,
): Promise<TranscribeClip[]> {
  const clips = await loadClips(db, userId);
  if (clips.length >= LIBRARY_SIZE) return clips;

  const taken = new Set(clips.map((c) => c.id));
  const fresh = await generateClip(db, userId, snapshot, level, taken);
  return [fresh, ...clips];
}

/** The prompt behind the stored passages — surfaced for the content ledger. */
export { VERSION as CLIP_PROMPT_VERSION };
