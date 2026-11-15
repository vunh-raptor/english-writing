import "server-only";
import { randomUUID } from "node:crypto";
import type {
  ArenaBout,
  ArenaItem,
  ArenaMarks,
  ArenaStation,
  ArenaTurn,
  LexKind,
  Phrase,
  TalkEntry,
} from "@/types";
import type { RequestContext } from "./request";
import { readGenerated, writeGenerated } from "./db/generated";
import { loadState, mutate } from "./db/state";
import { arenaScenes, arenaTurn, stationLabel, type ArenaScene } from "./phrasebook";
import {
  BOUT_ITEMS,
  clockBeaten,
  comboPair,
  hasPartnerChunk,
  itemOutcome,
  marksFromLedger,
  pickBoutItems,
  planBout,
  stationMode,
  stationOutcome,
  withRematch,
} from "@/lib/shared/arena";
import { gapPartner, talkApply, talkCanLeave, talkStart, turnLedgerVerdict } from "@/lib/shared/words";
import { countWords } from "@/lib/shared/stats";

/**
 * The Phrasebook arena's bout, owned by the server (docs/PHRASEBOOK.md).
 *
 * Same stance as a Daily Words day (`wordDay.ts`), for the same reasons: a
 * sentence held until it is right needs its miss count, its help level and its
 * way out read from what is stored, never from the request — or the fences are
 * only as strong as the client. And leaving the page must lose nothing.
 *
 * One bout at a time per learner: opening resumes an unfinished one. The
 * sentences go to `productions` the moment they are judged; the bout document
 * is the session, the ledger is the record — and the ledger is also where an
 * item's Native marks come from.
 */

const KIND = "arena_bout";
const KEY = { kind: KIND, key: "current", version: "arena_bout.v1" };
const KINDS = new Set<LexKind>(["word", "phrase", "idiom", "pattern", "collocation", "sentence"]);

/** A move the learner's own state rules out — a 409, not a server fault. */
export class ArenaMoveError extends Error {}

/** The stored bout, finished or not, or null when none was ever opened. */
export async function readBout(ctx: RequestContext): Promise<ArenaBout | null> {
  return readGenerated<ArenaBout>(ctx.db, ctx.userId, KEY);
}

async function saveBout(ctx: RequestContext, bout: ArenaBout): Promise<void> {
  await writeGenerated(ctx.db, ctx.userId, KEY, bout);
}

/** Every item's Native marks, read from the clean arena rows of the ledger. */
export async function readMarks(ctx: RequestContext): Promise<ArenaMarks> {
  const { data } = await ctx.db
    .from("productions")
    .select("item_slug, mode, verdict")
    .eq("user_id", ctx.userId)
    .eq("surface", "phrasebook")
    .eq("verdict", "clean")
    .like("mode", "arena-%")
    .limit(5000);
  return marksFromLedger(
    (data ?? []).map((r) => ({ itemSlug: r.item_slug, mode: r.mode, verdict: r.verdict })),
  );
}

function kindOf(p: Phrase): LexKind {
  if (p.kind && KINDS.has(p.kind)) return p.kind;
  return countWords(p.text) === 1 ? "word" : "phrase";
}

/** The ask, in words the judge reads — what the scene was pulling for. */
function askFor(turn: ArenaTurn): string {
  switch (turn.station) {
    case "recall":
      return "Recall: they saw only its meaning and had to find it themselves.";
    case "partner":
      return `Partner: use it together with its natural partner (${turn.partner ?? "a partner word"}).`;
    case "shift":
      return `Shape: the scene pulls for it ${turn.shift === "someone else" ? "about someone else" : `in the ${turn.shift}`}.`;
    case "register":
      return `Register: they are talking to someone ${turn.register === "formal" ? "they must be careful with, at work" : "close, casually"}.`;
    case "native":
      return `Say it like a native: they were given the flat line "${turn.plain ?? ""}" to say better, with the item.`;
    case "clock":
      return "Against the clock: they had to recall it and answer quickly.";
    case "combo":
      return "Both items in one sentence.";
  }
}

