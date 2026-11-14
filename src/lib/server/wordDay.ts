import "server-only";
import type { TalkEntry, WordDay, WordDayItem, WordSeed } from "@/types";
import type { RequestContext } from "./request";
import { readGenerated, writeGenerated } from "./db/generated";
import { loadState, mutate } from "./db/state";
import { ensureCatalog } from "./curriculum";
import { wordRounds, wordTurn } from "./words";
import { todayKey } from "@/lib/shared/date";
import {
  TALK_ASKS_NEW,
  TALK_ASKS_REVIEW,
  bridgePair,
  buildDaySet,
  judgeBridge,
  talkApply,
  talkCanLeave,
  talkDone,
  talkOutcome,
  talkStart,
  turnLedgerVerdict,
  wordToPhrase,
} from "@/lib/shared/words";

/**
 * Today's Daily Words session, owned by the server (docs/DAILY_WORDS.md).
 *
 * The session used to live in the browser tab. Leaving the page threw the
 * conversation away, reopening it regenerated the script, and a word that was
 * practised "with help" — which correctly stays due — was dealt again the same
 * afternoon, from zero. A learner said, fairly, that they thought it was saved.
 *
 * Now the whole day is one document: the words, the script for each, every
 * line said, and what is finished. Every move goes through this module, which
 * applies the pure rules in `lib/shared/words`, records the sentence, moves the
 * schedule, and saves the document — so what the learner sees after a reload is
 * exactly what they left.
 *
 * It is stored in `ai_content` under kind `word_day`, one row per learner per
 * day. That table already means "what the app generated for this learner and
 * showed them, kept"; the day's script is exactly that, and its progress rides
 * along with it. The sentences themselves stay in `productions`, which remains
 * the ledger.
 */

const KIND = "word_day";
/** Bump to abandon stored days whose shape no longer matches `WordDay`. */
const VERSION = "word_day.v1";
/** A session left open overnight is not eight hours of practice. */
const MAX_SESSION_MS = 2 * 60 * 60 * 1000;

function keyFor(day: string) {
  return { kind: KIND, key: day, version: VERSION };
}

/** Today's stored session, or null when it has not been opened yet. */
export async function readDay(ctx: RequestContext): Promise<WordDay | null> {
  return readGenerated<WordDay>(ctx.db, ctx.userId, keyFor(todayKey()));
}

async function saveDay(ctx: RequestContext, day: WordDay): Promise<void> {
  await writeGenerated(ctx.db, ctx.userId, keyFor(day.day), day);
}

/**
 * Open today's session: resume it if it exists, otherwise build it once.
 *
 * Building is the only slow, fallible step (it generates), and it happens at
 * most once a day. A day with nothing due comes back with no items and is not
 * stored, so words that become due later the same day can still open one.
 */
