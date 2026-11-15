import "server-only";
import type {
  ArenaStation,
  CaptureEnrichment,
  LexKind,
  PhraseAlternative,
  TalkTurn,
} from "@/types";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { extractObject, normalizeGaps, resolveItemId, str, strList } from "@/lib/shared/modelJson";
import { rawComplete } from "./ai";
import { countWords } from "@/lib/shared/stats";
import { itemMatcher } from "@/lib/shared/phrases";
import { hintLevel } from "@/lib/shared/words";
import { judgeHeld } from "./words";
import {
  ARENA_SYSTEM,
  ARENA_TURN_SYSTEM,
  ENRICH_SYSTEM,
  arenaTurnUser,
  arenaUser,
  enrichUser,
  type ArenaSceneInput,
} from "./prompts/phrasebook";

/**
 * The Phrasebook engine (docs/PHRASEBOOK.md) — three AI jobs behind the
 * capture-to-fluency loop:
 *
 *   enrichCapture : a raw highlight (+ its passage) → a compact phrasebook
 *                   entry: the reusable unit, plain meaning, one transfer
 *                   example, register, alternatives, partner words.
 *   arenaScenes   : one call per arena bout — a scene for every station the
 *                   code planned, plus a spare for a second try. No scene may
 *                   contain its item (code-checked), so recall stays recall.
 *   arenaTurn     : one sentence at one station, judged and held until it is
 *                   right, through the same fences as Daily Words.
 *
 * Nothing here ever returns a sentence the learner could send as their answer.
 * The prompts live in `prompts/phrasebook.ts`; what stays here is the coercion
 * and the guards. The bout itself — order, moves, schedule — is
 * `lib/server/arena.ts`.
 */

const LEX_KINDS = new Set<LexKind>([
  "word",
  "phrase",
  "idiom",
  "pattern",
  "collocation",
  "sentence",
]);

/**
 * Enrich one highlight into a phrasebook entry. Throws when the model can't
 * produce a meaning — the client then saves the raw highlight instead (capture
 * never fails; enrichment is best-effort).
 */
export async function enrichCapture(
  snapshot: LearnerSnapshot,
  snippet: string,
  context: string,
): Promise<CaptureEnrichment> {
  const raw = await rawComplete(ENRICH_SYSTEM, enrichUser(snapshot, snippet, context), 300);
  const obj = extractObject(raw);
  if (!obj) throw new Error("Enrichment unavailable.");

  const meaning = str(obj.meaning);
  if (!meaning) throw new Error("Enrichment unavailable.");

  const alternatives: PhraseAlternative[] = Array.isArray(obj.alternatives)
    ? obj.alternatives
        .map((a) => {
          const o = (a ?? {}) as Record<string, unknown>;
          const note = str(o.note);
          return { text: str(o.text), ...(note ? { note } : {}) };
        })
        .filter((a) => a.text)
        .slice(0, 2)
    : [];

  const register = str(obj.register).slice(0, 24);
  const text = normalizeGaps(str(obj.text)) || snippet.trim();
  // Kind: the model's classification, sanity-corrected by shape (a ___ gap is
  // a pattern; a single token is a word) so practice never mis-adapts.
  let kind = LEX_KINDS.has(obj.kind as LexKind) ? (obj.kind as LexKind) : "phrase";
  if (text.includes("___")) kind = "pattern";
  else if (countWords(text) === 1) kind = "word";
  const collocations = strList(obj.collocations, 4).filter((c) => countWords(c) <= 4);

  return {
    text,
    kind,
    meaning,
    example: str(obj.example),
    ...(register ? { register } : {}),
    ...(alternatives.length ? { alternatives } : {}),
    ...(collocations.length ? { collocations } : {}),
  };
}

// ---------------------------------------------------------------------------
// 2. The arena's scenes — one call, every station of the bout
// ---------------------------------------------------------------------------

/** Items one call may write scenes for (the bout size is smaller). */
const MAX_ARENA_ITEMS = 6;
/** A worked example longer than this is a paragraph, not a model sentence. */
const MAX_EXAMPLE_WORDS = 25;
/** A said line longer than this is a story, not a moment. */
const MAX_SAID_CHARS = 420;
const HAS_BLANK = /_{2,}/;
const FIRST_PERSON = /\b(I|I'm|I've|[Mm]y|[Mm]e|[Mm]ine|[Mm]yself)\b/;