function sceneTurn(
  itemId: string,
  station: ArenaStation,
  scene: ArenaScene,
  extra: Partial<ArenaTurn> = {},
): ArenaTurn {
  return {
    itemId,
    station,
    said: scene.said,
    task: scene.task,
    ...(scene.plain ? { plain: scene.plain } : {}),
    ...extra,
    talk: talkStart(1),
    thread: [{ t: "said", text: scene.said, task: scene.task }],
    ...(station === "clock" ? { clockStartedAt: null } : {}),
    outcome: null,
  };
}

/**
 * Open the arena: resume the unfinished bout, or build a new one.
 *
 * `ids` is the learner's own pick from their book; anything not in it is
 * ignored, and an empty pick takes the default draw (`pickBoutItems`). The
 * build is the only slow, fallible step — one generation for every scene.
 */
export async function openBout(ctx: RequestContext, ids: string[]): Promise<ArenaBout> {
  const existing = await readBout(ctx);
  if (existing && !existing.finishedAt) return existing;

  const store = await loadState(ctx.db, ctx.userId);
  const marks = await readMarks(ctx);
  const pool = store.minedPhrases;
  const byId = new Map(pool.map((p) => [p.id, p]));
  const picked = [...new Set(ids)].map((id) => byId.get(id)).filter((p): p is Phrase => !!p);
  const chosen = (picked.length ? picked : pickBoutItems(pool, store.phraseSrs, marks)).slice(
    0,
    BOUT_ITEMS,
  );
  if (chosen.length === 0) throw new ArenaMoveError("Your book is empty — save something first.");

  const facts = chosen.map((p) => ({
    phrase: p,
    kind: kindOf(p),
    marks: marks[p.id] ?? [],
    hasPartner: hasPartnerChunk(p.collocations, p.text),
    partner: gapPartner(p.collocations ?? [], p.text)?.gapped,
  }));
  const plan = planBout(
    facts.map((f) => ({ id: f.phrase.id, marks: f.marks, hasPartner: f.hasPartner })),
    Date.now() % 997,
  );

  const packs = await arenaScenes(
    ctx.snapshot,
    facts.map((f) => ({
      id: f.phrase.id,
      text: f.phrase.text,
      meaning: f.phrase.meaning,
      kind: f.kind,
      stations: plan.filter((p) => p.itemId === f.phrase.id).map(stationLabel),
      ...(f.hasPartner && f.partner ? { partner: f.partner } : {}),
    })),
  );

  const turns: ArenaTurn[] = [];
  const saidUntimed = new Set<string>();
  for (const p of plan) {
    const scene = packs.get(p.itemId)?.scenes[stationLabel(p)];
    if (!scene) continue; // no scene survived the checks — the station isn't played
    // The clock follows an untimed station of the same item, or not at all.
    if (p.station === "clock" && !saidUntimed.has(p.itemId)) continue;
    if (p.station !== "clock") saidUntimed.add(p.itemId);
    const fact = facts.find((f) => f.phrase.id === p.itemId)!;
    turns.push(
      sceneTurn(p.itemId, p.station, scene, {
        ...(p.shift ? { shift: p.shift } : {}),
        ...(p.register ? { register: p.register } : {}),
        ...(p.station === "partner" && fact.partner ? { partner: fact.partner } : {}),
      }),
    );
  }
  if (turns.length === 0) throw new Error("Couldn't set up the arena — try again in a moment.");

  const playing = facts.filter((f) => turns.some((t) => t.itemId === f.phrase.id));
  const items: ArenaItem[] = playing.map((f) => ({
    id: f.phrase.id,
    text: f.phrase.text,
    meaning: f.phrase.meaning,
    kind: f.kind,
    collocations: f.phrase.collocations ?? [],
    examples: [...(packs.get(f.phrase.id)?.examples ?? []), f.phrase.example]
      .filter((e) => e && e.trim())
      .filter((e, n, arr) => arr.findIndex((x) => x.trim() === e.trim()) === n)
      .slice(0, 3),
    marksBefore: f.marks,
    isNew: !store.phraseSrs[f.phrase.id],
    prevBox: store.phraseSrs[f.phrase.id]?.box ?? 0,
  }));

  // The finale: two items, one sentence. Its ask is the two items themselves —
  // the material is on screen, so nothing needs writing for it.
  const pair = comboPair(items.map((i) => ({ ...i, marks: i.marksBefore })));
  if (pair) {
    const [a, b] = pair;
    const said = `“${a.text}” and “${b.text}” — in one sentence of your own.`;
    turns.push({
      itemId: `${a.id}+${b.id}`,
      station: "combo",
      comboIds: [a.id, b.id],
      said,
      task: "Make one sentence that needs both.",
      talk: talkStart(1),
      thread: [{ t: "said", text: said, task: "Make one sentence that needs both." }],
      outcome: null,
    });
  }

  const spares: ArenaBout["spares"] = {};
  for (const i of items) {
    const spare = packs.get(i.id)?.spare;
    if (spare) spares[i.id] = { said: spare.said, task: spare.task };
  }

  const bout: ArenaBout = {
    id: randomUUID(),
    startedAt: Date.now(),
    items,
    turns,
    spares,
    finishedAt: null,
  };
  await saveBout(ctx, bout);
  return bout;
}