export async function openDay(ctx: RequestContext): Promise<WordDay> {
  const existing = await readDay(ctx);
  if (existing) return existing;

  const { db, userId, snapshot } = ctx;
  const day = todayKey();
  const store = await loadState(db, userId);
  const met = new Set(store.minedPhrases.map((p) => p.id));

  // Top the queue up before drawing, so a learner whose curriculum has run low
  // never sees a short day.
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

  const byId = new Map(catalog.map((w) => [w.id, w]));
  const reviews = daySet.reviews.map((p) => byId.get(p.id)).filter((w): w is WordSeed => !!w);
  // Reviews first: a warm, winnable start before the unfamiliar words.
  const seeds = [...reviews, ...daySet.remainingNew];

  const empty: WordDay = { day, items: [], startedAt: Date.now(), bridge: null, finishedAt: null };
  if (seeds.length === 0) return empty;

  const rounds = await wordRounds(
    snapshot,
    seeds.map((w) => ({
      id: w.id,
      word: w.word,
      pos: w.pos,
      meaning: w.meaning,
      collocations: w.collocations,
    })),
  );
  const roundById = new Map(rounds.map((r) => [r.id, r]));
  const reviewIds = new Set(reviews.map((w) => w.id));

  const items: WordDayItem[] = [];
  for (const seed of seeds) {
    const round = roundById.get(seed.id);
    if (!round) continue; // no script survived the checks — it waits for tomorrow
    const isNew = !reviewIds.has(seed.id);
    // A round whose follow-ups didn't survive is a shorter conversation, never
    // a padded one.
    const asks: WordDayItem["asks"] = [
      { said: round.setup, task: round.task },
      ...(round.followups ?? []).map((said) => ({ said })),
    ].slice(0, isNew ? TALK_ASKS_NEW : TALK_ASKS_REVIEW);
    const examples = [...round.examples, seed.example]
      .filter((e) => e && e.trim())
      .filter((e, n, arr) => arr.findIndex((x) => x.trim() === e.trim()) === n)
      .slice(0, 3);
    items.push({
      seed,
      isNew,
      prevBox: store.phraseSrs[seed.id]?.box ?? 0,
      asks,
      examples,
      talk: talkStart(asks.length),
      thread: [{ t: "said", text: asks[0].said, task: asks[0].task }],
      outcome: null,
    });
  }
  if (items.length === 0) throw new Error("Couldn't build today's words — try again.");

  // Fix today's set, so tomorrow's draw knows what today already issued.
  await mutate(db, userId, { type: "issueWordDay", ids: daySet.todaysNew.map((w) => w.id) });

  const built: WordDay = { ...empty, items };
  await saveDay(ctx, built);
  return built;
}

/** The stored day and the open item a move is about, or a reason it can't be made. */
async function openItem(
  ctx: RequestContext,
  wordId: string,
): Promise<{ day: WordDay; item: WordDayItem }> {
  const day = await readDay(ctx);
  if (!day) throw new MoveError("Today's session isn't open yet.");
  const item = day.items.find((i) => i.seed.id === wordId);
  if (!item) throw new MoveError("That word isn't in today's set.");
  if (item.outcome !== null) throw new MoveError("That word is already finished for today.");
  return { day, item };
}

/** A move the learner's own state rules out — a 409, not a server fault. */
export class MoveError extends Error {}

/**
 * A word's conversation is over: schedule it honestly.
 *
 * Clean → an earned interval. Helped → no change, so it stays due. Missed → a
 * first meeting is never punished; a review lapses.
 */
async function closeItem(ctx: RequestContext, day: WordDay, item: WordDayItem): Promise<void> {
  const { db, userId } = ctx;
  item.outcome = talkOutcome(item.talk);

  // A new word joins the library once its conversation has happened — that's
  // when it stops being the app's word and starts being theirs.
  if (item.isNew) {
    await mutate(db, userId, { type: "collectPhrase", phrase: wordToPhrase(item.seed, day.day) });
  }
  if (item.outcome === "clean") {
    await mutate(db, userId, { type: "reviewPhrases", ids: [item.seed.id], success: true });
  } else if (item.outcome === "missed" && !item.isNew) {
    await mutate(db, userId, { type: "reviewPhrases", ids: [item.seed.id], success: false });
  }
}

/** Send one sentence in a word's conversation. Returns the day as it now stands. */
export async function dayTurn(
  ctx: RequestContext,
  wordId: string,
  sentence: string,
): Promise<WordDay> {
  const { day, item } = await openItem(ctx, wordId);
  const ask = item.asks[item.talk.ask];
  // A follow-up is judged with the moment it grew out of, so the partner's
  // reaction has a scene to belong to.
  const said = item.talk.ask === 0 ? ask.said : `${item.asks[0].said}\n${ask.said}`;

  const turn = await wordTurn(
    ctx.snapshot,
    { word: item.seed.word, pos: item.seed.pos, meaning: item.seed.meaning },
    said,
    sentence,
    item.talk.misses,
  );

  // Every sent sentence is kept, landed or not, the moment it is judged — and
  // before anything else is written, so a failure further down can cost a
  // schedule tick but never something they wrote.
  await mutate(ctx.db, ctx.userId, {
    type: "recordProductions",
    productions: [
      {
        surface: "words",
        itemSlug: item.seed.id,
        mode: "talk",
        prompt: ask.said,
        text: sentence,
        verdict: turnLedgerVerdict(item.talk, turn.verdict),
        ...(turn.hint || turn.reply ? { note: turn.hint || turn.reply } : {}),
      },
    ],
  });

  item.thread.push({ t: "you", text: sentence });
  item.talk = talkApply(item.talk, { type: "turn", verdict: turn.verdict, sentence });

  if (turn.verdict === "landed") {
    item.thread.push({ t: "landed", reply: turn.reply });
    if (talkDone(item.talk)) await closeItem(ctx, day, item);
    else item.thread.push({ t: "said", text: item.asks[item.talk.ask].said });
  } else {
    const note: TalkEntry = {
      t: "note",
      missing: turn.verdict === "missing",
      reply: turn.reply,
      ...(turn.quote ? { quote: turn.quote } : {}),
      ...(turn.hint ? { hint: turn.hint } : {}),
    };
    item.thread.push(note);
  }

  await saveDay(ctx, day);
  return day;
}

