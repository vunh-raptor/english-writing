import "server-only";
import type {
  Mission,
  MissionBeat,
  MissionTarget,
  MissionProgress,
  MissionTurn,
  MissionAct,
  BeatSupport,
  NewsLevel,
  TargetStatus,
  HintRung,
  BridgeHelp,
  ContinueHelp,
  AskHelp,
  Debrief,
  TargetResult,
  DayKey,
} from "@/types";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { extractObject, normalizeGaps, str, strList } from "@/lib/shared/modelJson";
import { chatComplete, rawComplete, type ChatTurn } from "./ai";
import { fetchNewsHeadlines, type NewsHeadline } from "./news";
import { countWords } from "@/lib/shared/stats";
import { phraseMatcher } from "@/lib/shared/phrases";
import { todayKey } from "@/lib/shared/date";
import type { Db } from "./supabase";
import { remember } from "./db/generated";
import {
  ASK_SYSTEM,
  BRIDGE_SYSTEM,
  CONTINUE_SYSTEM,
  DEBRIEF_SYSTEM,
  LEVELS,
  PLAN_SYSTEM,
  PLAN_VERSION,
  askUser,
  bridgeUser,
  continueUser,
  converseSystem,
  debriefUser,
  planUser,
  turnContext,
} from "./prompts/mission";

/**
 * News Chat v2 — the Mission engine (see docs/NEWS_CHAT_V2.md).
 *
 * The plan is fixed; only the delivery is live. Four AI jobs:
 *   - planMission     : one big call designs the whole lesson from real
 *                       headlines (scenario, goal, 3 targets, 4 beats with
 *                       hint ladders). Validated hard, one retry, remembered
 *                       per (account, day, level) in `ai_content`.
 *   - missionConverse : the per-turn scene partner — in character, pursues the
 *                       current beat only, judges target production honestly.
 *                       All state merging happens HERE in code, never the model.
 *   - bridge          : "say it your way" — the learner's intent (any language)
 *                       becomes keywords + a gapped frame, never a translation.
 *   - missionDebrief  : where learning becomes explicit — per-target results,
 *                       ≤2 upgrades, phrases to keep. Verdicts are computed in
 *                       code; the model only writes the words.
 *
 * The prompts themselves live in `prompts/mission.ts`. What stays here is the
 * merging, which is the part that must never be delegated.
 */

function asLevel(v: unknown, fallback: NewsLevel = "B1"): NewsLevel {
  return LEVELS.includes(v as NewsLevel) ? (v as NewsLevel) : fallback;
}

// ---------------------------------------------------------------------------
// 1. The mission planner — one call designs the whole lesson
// ---------------------------------------------------------------------------

/** The fixed pedagogical arc; act and support are positional, never trusted. */
const BEAT_ACTS: MissionAct[] = ["react", "reason", "flip", "goal"];
const BEAT_SUPPORT: BeatSupport[] = ["frame", "keywords", "none", "none"];
const TARGET_COUNT = 3;
const BEAT_COUNT = 4;

