import type {
  ArenaMarks,
  ArenaRegister,
  ArenaShift,
  ArenaStation,
  Phrase,
  SrsRecord,
  TalkState,
  WordOutcome,
} from "@/types";
import { todayKey } from "./date";
import { isDue } from "./srs";
import { gapPartner, talkOutcome } from "./words";

/**
 * The Arena (docs/PHRASEBOOK.md) — the Phrasebook's practice, as pure rules.
 *
 * Remembering an item and using it like a native are different skills, and a
 * single "write a sentence with it" round only proves the first. So an item is
 * made to work at several *stations*, each a different kind of use, and it
 * counts as Native only once it has landed cleanly at every one of them.
 *
 * Each station is a sentence held until it is right — the Daily Words fences,
 * reused rather than re-implemented (`talkApply`, `talkCanLeave`, the judge in
 * `lib/server/words.ts`). What lives here is only what is new: which stations a
 * bout asks for, where a slipped item comes back, what the clock means, and
 * what a whole bout earns.
 */

/**
 * The full ladder, easiest ask first. The order is pedagogical: an item is
 * recalled before it is bent, and said fast only after it has been said at all.
 */
export const NATIVE_LADDER: ArenaStation[] = [
  "recall",
  "partner",
  "shift",
  "register",
  "native",
  "clock",
];

/** Items in one bout — enough to interleave, few enough to finish. */
export const BOUT_ITEMS = 4;
/** Stations each item works at per bout (the last is always the clock). */
export const STATIONS_PER_ITEM = 3;
/** Seconds the clock station allows. Long enough for a careful sentence. */
export const CLOCK_SECONDS = 45;
/** Network and judging time that must not count against the learner. */
const CLOCK_GRACE_MS = 4000;
/** Turns between a slip and its second try — long enough to have to recall it. */
export const REMATCH_GAP = 2;

export const SHIFTS: ArenaShift[] = ["past", "negative", "question", "someone else", "future"];
export const REGISTERS: ArenaRegister[] = ["formal", "casual"];

/** The ladder this item can climb. `partner` needs a partner chunk to gap. */
export function ladderFor(hasPartner: boolean): ArenaStation[] {
  return hasPartner ? NATIVE_LADDER : NATIVE_LADDER.filter((s) => s !== "partner");
}

export interface NativeProgress {
  earned: ArenaStation[];
  needed: ArenaStation[];
  native: boolean;
}

/** How far an item is from Native: every station on its ladder, landed clean. */
export function nativeProgress(
  marks: readonly ArenaStation[] | undefined,
  hasPartner: boolean,
): NativeProgress {
  const ladder = ladderFor(hasPartner);
  const have = new Set(marks ?? []);
  const earned = ladder.filter((s) => have.has(s));
  return {
    earned,
    needed: ladder.filter((s) => !have.has(s)),
    native: earned.length === ladder.length,
  };
}

/**
 * The stations an item works at this bout, in the order it meets them.
 *
 * Unearned stations come first, so every bout moves an item toward Native
 * rather than re-proving what it can already do. Once everything untimed is
 * earned, the hardest earned stations come round again as maintenance.
 *
 * The clock is always last and never alone: speed is the final thing asked of
 * a sentence, never the first, so a timed station is only set once the same
 * item has already been said untimed in the same bout.
 */
export function planStations(
  marks: readonly ArenaStation[] | undefined,
  hasPartner: boolean,
  count = STATIONS_PER_ITEM,
): ArenaStation[] {
  const untimed = ladderFor(hasPartner).filter((s) => s !== "clock");
  const have = new Set(marks ?? []);
  const n = Math.max(1, Math.floor(count));
  const withClock = n >= 2;
  const slots = withClock ? n - 1 : n;

  const unearned = untimed.filter((s) => !have.has(s));
  const earned = untimed.filter((s) => have.has(s)).reverse();
  const chosen = new Set([...unearned, ...earned].slice(0, slots));
  const picks = untimed.filter((s) => chosen.has(s));
  return withClock ? [...picks, "clock"] : picks;
}

/** One station of the bout's plan, before any scene is written for it. */
export interface PlannedStation {
  itemId: string;
  station: ArenaStation;
  shift?: ArenaShift;
  register?: ArenaRegister;
}

/**
 * The whole bout's order: items interleaved station by station, so no item is
 * worked twice in a row. Interleaving is the desirable difficulty here — each
 * item has to be pulled back after something else has been in the way.
 *
 * `seed` varies which shape and which listener the code assigns, so two bouts
 * on the same items don't ask the same thing.
 */
export function planBout(
  items: { id: string; marks?: readonly ArenaStation[]; hasPartner: boolean }[],
  seed = 0,
  perItem = STATIONS_PER_ITEM,
): PlannedStation[] {
  const plans = items.map((it) => planStations(it.marks, it.hasPartner, perItem));
  const depth = Math.max(0, ...plans.map((p) => p.length));
  const out: PlannedStation[] = [];
  let n = Math.abs(Math.floor(seed));
  for (let tier = 0; tier < depth; tier++) {
    items.forEach((it, i) => {
      const station = plans[i][tier];
      if (!station) return;
      const planned: PlannedStation = { itemId: it.id, station };
      if (station === "shift") planned.shift = SHIFTS[n++ % SHIFTS.length];
      if (station === "register") planned.register = REGISTERS[n++ % REGISTERS.length];
      out.push(planned);
    });
  }
  return out;
}

/**
 * The two items the closing combo joins: the two furthest from Native, because
 * joining is the hardest ask and it should land on the items that need it.
 * Ties keep bout order. Fewer than two items, no combo.
 */