/** They reopened the card. Free to do, but the word no longer counts as clean. */
export async function dayPeek(ctx: RequestContext, wordId: string): Promise<WordDay> {
  const { day, item } = await openItem(ctx, wordId);
  item.talk = talkApply(item.talk, { type: "peek" });
  await saveDay(ctx, day);
  return day;
}

/** The way out, honoured only after real effort on one line. */
export async function dayLeave(ctx: RequestContext, wordId: string): Promise<WordDay> {
  const { day, item } = await openItem(ctx, wordId);
  if (!talkCanLeave(item.talk)) throw new MoveError("Give this line a few more tries first.");
  item.talk = talkApply(item.talk, { type: "leave" });
  await closeItem(ctx, day, item);
  await saveDay(ctx, day);
  return day;
}

/** The two words the day's bridge joins, once every conversation is over. */
export function bridgeWords(day: WordDay): [WordSeed, WordSeed] | null {
  const pair = bridgePair(day.items.map((i) => i.seed));
  return pair;
}

/**
 * The day's closing bonus: one sentence using two of today's words.
 *
 * It never touches the schedule — a bonus that could lapse a word would make
 * the honest scheduling everywhere else a lie — but it is still production, so
 * it still belongs in the ledger.
 */
export async function dayBridge(ctx: RequestContext, sentence: string): Promise<WordDay> {
  const day = await readDay(ctx);
  if (!day) throw new MoveError("Today's session isn't open yet.");
  const pair = bridgeWords(day);
  if (!pair) throw new MoveError("There is no bridge today.");
  const [a, b] = pair;
  const ok = judgeBridge(a.word, b.word, sentence);
  await mutate(ctx.db, ctx.userId, {
    type: "recordProductions",
    productions: [
      {
        surface: "bridge",
        mode: "bridge",
        prompt: `Use "${a.word}" and "${b.word}" in one sentence.`,
        text: sentence,
        verdict: ok ? "clean" : "missed",
      },
    ],
  });
  day.bridge = { text: sentence, ok };
  await saveDay(ctx, day);
  return day;
}

/**
 * Close the day: streak, totals, vocabulary, and the lines kept for later.
 *
 * Idempotent — a second call (a double tap, a reload on the debrief) returns
 * the finished day without counting the streak twice.
 */
export async function dayFinish(ctx: RequestContext): Promise<WordDay> {
  const day = await readDay(ctx);
  if (!day) throw new MoveError("Today's session isn't open yet.");
  if (day.finishedAt) return day;
  if (day.items.some((i) => i.outcome === null)) {
    throw new MoveError("There are still words open today.");
  }

  const sentences = day.items.flatMap((i) => i.talk.landed);
  if (day.bridge?.ok) sentences.push(day.bridge.text);
  const lines: Record<string, string> = {};
  for (const i of day.items) if (i.talk.landed[0]) lines[i.seed.id] = i.talk.landed[0];

  await mutate(ctx.db, ctx.userId, {
    type: "finishWordSession",
    sentences,
    lines,
    durationMs: Math.min(MAX_SESSION_MS, Math.max(0, Date.now() - day.startedAt)),
  });

  day.finishedAt = new Date().toISOString();
  await saveDay(ctx, day);
  return day;
}
