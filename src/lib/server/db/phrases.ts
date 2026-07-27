import "server-only";
import type { Phrase, WordSeed } from "@/types";
import { supabaseAdmin } from "../supabase";
import type { Database } from "./types";

/**
 * Server-side persistence for the shared lexical library — the DB mirror of
 * the client's `collectPhrase` (src/store/StoreContext.tsx), for both of its
 * producers: Phrasebook captures and met daily words. Ready to wire, same as
 * db/news.ts: nothing calls it until Supabase Auth provides a userId; the live
 * app keeps the guest-first localStorage path.
 */

type PhraseInsert = Database["public"]["Tables"]["phrases"]["Insert"];

/**
 * Save one captured highlight into the learner's phrase library, deduped by
 * content slug (first save wins — matches the client). Left unscheduled
 * (srs_box NULL = due today), so the drill and the Phrase Coach pick it up
 * immediately.
 */
export async function saveCapturedPhrase(
  userId: string,
  phrase: Phrase,
  context?: string,
): Promise<void> {
  if (!phrase.id || !phrase.text) return;
  const row: PhraseInsert = {
    user_id: userId,
    slug: phrase.id,
    text: phrase.text,
    meaning: phrase.meaning ?? "",
    example: phrase.example ?? "",
    kind: phrase.kind ?? (phrase.text.includes("___") ? "pattern" : "phrase"),
    register: phrase.register ?? null,
    origin: phrase.origin ?? null,
    alternatives: phrase.alternatives ?? [],
    collocations: phrase.collocations ?? [],
    source: "captured",
    captured_context: context?.slice(0, 240) ?? phrase.captured?.context ?? null,
  };
  const { error } = await supabaseAdmin()
    .from("phrases")
    .upsert(row, { onConflict: "user_id,slug", ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * Enroll a curated daily word the learner has just used in their own sentence
 * (docs/DAILY_WORDS.md). The curriculum id is the slug, so a word dedupes
 * across surfaces — if they'd already highlighted it in a News Chat, the first
 * save keeps its history. Left unscheduled (srs_box NULL = due today); the
 * caller applies `reviewCard` when the use was clean.
 */
export async function saveDailyWord(userId: string, seed: WordSeed): Promise<void> {
  const row: PhraseInsert = {
    user_id: userId,
    slug: seed.id,
    text: seed.word,
    meaning: seed.meaning,
    example: seed.example,
    kind: "word",
    collocations: seed.collocations,
    source: "daily",
    captured_context: seed.example,
  };
  const { error } = await supabaseAdmin()
    .from("phrases")
    .upsert(row, { onConflict: "user_id,slug", ignoreDuplicates: true });
  if (error) throw error;
}

/** Drop a phrase (and its folded-in schedule) from the learner's library. */
export async function deletePhrase(userId: string, slug: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("phrases")
    .delete()
    .eq("user_id", userId)
    .eq("slug", slug);
  if (error) throw error;
}