/** The scene with the quoted speech taken out — what is narrated, not said. */
function narration(said: string): string {
  return said.replace(/["“][^"”]*["”]/g, " ");
}

/** The station as the model must echo it back: "recall", "shift(past)"… */
export function stationLabel(p: {
  station: ArenaStation;
  shift?: string;
  register?: string;
}): string {
  if (p.station === "shift" && p.shift) return `shift(${p.shift})`;
  if (p.station === "register" && p.register) return `register(${p.register})`;
  return p.station;
}

export interface ArenaScene {
  said: string;
  task: string;
  plain?: string;
}

export interface ArenaPack {
  examples: string[];
  /** Keyed by `stationLabel`. A station whose scene failed the checks is absent. */
  scenes: Record<string, ArenaScene>;
  spare?: ArenaScene;
}

/**
 * The instruction a hidden station wears when the model's own named the item.
 * It is an instruction, not material: the scene it sits under is still the
 * generated one. Naming the item in the task of a station that hides it would
 * hand over the very thing the station asks them to find.
 */
const TASK_NEUTRAL = "Answer them in your own sentence.";

/** Stations where the item is off the screen, so nothing may name it. */
const HIDDEN_LABELS = new Set(["recall", "clock", "spare"]);

function coerceScene(
  raw: Record<string, unknown>,
  matcher: RegExp,
  needsPlain: boolean,
  hidden: boolean,
): ArenaScene | null {
  const said = str(raw.said);
  let task = str(raw.task);
  // Empty, too long, gave the item away, or came back as a gap to fill —
  // answering someone must never turn into completing a form.
  if (!said || said.length > MAX_SAID_CHARS || matcher.test(said) || HAS_BLANK.test(said)) return null;
  // A scene with nobody speaking gives them nothing to answer.
  if (!/["“”]/.test(said) && !said.includes("?")) return null;
  // The scene is told TO the learner. Narration in the first person ("My boss
  // walks over") makes them the narrator of someone else's moment.
  if (FIRST_PERSON.test(narration(said))) return null;
  if (!task || HAS_BLANK.test(task)) return null;
  // Where the item is on screen, a task naming it gives nothing away.
  if (hidden && matcher.test(task)) task = TASK_NEUTRAL;
  if (!needsPlain) return { said, task };
  // The flat line is what they say better — if it already holds the item,
  // there is nothing left to say better.
  const plain = str(raw.plain);
  if (!plain || matcher.test(plain) || HAS_BLANK.test(plain)) return null;
  return { said, task, plain };
}

function coercePacks(
  obj: Record<string, unknown>,
  items: ArenaSceneInput[],
): Map<string, ArenaPack> {
  const out = new Map<string, ArenaPack>();
  if (!Array.isArray(obj.items)) return out;
  // The id matcher forgives the ways models mangle ids ("w-afford-1"); it
  // keys on `word`, which for a saved item is its text.
  const keyed = items.map((i) => ({ ...i, word: i.text }));
  for (const r of obj.items) {
    const o = (r ?? {}) as Record<string, unknown>;
    const item = resolveItemId(str(o.id), keyed);
    if (!item || out.has(item.id)) continue;
    const matcher = itemMatcher(item.text, item.kind);
    const wanted = new Set(item.stations);

    const pack: ArenaPack = {
      examples: strList(o.examples, 2).filter(
        (e) => countWords(e) <= MAX_EXAMPLE_WORDS && matcher.test(e),
      ),
      scenes: {},
    };
    for (const sc of Array.isArray(o.scenes) ? o.scenes : []) {
      const so = (sc ?? {}) as Record<string, unknown>;
      const label = str(so.station).toLowerCase().replace(/\s*\(\s*/, "(").replace(/\s*\)$/, ")");
      if (label === "spare") {
        pack.spare ??= coerceScene(so, matcher, false, true) ?? undefined;
        continue;
      }
      if (!wanted.has(label) || pack.scenes[label]) continue;
      const scene = coerceScene(so, matcher, label === "native", HIDDEN_LABELS.has(label));
      if (scene) pack.scenes[label] = scene;
    }
    out.set(item.id, pack);
  }
  return out;
}

function sceneCount(packs: Map<string, ArenaPack>): number {
  let n = 0;
  for (const p of packs.values()) n += Object.keys(p.scenes).length + (p.spare ? 1 : 0);
  return n;
}

/** Items per generation call. A whole bout in one call comes back cut off. */
const ITEMS_PER_CALL = 2;

async function scenesFor(
  snapshot: LearnerSnapshot,
  items: ArenaSceneInput[],
): Promise<Map<string, ArenaPack>> {
  const want = items.reduce((n, i) => n + i.stations.length + 1, 0);
  const prompt = arenaUser(snapshot, items);
  let best = new Map<string, ArenaPack>();
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await rawComplete(ARENA_SYSTEM, prompt, 2400);
    const obj = extractObject(raw);
    const packs = obj ? coercePacks(obj, items) : new Map<string, ArenaPack>();
    if (sceneCount(packs) > sceneCount(best)) best = packs;
    if (sceneCount(best) === want) break;
    console.warn(
      `[arena] attempt ${attempt}: ${sceneCount(packs)} of ${want} scenes usable —`,
      raw.slice(0, 200),
    );
  }
  return best;
}

/**
 * Every scene one bout needs.
 *
 * Guards, in code: a scene that leaks its item, has a blank, has nobody
 * speaking, or narrates as the learner is dropped, as is a `native` flat line
 * that already holds the item. A hidden station's task that names the item is
 * swapped for a neutral instruction rather than losing the whole scene. A station that loses its scene is simply not
 * played — a bout is made shorter, never padded with something canned.
 *
 * The items are written a couple at a time, in parallel: a whole bout in one
 * call is long enough to come back cut off, which loses every item after the
 * cut, and the strict checks lose a scene or two often enough that each call
 * gets a second try and keeps the fuller set. Nothing at all fails honestly.
 */
export async function arenaScenes(
  snapshot: LearnerSnapshot,
  items: ArenaSceneInput[],
): Promise<Map<string, ArenaPack>> {
  const capped = items.slice(0, MAX_ARENA_ITEMS);
  if (capped.length === 0) return new Map();
  const groups: ArenaSceneInput[][] = [];
  for (let i = 0; i < capped.length; i += ITEMS_PER_CALL) groups.push(capped.slice(i, i + ITEMS_PER_CALL));

  const settled = await Promise.allSettled(groups.map((g) => scenesFor(snapshot, g)));
  const merged = new Map<string, ArenaPack>();
  for (const r of settled) {
    if (r.status === "fulfilled") for (const [id, pack] of r.value) merged.set(id, pack);
    else console.warn("[arena] a scene call failed —", String(r.reason).slice(0, 160));
  }
  if (sceneCount(merged) > 0) return merged;
  throw new Error("Couldn't set up the arena — try again in a moment.");
}

// ---------------------------------------------------------------------------
// 3. Judge one arena sentence — held until it is right
// ---------------------------------------------------------------------------

/** Shown when a "missing" hint would have named a hidden item, or there was none. */
const NOTE_MISSING_ITEM = "Your item isn't in there yet — say it again with it in.";

/**
 * Judge one sentence at one station.
 *
 * The fences live in `judgeHeld` (lib/server/words.ts), shared with Daily
 * Words, so the arena can never hold more loosely than the one mode the
 * learner first asked to be held in. All this adds is the arena's own prompt
 * and its detection: the item matcher, or both items for the combo.
 */
export async function arenaTurn(
  snapshot: LearnerSnapshot,
  items: { text: string; meaning: string; kind?: LexKind }[],
  hidden: boolean,
  ask: string,
  said: string,
  sentence: string,
  misses: number,
): Promise<TalkTurn> {
  const matchers = items.map((i) => itemMatcher(i.text, i.kind));
  const [first] = items;
  const shown =
    items.length > 1
      ? { text: items.map((i) => i.text).join('" and "'), meaning: items.map((i) => i.meaning).join("; ") }
      : first;
  return judgeHeld({
    system: ARENA_TURN_SYSTEM,
    user: arenaTurnUser(snapshot, shown, hidden, ask, said, sentence, hintLevel(misses)),
    sentence,
    detected: matchers.every((m) => m.test(sentence)),
    hidden: hidden ? matchers[0] : null,
    missingNote: items.length > 1 ? "Both of them need to be in the one sentence." : NOTE_MISSING_ITEM,
  });
}
