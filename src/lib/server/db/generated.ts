import "server-only";
import type { Db } from "@/lib/server/supabase";

/**
 * The generated-material ledger (`ai_content`).
 *
 * Practice material used to be ephemeral: every reload rebuilt today's rounds
 * from scratch, so the moment a learner was halfway through answering could
 * change under them, and afterwards nobody — not the learner, not us — could
 * say what they had actually been asked. Keeping it fixes both, and makes the
 * row the record of what the app taught.
 *
 * `remember` is the whole API most callers need: read-through, keyed by what
 * the material is *for*, and versioned by the prompt that built it so a prompt
 * change invalidates its own cache instead of serving yesterday's shape.
 */

/**
 * A short, stable key for a long input (a word set, a passage).
 *
 * `content_key` is bounded at 200 characters, and both the read and the write
 * truncate to it — which is consistent, but means two different ten-word sets
 * sharing a prefix would collide and serve each other's material. Hashing
 * first removes the possibility rather than making it unlikely.
 */
export function contentDigest(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}.${input.length.toString(36)}`;
}

export interface ContentKey {
  /** What was generated: "word_rounds", "drill_rounds", "milestone", … */
  kind: string;
  /** What it was generated FOR: a day, a session id, a passage hash. */
  key: string;
  /** Which prompt built it — a change here misses the cache, by design. */
  version: string;
}

/** The stored payload, or null when there is nothing for this exact key. */
export async function readGenerated<T>(
  db: Db,
  userId: string,
  { kind, key, version }: ContentKey,
): Promise<T | null> {
  const { data } = await db
    .from("ai_content")
    .select("payload, prompt_version")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("content_key", key.slice(0, 200))
    .maybeSingle();

  if (!data || data.prompt_version !== version) return null;
  return data.payload as T;
}

/** Store (or replace) the material for one key. */
export async function writeGenerated<T>(
  db: Db,
  userId: string,
  { kind, key, version }: ContentKey,
  payload: T,
): Promise<void> {
  await db.from("ai_content").upsert(
    {
      user_id: userId,
      kind,
      content_key: key.slice(0, 200),
      prompt_version: version,
      payload: payload as unknown,
    },
    { onConflict: "user_id,kind,content_key" },
  );
}

/**
 * Return the stored material for this key, or build it once and store it.
 *
 * A failure to *store* is swallowed deliberately: the learner already has their
 * material at that point, and losing the cache write is a worse reason to fail
 * a session than any benefit of surfacing it. A failure to *build* propagates —
 * that one the learner needs to know about.
 */
export async function remember<T>(
  db: Db,
  userId: string,
  key: ContentKey,
  build: () => Promise<T>,
): Promise<T> {
  const cached = await readGenerated<T>(db, userId, key);
  if (cached) return cached;

  const fresh = await build();
  try {
    await writeGenerated(db, userId, key, fresh);
  } catch (e) {
    console.warn(`[ai_content] could not store ${key.kind}/${key.key}:`, e);
  }
  return fresh;
}
