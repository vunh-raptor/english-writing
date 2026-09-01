import { NextResponse } from "next/server";
import { wordRounds } from "@/lib/server/words";
import { aiConfigured } from "@/lib/server/ai";
import { ensureCatalog } from "@/lib/server/curriculum";
import { contentDigest, remember } from "@/lib/server/db/generated";
import { loadState } from "@/lib/server/db/state";
import {
  aiUnavailable,
  requestContext,
  unauthorized,
  upstreamFailed,
} from "@/lib/server/request";
import { VERSION as ROUNDS_VERSION } from "@/lib/server/prompts/words";
import { buildDaySet } from "@/lib/shared/words";
import { todayKey } from "@/lib/shared/date";
import type { WordRound, WordSeed } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Today's daily-words session, resolved server-side end to end.
 *
 * This used to be a thin "here are five words, write me some moments" call: the
 * client held the curriculum, drew the day's set from it, and asked only for
 * the tailored rungs. There is no client-side curriculum any more, so the whole
 * decision moved here — which words are due, whether the queue needs topping
 * up, and what each word's round looks like.
 *
 * The rounds are remembered per day (`ai_content`), so reopening the tab
 * mid-session shows the same moments the learner was halfway through answering
 * rather than a fresh set they have never seen.
 */
export async function POST() {
  if (!aiConfigured()) return aiUnavailable();

  try {
    // Context construction reads the learner snapshot from several tables. Keep
    // it inside the route's error boundary too: a transient Data API failure (or
    // an unapplied migration) must still produce our JSON error contract rather
    // than Next's HTML 500 page, which the client cannot decode.
    const ctx = await requestContext();
    if (!ctx) return unauthorized();

    const { db, userId, snapshot } = ctx;
    const day = todayKey();

    // Two batched reads rather than one: `loadState` is the tested seam for the
    // whole store and `loadSnapshot` for the prompt context, and they want
    // different slices. Both issue their queries in parallel, so this is two
    // round trips, not eighteen — and it happens once, when a session opens.
    const store = await loadState(db, userId);
    const met = new Set(store.minedPhrases.map((p) => p.id));

    // Top the queue up before drawing, so a learner whose curriculum has run
    // low never sees a short day.
    const catalog = await ensureCatalog(db, userId, snapshot, met, store.settings.wordsPerDay);

    const daySet = buildDaySet({
      catalog,
      wordDays: store.wordDays,
      pool: store.minedPhrases,
      srs: store.phraseSrs,
      level: store.newsLevel,
      perDay: store.settings.wordsPerDay,
      today: day,
    });

    // Reviews come from the pool; they carry the same shape as new words, so
    // one round-builder call covers the whole session.
    const byId = new Map(catalog.map((w) => [w.id, w]));
    const reviewSeeds = daySet.reviews
      .map((p) => byId.get(p.id))
      .filter((w): w is WordSeed => !!w);
    const words = [...daySet.remainingNew, ...reviewSeeds];

    if (words.length === 0) {
      return NextResponse.json({ words: [], rounds: [], todaysNew: daySet.todaysNew });
    }

    const rounds = await remember<WordRound[]>(
      db,
      userId,
      {
        kind: "word_rounds",
        key: `${day}:${contentDigest(words.map((w) => w.id).join(","))}`,
        version: ROUNDS_VERSION,
      },
      () =>
        wordRounds(
          snapshot,
          words.map((w) => ({
            id: w.id,
            word: w.word,
            pos: w.pos,
            meaning: w.meaning,
            collocations: w.collocations,
          })),
        ),
    );

    return NextResponse.json({ words, rounds, todaysNew: daySet.todaysNew });
  } catch (e) {
    return upstreamFailed(e, "Couldn't build today's words — try again.");
  }
}