/** The stored bout and the open turn a move is about, or why it can't be made. */
async function openTurn(
  ctx: RequestContext,
  index: number,
): Promise<{ bout: ArenaBout; turn: ArenaTurn }> {
  const bout = await readBout(ctx);
  if (!bout || bout.finishedAt) throw new ArenaMoveError("There's no bout open.");
  const current = bout.turns.findIndex((t) => t.outcome === null);
  // Moves name the turn they were made on, so a double tap or a stale tab
  // can't land a sentence on the station after the one they were looking at.
  if (current === -1 || index !== current) {
    throw new ArenaMoveError("That station has moved on — here's where you are.");
  }
  return { bout, turn: bout.turns[current] };
}

/** A station is over: settle it, and give a slipped item its one second try. */
function closeTurn(bout: ArenaBout, index: number): void {
  const turn = bout.turns[index];
  turn.outcome = stationOutcome(turn);
  if (turn.outcome === "clean" || turn.station === "combo") return;
  const spare = bout.spares[turn.itemId];
  bout.turns = withRematch(
    bout.turns,
    index,
    spare ? sceneTurn(turn.itemId, "recall", spare) : null,
  );
}

/** Send one sentence at the open station. Returns the bout as it now stands. */
export async function boutSay(
  ctx: RequestContext,
  index: number,
  sentence: string,
): Promise<ArenaBout> {
  const { bout, turn } = await openTurn(ctx, index);
  if (turn.station === "clock" && turn.clockStartedAt == null) {
    throw new ArenaMoveError("Start the clock first.");
  }
  const ids = turn.comboIds ?? [turn.itemId];
  const items = ids
    .map((id) => bout.items.find((i) => i.id === id))
    .filter((i): i is ArenaItem => !!i);
  const hidden = turn.station === "recall" || turn.station === "clock";
  const said = turn.plain ? `${turn.said}\nThe flat way to say it: "${turn.plain}"` : turn.said;

  const now = Date.now();
  const judged = await arenaTurn(
    ctx.snapshot,
    items,
    hidden,
    askFor(turn),
    said,
    sentence,
    turn.talk.misses,
  );

  // A clean landing on the clock counts only inside the time; it is measured
  // once, at the first landing, on the server's clock.
  const late =
    turn.station === "clock" &&
    judged.verdict === "landed" &&
    !clockBeaten(turn.clockStartedAt, now);
  let verdict = turnLedgerVerdict(turn.talk, judged.verdict);
  if (late && verdict === "clean") verdict = "helped";

  // Kept before anything else is written: a failure further down may cost a
  // schedule tick, never a sentence.
  await mutate(ctx.db, ctx.userId, {
    type: "recordProductions",
    productions: [
      {
        surface: "phrasebook",
        ...(turn.station === "combo" ? {} : { itemSlug: turn.itemId }),
        mode: stationMode(turn.station),
        prompt: turn.plain ? `${turn.said} (flat: ${turn.plain})` : turn.said,
        text: sentence,
        verdict,
        ...(judged.hint || judged.reply ? { note: judged.hint || judged.reply } : {}),
      },
    ],
  });

  turn.thread.push({ t: "you", text: sentence });
  if (turn.station === "clock" && judged.verdict === "landed") turn.clockBeaten = !late;
  turn.talk = talkApply(turn.talk, { type: "turn", verdict: judged.verdict, sentence });

  if (judged.verdict === "landed") {
    turn.thread.push({ t: "landed", reply: judged.reply });
    closeTurn(bout, index);
  } else {
    const note: TalkEntry = {
      t: "note",
      missing: judged.verdict === "missing",
      reply: judged.reply,
      ...(judged.quote ? { quote: judged.quote } : {}),
      ...(judged.hint ? { hint: judged.hint } : {}),
    };
    turn.thread.push(note);
  }

  await saveBout(ctx, bout);
  return bout;
}