export function comboPair<T extends { id: string; marks?: readonly ArenaStation[] }>(
  items: T[],
): [T, T] | null {
  if (items.length < 2) return null;
  const ranked = items
    .map((it, i) => ({ it, i, n: it.marks?.length ?? 0 }))
    .sort((a, b) => a.n - b.n || a.i - b.i);
  const [a, b] = [ranked[0], ranked[1]].sort((x, y) => x.i - y.i);
  return [a.it, b.it];
}

/**
 * Put a slipped item's second try back into the bout.
 *
 * It goes `REMATCH_GAP` turns later — never straight away, because an item
 * repeated at once is read off short-term memory, not recalled — and before
 * the combo, which closes the bout. One second try per item per bout: being
 * dealt the same miss again and again is the grind the product exists to
 * avoid. Returns the turns unchanged when there is nothing to add.
 */
export function withRematch<T extends { itemId: string; station: string; rematch?: boolean }>(
  turns: T[],
  from: number,
  spare: T | null,
): T[] {
  const slipped = turns[from];
  if (!spare || !slipped || slipped.station === "combo") return turns;
  if (turns.some((t) => t.itemId === slipped.itemId && t.rematch)) return turns;
  const combo = turns.findIndex((t) => t.station === "combo");
  const end = combo === -1 ? turns.length : combo;
  const at = Math.min(from + 1 + REMATCH_GAP, end);
  return [...turns.slice(0, at), { ...spare, rematch: true }, ...turns.slice(at)];
}

/** Did their first landing come inside the time? Server clock on both ends. */
export function clockBeaten(startedAt: number | null | undefined, at: number): boolean {
  if (startedAt == null) return false;
  return at - startedAt <= CLOCK_SECONDS * 1000 + CLOCK_GRACE_MS;
}

/**
 * What one station earned. The talk rules decide it, with one addition: a
 * clock station landed cleanly but late is help, not a mark — the sentence
 * was right, it just wasn't fluent yet.
 */
export function stationOutcome(turn: {
  station: ArenaStation | "combo";
  talk: TalkState;
  clockBeaten?: boolean;
}): WordOutcome {
  const o = talkOutcome(turn.talk);
  if (turn.station === "clock" && o === "clean" && !turn.clockBeaten) return "helped";
  return o;
}

/**
 * What a whole bout earned for one item, for the schedule.
 *
 * Clean only when every station was. A lapse only when it slipped at more
 * stations than it landed — one bad station in a hard bout is not forgetting,
 * and treating it as such would make the arena punish the effort it asks for.
 */
export function itemOutcome(outcomes: WordOutcome[]): WordOutcome {
  if (outcomes.length === 0) return "helped";
  if (outcomes.every((o) => o === "clean")) return "clean";
  const missed = outcomes.filter((o) => o === "missed").length;
  return missed > outcomes.length - missed ? "missed" : "helped";
}

// --- The ledger is the record -------------------------------------------------
//
// Native marks are not stored anywhere of their own. Every arena sentence goes
// to `productions` with its station as the mode, so "which stations has this
// item landed cleanly" is a question the ledger already answers — and a mark
// can never drift from the sentence that earned it.

const MODE_PREFIX = "arena-";

/** The ledger `mode` a station's sentences are written under. */
export function stationMode(station: ArenaStation | "combo"): string {
  return `${MODE_PREFIX}${station}`;
}

/** The station a ledger mode names, or null when it isn't an arena station. */
export function stationFromMode(mode: string | null | undefined): ArenaStation | null {
  if (!mode?.startsWith(MODE_PREFIX)) return null;
  const s = mode.slice(MODE_PREFIX.length) as ArenaStation;
  return NATIVE_LADDER.includes(s) ? s : null;
}

/** Native marks from clean ledger rows. Anything else in the rows is ignored. */
export function marksFromLedger(
  rows: { itemSlug: string | null; mode: string | null; verdict: string }[],
): ArenaMarks {
  const marks: Record<string, Set<ArenaStation>> = {};
  for (const r of rows) {
    if (r.verdict !== "clean" || !r.itemSlug) continue;
    const s = stationFromMode(r.mode);
    if (!s) continue;
    (marks[r.itemSlug] ??= new Set()).add(s);
  }
  return Object.fromEntries(
    Object.entries(marks).map(([id, set]) => [id, NATIVE_LADDER.filter((s) => set.has(s))]),
  );
}

// --- Choosing the bout --------------------------------------------------------

/** Does this item have a partner chunk the `partner` station can gap? */
export function hasPartnerChunk(collocations: string[] | undefined, text: string): boolean {
  return gapPartner(collocations ?? [], text) !== null;
}

/**
 * Which items a bout takes when the learner doesn't choose: due first (brand
 * new before scheduled), then whatever is furthest from Native, then the rest.
 * Anything in the book can be fought for — an arena that only opened on due
 * days would be shut most of the week.
 */
export function pickBoutItems(
  pool: Phrase[],
  srs: Record<string, SrsRecord>,
  marks: ArenaMarks,
  limit = BOUT_ITEMS,
  today = todayKey(),
): Phrase[] {
  const rank = (p: Phrase): number => {
    const rec = srs[p.id];
    if (isDue(rec, today)) return rec ? 1 : 0;
    const prog = nativeProgress(marks[p.id], hasPartnerChunk(p.collocations, p.text));
    return prog.native ? 3 : 2;
  };
  return pool
    .map((p, i) => ({ p, i, r: rank(p), m: marks[p.id]?.length ?? 0 }))
    .sort((a, b) => a.r - b.r || (a.r === 2 ? a.m - b.m : 0) || a.i - b.i)
    .slice(0, Math.max(0, limit))
    .map((x) => x.p);
}