/** The longest plain word (≥4 chars) of a target, to fuzzy-check the briefing. */
function anchorWord(targetText: string): string | null {
  const words = targetText
    .replace(/_+/g, " ")
    .toLowerCase()
    .match(/[a-z][a-z'-]{3,}/g);
  if (!words || words.length === 0) return null;
  return words.reduce((a, b) => (b.length > a.length ? b : a));
}

interface PlanResult {
  mission?: Mission;
  errors: string[];
}

/**
 * Coerce + validate a planner response into a Mission. Soft problems are fixed
 * silently (index out of range, extra items, junk check); hard problems are
 * collected as errors so the retry can name them.
 */
function coerceMission(
  obj: Record<string, unknown>,
  headlines: NewsHeadline[],
  level: NewsLevel,
  day: DayKey,
): PlanResult {
  const errors: string[] = [];

  const idx = Number(obj.index);
  const chosen = Number.isInteger(idx) && headlines[idx] ? headlines[idx] : headlines[0];

  const scen = (obj.scenario ?? {}) as Record<string, unknown>;
  const role = str(scen.role);
  const situation = str(scen.situation);
  if (!role || !situation) errors.push("scenario.role and scenario.situation are required");

  const goal = str(obj.goal);
  if (!goal) errors.push("goal is required");

  const briefing = str(obj.briefing);
  if (!briefing) errors.push("briefing is required");

  // Targets: ids are positional (t1..t3) — the beats contract depends on it.
  const rawTargets = Array.isArray(obj.targets) ? obj.targets : [];
  const targets: MissionTarget[] = [];
  for (let i = 0; i < Math.min(rawTargets.length, TARGET_COUNT); i++) {
    const t = (rawTargets[i] ?? {}) as Record<string, unknown>;
    const text = str(t.text);
    const meaning = str(t.meaning);
    if (!text || !meaning) {
      errors.push(`target ${i + 1} needs non-empty text and meaning`);
      continue;
    }
    targets.push({
      id: `t${i + 1}`,
      text,
      kind: t.kind === "pattern" ? "pattern" : "phrase",
      meaning,
      example: str(t.example) || text,
    });
  }
  if (targets.length < TARGET_COUNT) {
    errors.push(`exactly ${TARGET_COUNT} valid targets are required`);
  }

  // Every target must be woven into the briefing (fuzzy: its longest word).
  if (briefing) {
    const lower = briefing.toLowerCase();
    for (const t of targets) {
      const anchor = anchorWord(t.text);
      if (anchor && !lower.includes(anchor)) {
        errors.push(`briefing must use target "${t.text}" (marked with **)`);
      }
    }
  }

  // Beats: act, support, and targetId are positional — the fixed arc.
  const rawBeats = Array.isArray(obj.beats) ? obj.beats : [];
  const beats: MissionBeat[] = [];
  for (let i = 0; i < Math.min(rawBeats.length, BEAT_COUNT); i++) {
    const b = (rawBeats[i] ?? {}) as Record<string, unknown>;
    const elicit = str(b.elicit);
    const h = (b.hints ?? {}) as Record<string, unknown>;
    const idea = str(h.idea);
    const keywords = strList(h.keywords, 4);
    const frame = str(h.frame);
    const model = str(h.model);

    if (!elicit) errors.push(`beat ${i + 1} needs a non-empty elicit`);
    if (!idea || idea.includes("___")) {
      errors.push(`beat ${i + 1} hint "idea" must be a content nudge with no ___ gaps`);
    }
    if (keywords.length < 2) errors.push(`beat ${i + 1} needs at least 2 hint keywords`);
    if (!frame.includes("___")) {
      errors.push(`beat ${i + 1} hint "frame" must contain ___ gaps`);
    }
    if (!model) errors.push(`beat ${i + 1} needs a full "model" answer`);

    beats.push({
      id: `b${i + 1}`,
      act: BEAT_ACTS[i],
      elicit,
      targetId: i < TARGET_COUNT ? `t${i + 1}` : null,
      support: BEAT_SUPPORT[i],
      hints: { idea, keywords, frame: normalizeGaps(frame), model },
    });
  }
  if (beats.length < BEAT_COUNT) errors.push(`exactly ${BEAT_COUNT} beats are required`);

  if (errors.length > 0) return { errors };

  // The check is optional sugar — drop it silently if malformed.
  let check: Mission["check"];
  const rawCheck = (obj.check ?? null) as Record<string, unknown> | null;
  if (rawCheck) {
    const question = str(rawCheck.question);
    const options = strList(rawCheck.options, 2);
    const answer = Number(rawCheck.answer);
    if (question && options.length === 2 && (answer === 0 || answer === 1)) {
      check = { question, options, answer };
    }
  }

  return {
    errors: [],
    mission: {
      id: `${day}-${level}`,
      day,
      level,
      title: str(obj.title) || chosen.title,
      source: chosen.source,
      url: chosen.url,
      scenario: { role, situation },
      goal,
      briefing,
      check,
      targets,
      beats,
    },
  };
}

/** Plan one mission from real headlines. Validates hard; retries once with the
 *  failures named; then fails honestly (never fake content). */
export async function planMission(
  snapshot: LearnerSnapshot,
  headlines: NewsHeadline[],
  level: NewsLevel,
  day: DayKey = todayKey(),
): Promise<Mission> {
  if (headlines.length === 0) throw new Error("No headlines to plan from.");

  let lastErrors: string[] = ["no JSON object in the response"];
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = planUser(snapshot, headlines, attempt === 0 ? undefined : lastErrors);
    const raw = await rawComplete(PLAN_SYSTEM, prompt, 1600, 0.6);
    const obj = extractObject(raw);
    if (!obj) {
      console.warn(`[mission] attempt ${attempt}: no JSON —`, raw.slice(0, 300));
      continue;
    }
    const { mission, errors } = coerceMission(obj, headlines, level, day);
    if (mission) return mission;
    lastErrors = errors;
    console.warn(`[mission] attempt ${attempt} failed validation:`, errors);
  }
  throw new Error("Couldn't build a solid mission from today's news — try again.");
}

/**
 * Today's mission for this learner, planned once and then remembered.
 *
 * This used to be an in-process `Map` keyed by (day, level) and shared between
 * accounts — one plan served to everybody at that level, which was the cheap
 * thing to do while a mission was planned from headlines alone. It cannot be
 * shared now: the plan reads the learner's own due items and the subjects they
 * write about, so a cached mission is *their* mission and handing it to the
 * next person at B1 would hand over their context with it.
 *
 * So the cache moved into `ai_content`, per account. It also survives the
 * process, which the Map never did on serverless — reopening the tab an hour
 * later now resumes the same mission instead of planning a second one.
 */
export async function getDailyMission(
  db: Db,
  userId: string,
  snapshot: LearnerSnapshot,
  level: NewsLevel,
): Promise<Mission> {
  const day = todayKey();
  return remember(
    db,
    userId,
    { kind: "mission", key: `${day}-${level}`, version: PLAN_VERSION },
    async () => {
      const headlines = await fetchNewsHeadlines();
      if (headlines.length === 0) {
        throw new Error("Couldn't reach today's news — try again.");
      }
      return planMission(snapshot, headlines, level, day);
    },
  );
}

// --- Payload guards shared by the converse/debrief routes -----------------

/** Bound what a client can make us feed the model. */
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 2000;

/** The client round-trips the mission the server planned; check just enough
 *  shape that the engine can't crash on a mangled payload. */
export function isMissionShaped(m: unknown): m is Mission {
  if (!m || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  const scen = o.scenario as Record<string, unknown> | undefined;
  return (
    typeof o.goal === "string" &&
    !!scen &&
    typeof scen.role === "string" &&
    typeof scen.situation === "string" &&
    Array.isArray(o.targets) &&
    o.targets.length > 0 &&
    Array.isArray(o.beats) &&
    o.beats.length > 0
  );
}

export function sanitizeMessages(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is ChatTurn =>
        !!m &&
        typeof m === "object" &&
        ((m as ChatTurn).role === "user" || (m as ChatTurn).role === "assistant") &&
        typeof (m as ChatTurn).content === "string",
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

// ---------------------------------------------------------------------------
// 2. The scene partner — per-turn engine; all merging in code
// ---------------------------------------------------------------------------

/** A beat never holds the session hostage: after this many learner turns it
 *  advances regardless, and the unmet target simply lands in the SRS. */
const FORCE_ADVANCE_TURNS = 3;

/** How the HUD's target line reads inside the per-turn context block. */
function statusLine(mission: Mission, progress: MissionProgress): string {
  return mission.targets
    .map((t) => `${t.id} ${progress.targets[t.id] === "pending" ? "not yet" : progress.targets[t.id]}`)
    .join(" · ");
}

/** Ensure a client-supplied progress blob has a sane, complete shape. */
export function normalizeProgress(
  mission: Mission,
  raw: Partial<MissionProgress> | undefined,
): MissionProgress {
  const targets: Record<string, TargetStatus> = {};
  const given = (raw?.targets ?? {}) as Record<string, unknown>;
  for (const t of mission.targets) {
    const v = given[t.id];
    targets[t.id] =
      v === "produced" || v === "assisted" || v === "missed" ? v : "pending";
  }
  const beatIndex = Number(raw?.beatIndex);
  const rungs: HintRung[] = ["none", "idea", "keywords", "frame", "model"];
  return {
    beatIndex: Number.isInteger(beatIndex)
      ? Math.max(0, Math.min(beatIndex, mission.beats.length))
      : 0,
    turnsInBeat: Math.max(0, Number(raw?.turnsInBeat) || 0),
    turn: Math.max(0, Number(raw?.turn) || 0),
    level: asLevel(raw?.level, mission.level),
    wordsProduced: Math.max(0, Number(raw?.wordsProduced) || 0),
    deepestHint: rungs.includes(raw?.deepestHint as HintRung)
      ? (raw?.deepestHint as HintRung)
      : "none",
    targets,
  };
}

/** Merge one target production into the status map (upgrades only, never downgrades). */
function mergeTargetStatus(current: TargetStatus, helped: boolean): TargetStatus {
  const incoming: TargetStatus = helped ? "assisted" : "produced";
  if (current === "produced") return "produced";
  if (current === "assisted") return incoming === "produced" ? "produced" : "assisted";
  return incoming; // pending or missed → they used it after all
}

/**
 * Fast models under-attend to the judging half of the job (observed: a learner
 * writes the target verbatim, the model reports nothing until the very end).
 * The targets are short fixed chunks, so code detects them deterministically
 * and unions with the model's (more variant-tolerant) judgment. A minimum
 * length keeps a bare echo of the chunk from counting as a sentence.
 */
const MIN_PRODUCTION_WORDS = 5;

function detectTargets(mission: Mission, lastUserText: string): string[] {
  if (countWords(lastUserText) < MIN_PRODUCTION_WORDS) return [];
  return mission.targets
    .filter((t) => phraseMatcher(t.text).test(lastUserText))
    .map((t) => t.id);
}

/**
 * Run one turn. `messages` is the prior conversation (partner = assistant,
 * learner = user); empty on the opening call. The model speaks and judges; the
 * server merges all state under fixed rules so a confused model can never
 * stall the session or corrupt the HUD.
 */
export async function missionConverse(
  mission: Mission,
  rawProgress: Partial<MissionProgress> | undefined,
  messages: ChatTurn[],
): Promise<MissionTurn> {
  const progress = normalizeProgress(mission, rawProgress);
  const opening = messages.length === 0;

  const context: ChatTurn = {
    role: "user",
    content: turnContext(mission, progress, opening, {
      forceAdvanceAt: FORCE_ADVANCE_TURNS,
      statusLine: statusLine(mission, progress),
    }),
  };
  const convo: ChatTurn[] = opening
    ? [context, { role: "user", content: "(Begin the conversation now.)" }]
    : [context, ...messages];

  const raw = await chatComplete(converseSystem(mission), convo, 400);
  const obj = extractObject(raw);

  // On parse failure, keep the chat alive: the whole text becomes the reply.
  let reply = obj ? str(obj.reply) : raw.trim();
  const validIds = new Set(mission.targets.map((t) => t.id));
  const modelTargets = obj
    ? strList(obj.targetsUsed, TARGET_COUNT).filter((id) => validIds.has(id))
    : [];
  let beatDone = obj ? obj.beatDone === true : false;
  const onTask = obj ? obj.onTask !== false : true;
  const level = asLevel(obj?.level, progress.level);

  if (!reply) reply = "That's interesting! Tell me more — what makes you say that?";

  // --- Merge rules (code, never the model) --------------------------------

  const next: MissionProgress = { ...progress, targets: { ...progress.targets }, level };
  const lastUser = opening ? null : [...messages].reverse().find((m) => m.role === "user");

  if (!opening) {
    next.wordsProduced += lastUser ? countWords(lastUser.content) : 0;
    next.turnsInBeat += 1;
  }
  next.turn += 1;

  // Productions only count from a real learner turn; frame/model help this
  // beat downgrades them to "assisted" (they still practice it in the Coach).
  // The model's judgment is unioned with deterministic detection — fast models
  // reliably speak but unreliably judge.
  const targetsUsed = lastUser
    ? [...new Set([...modelTargets, ...detectTargets(mission, lastUser.content)])]
    : [];
  if (!opening) {
    const helped = progress.deepestHint === "frame" || progress.deepestHint === "model";
    for (const id of targetsUsed) {
      next.targets[id] = mergeTargetStatus(next.targets[id], helped);
    }
    // Backstop the beat too: producing the beat's target in an on-topic
    // sentence IS what the beat asks for — advance even if the model forgot.
    const beat = mission.beats[Math.min(progress.beatIndex, mission.beats.length - 1)];
    if (!beatDone && onTask && beat.targetId && targetsUsed.includes(beat.targetId)) {
      beatDone = true;
    }
  }

  const advance =
    !opening && (beatDone || next.turnsInBeat >= FORCE_ADVANCE_TURNS);
  if (advance && next.beatIndex < mission.beats.length) {
    const beat = mission.beats[next.beatIndex];
    if (beat.targetId && next.targets[beat.targetId] === "pending") {
      next.targets[beat.targetId] = "missed";
    }
    next.beatIndex += 1;
    next.turnsInBeat = 0;
    next.deepestHint = "none";
  }

  const missionComplete = next.beatIndex >= mission.beats.length;

  // The Iron Rule, enforced in code — except on the final warm wrap. Only
  // stitch a fallback when there's no question anywhere (a reply that asks
  // mid-message and closes with a frame like «"I think…"» needs no second ask).
  if (!missionComplete && !/[?？]/.test(reply)) {
    reply = `${reply} What do you think?`;
  }

  return { reply, targetsUsed, beatDone, onTask, missionComplete, state: next };
}

// ---------------------------------------------------------------------------
// 3. The bridge — "say it your way" (never a translation)
// ---------------------------------------------------------------------------

export async function bridge(
  snapshot: LearnerSnapshot,
  currentDemand: string,
  intent: string,
): Promise<BridgeHelp> {
  const raw = await rawComplete(
    BRIDGE_SYSTEM,
    bridgeUser(snapshot, currentDemand, intent),
    250,
  );
  const obj = extractObject(raw);
  if (!obj) throw new Error("Bridge help unavailable.");

  const keywords = strList(obj.keywords, 4).filter((k) => countWords(k) <= 4);
  let frame = normalizeGaps(str(obj.frame));
  // The whole point is the generation gap — a gapless "frame" is a translation
  // in disguise. Refuse it and hand back a neutral frame instead.
  if (!frame.includes("___")) frame = "I want to say ___ because ___.";
  if (keywords.length === 0) throw new Error("Bridge help unavailable.");

  return { keywords, frame };
}

// ---------------------------------------------------------------------------
// 3b. "Next words" — draft-grounded continuation help (never a completion)
// ---------------------------------------------------------------------------

/** A chunk longer than this is a completion in disguise — the hard cap that
 *  keeps "next words" from ever handing over a writable clause. */
const MAX_OPTION_WORDS = 3;

/**
 * Continuation material for a stalled mid-sentence draft. Same generation-gap
 * stance as the bridge, enforced in code: options are hard-capped at
 * MAX_OPTION_WORDS words each, and a gapless "frame" (a finished continuation
 * in disguise) is refused and replaced with a neutral gapped one.
 */
export async function continueHelp(
  snapshot: LearnerSnapshot,
  currentDemand: string,
  draft: string,
): Promise<ContinueHelp> {
  const raw = await rawComplete(
    CONTINUE_SYSTEM,
    continueUser(snapshot, currentDemand, draft),
    250,
  );
  const obj = extractObject(raw);
  if (!obj) throw new Error("Next-word help unavailable.");

  const options = strList(obj.options, 4).filter(
    (o) => countWords(o) <= MAX_OPTION_WORDS && !o.includes("___"),
  );
  if (options.length < 2) throw new Error("Next-word help unavailable.");

  let frame = normalizeGaps(str(obj.frame));
  if (!frame.includes("___")) frame = "___ because ___.";

  return { options, frame };
}

// ---------------------------------------------------------------------------
// 3c. "Ask · anything" — the free aide in the margin (translate / explain)
// ---------------------------------------------------------------------------

/** One-shot aide answer. Fails soft to a plain nudge — Ask never blocks writing. */
export async function ask(
  snapshot: LearnerSnapshot,
  context: string,
  question: string,
): Promise<AskHelp> {
  const raw = await rawComplete(ASK_SYSTEM, askUser(snapshot, context, question), 220, 0.5);
  const obj = extractObject(raw);
  // Parse failure still helps: hand back the raw text as the answer.
  if (!obj) {
    const answer = raw.trim().slice(0, 400);
    if (!answer) throw new Error("Ask help unavailable.");
    return { answer };
  }
  const answer = str(obj.answer);
  if (!answer) throw new Error("Ask help unavailable.");
  const insert = str(obj.insert);
  return insert ? { answer, insert } : { answer };
}

// ---------------------------------------------------------------------------
// 4. The debrief — verdicts computed in code; the model writes the words
// ---------------------------------------------------------------------------

/** Session end = every unmet target is missed (covers early exits too). */
function finalVerdict(status: TargetStatus): TargetResult["verdict"] {
  return status === "produced" || status === "assisted" ? status : "missed";
}

/**
 * The line a code-computed verdict wears when the model didn't write one.
 *
 * Not generated content and not a stand-in for it: the verdict was decided in
 * code from what the learner actually produced, and these are the words that
 * report each of the three possible answers. A learner is never shown a verdict
 * with nothing attached to it.
 */
const FALLBACK_NOTES: Record<TargetResult["verdict"], string> = {
  produced: "You used it in your own sentence — that's the whole game.",
  assisted: "You built it with a little help — it'll come free next time.",
  missed: "It didn't come up this time — it's waiting in your Phrase Coach.",
};

export async function missionDebrief(
  snapshot: LearnerSnapshot,
  mission: Mission,
  rawProgress: Partial<MissionProgress> | undefined,
  messages: ChatTurn[],
): Promise<Debrief> {
  const progress = normalizeProgress(mission, rawProgress);
  const verdicts = new Map(
    mission.targets.map((t) => [t.id, finalVerdict(progress.targets[t.id])]),
  );

  const fallback: Debrief = {
    celebration:
      "You held a real conversation in English about today's news — that's exactly how fluency grows.",
    goalHit: progress.beatIndex >= mission.beats.length,
    targetResults: mission.targets.map((t) => ({
      id: t.id,
      verdict: verdicts.get(t.id)!,
      note: FALLBACK_NOTES[verdicts.get(t.id)!],
    })),
    upgrades: [],
    keep: [],
  };

  const transcript = messages
    .map((m) => `${m.role === "user" ? "LEARNER" : "PARTNER"}: ${m.content}`)
    .join("\n");

  try {
    const raw = await rawComplete(
      DEBRIEF_SYSTEM,
      debriefUser(snapshot, mission, verdicts, transcript),
      700,
    );
    const obj = extractObject(raw);
    if (!obj) return fallback;

    // Verdicts are code-owned; the model only contributes the notes.
    const notes = new Map<string, string>();
    if (Array.isArray(obj.targetResults)) {
      for (const r of obj.targetResults) {
        const o = (r ?? {}) as Record<string, unknown>;
        const id = str(o.id);
        if (verdicts.has(id)) notes.set(id, str(o.note));
      }
    }
    const targetResults: TargetResult[] = mission.targets.map((t) => ({
      id: t.id,
      verdict: verdicts.get(t.id)!,
      note: notes.get(t.id) || FALLBACK_NOTES[verdicts.get(t.id)!],
    }));

    const upgrades = Array.isArray(obj.upgrades)
      ? obj.upgrades
          .map((u) => {
            const o = (u ?? {}) as Record<string, unknown>;
            return { you: str(o.you), upgrade: str(o.upgrade), why: str(o.why) };
          })
          .filter((u) => u.you && u.upgrade)
          .slice(0, 2)
      : [];

    const keep = Array.isArray(obj.keep)
      ? obj.keep
          .map((p) => {
            const o = (p ?? {}) as Record<string, unknown>;
            return { text: str(o.text), meaning: str(o.meaning) };
          })
          .filter((p) => p.text)
          .slice(0, 2)
      : [];

    return {
      celebration: str(obj.celebration) || fallback.celebration,
      goalHit: obj.goalHit !== false,
      targetResults,
      upgrades,
      keep,
    };
  } catch {
    return fallback;
  }
}