/** They opened the card. Free to do; the station is no longer clean. */
export async function boutPeek(ctx: RequestContext, index: number): Promise<ArenaBout> {
  const { bout, turn } = await openTurn(ctx, index);
  turn.talk = talkApply(turn.talk, { type: "peek" });
  await saveBout(ctx, bout);
  return bout;
}

/** Start the clock station. Idempotent: a reload can't restart the time. */
export async function boutClock(ctx: RequestContext, index: number): Promise<ArenaBout> {
  const { bout, turn } = await openTurn(ctx, index);
  if (turn.station !== "clock") throw new ArenaMoveError("This station has no clock.");
  if (turn.clockStartedAt == null) {
    turn.clockStartedAt = Date.now();
    await saveBout(ctx, bout);
  }
  return bout;
}

/** The way out, honoured only after real effort on one station. */
export async function boutLeave(ctx: RequestContext, index: number): Promise<ArenaBout> {
  const { bout, turn } = await openTurn(ctx, index);
  if (!talkCanLeave(turn.talk)) throw new ArenaMoveError("Give this one a few more tries first.");
  turn.talk = talkApply(turn.talk, { type: "leave" });
  closeTurn(bout, index);
  await saveBout(ctx, bout);
  return bout;
}

/**
 * Close the bout and move the schedule — honestly, the same way everywhere:
 * clean at every station earns the interval, a lapse only when an item slipped
 * at more stations than it landed (and never on a first meeting), anything
 * else stays due.
 *
 * Ending early is allowed at any point — a bout nobody can leave is the
 * anxiety this product exists to avoid. Every sentence is already in the
 * ledger; only items whose stations all finished move on the schedule.
 * Idempotent: a reload on the debrief can't count anything twice.
 */
export async function boutFinish(ctx: RequestContext): Promise<ArenaBout> {
  const bout = await readBout(ctx);
  if (!bout) throw new ArenaMoveError("There's no bout open.");
  if (bout.finishedAt) return bout;

  const open = bout.turns.some((t) => t.outcome === null);
  const earned: string[] = [];
  const lapsed: string[] = [];
  for (const item of bout.items) {
    const mine = bout.turns.filter((t) => t.itemId === item.id);
    if (mine.length === 0 || mine.some((t) => t.outcome === null)) continue;
    const o = itemOutcome(mine.map((t) => t.outcome!));
    if (o === "clean") earned.push(item.id);
    else if (o === "missed" && !item.isNew) lapsed.push(item.id);
  }
  if (earned.length) await mutate(ctx.db, ctx.userId, { type: "reviewPhrases", ids: earned, success: true });
  if (lapsed.length) await mutate(ctx.db, ctx.userId, { type: "reviewPhrases", ids: lapsed, success: false });

  bout.finishedAt = new Date().toISOString();
  if (open) bout.endedEarly = true;
  await saveBout(ctx, bout);
  return bout;
}
