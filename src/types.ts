/**
 * Core data model for Flowrite.
 *
 * Everything lives on-device in localStorage — private by default, no account,
 * no audience. Nothing here ever leaves the browser except, optionally, the
 * text the learner explicitly sends for AI feedback.
 */

/** A calendar day in the learner's local time, formatted `YYYY-MM-DD`. */
export type DayKey = string;

/** Difficulty calibrates prompt challenge to the learner's level (flow theory:
 *  too hard = anxiety, too easy = boredom). */
export type Difficulty = 1 | 2 | 3;

/** The success goal reframes a session as "don't stop", not "be good". */
export type GoalType = "time" | "words";

export interface Settings {
  /** Optional first name, only used to greet warmly. */
  name: string;
  goalType: GoalType;
  /** Seconds when goalType is "time"; word count when "words". */
  goalValue: number;
  difficulty: Difficulty;
  /** Real-life theme ids to draw prompts from. Empty = a bit of everything. */
  focuses: string[];
  /** Gentle "keep going" pulse when the writer pauses mid-session. */
  gentleNudge: boolean;
  /** Juicy completion sound on the celebrate screen. */
  sound: boolean;
  ai: AiSettings;
}

/** Which service powers the optional AI feedback. */
export type AiProvider = "anthropic" | "gemini" | "groq" | "openai";

export interface AiProviderConfig {
  /** Stored only in this browser's localStorage. Sent only to the chosen provider. */
  apiKey: string;
  model: string;
  /** Only for the OpenAI-compatible provider (OpenRouter, a local server, …). */
  baseUrl?: string;
}

export interface AiSettings {
  enabled: boolean;
  provider: AiProvider;
  /** Each provider remembers its own key + model so switching is friction-free. */
  providers: Record<AiProvider, AiProviderConfig>;
}

export interface Entry {
  id: string;
  day: DayKey;
  createdAt: number;
  promptId: string;
  promptText: string;
  text: string;
  words: number;
  chars: number;
  sentences: number;
  /** Unique words in this entry the learner had never written before. */
  newWords: number;
  durationMs: number;
}

export interface Profile {
  streak: number;
  longestStreak: number;
  lastWriteDay: DayKey | null;
  /** Forgiveness tokens — cover a missed day so one bad day doesn't nuke a streak. */
  freezes: number;
  totalWords: number;
  totalEntries: number;
  totalMs: number;
}

/** word (normalized) -> first day it was ever used + how many times since. */
export type Vocab = Record<string, { firstSeen: DayKey; count: number }>;

export interface Store {
  version: number;
  entries: Entry[];
  profile: Profile;
  settings: Settings;
  vocab: Vocab;
  /** A growing local library of AI-generated prompts (kept bounded). */
  aiPrompts: Prompt[];
  /** Spaced-repetition schedule per phrase id. */
  phraseSrs: Record<string, SrsRecord>;
  /** The learner's phrase pool — mission targets/keeps from News Chat plus
   *  captured highlights. The Phrasebook's library; the Coach practices it too. */
  minedPhrases: Phrase[];
  /** Saved News Chat conversations — powers the /news dashboard (recent, stats, resume). */
  newsSessions: NewsSession[];
  /** Rolling CEFR-ish level from News Chat missions — tomorrow's mission is planned at it. */
  newsLevel: NewsLevel;
  /** Whether the learner has finished the first session (we defer "settings" nudges). */
  hasWritten: boolean;
}

/** A real-life domain the learner practices English for — the syllabus axis. */
export interface Theme {
  id: string;
  label: string;
  /** What real-life skill this theme builds. */
  blurb: string;
}

/** A leveled, personal writing prompt. Never a blank page. */
export interface Prompt {
  id: string;
  /** Which real-life theme this belongs to. */
  themeId: string;
  level: Difficulty;
  text: string;
  /** An optional sentence-starter to break the ice. */
  starter?: string;
  /** Where it came from — the curated syllabus or AI generation. */
  source: "curated" | "ai";
}

/** Feedback is always opt-in and after writing — leading with what went well. */
export interface Feedback {
  source: "local" | "ai";
  encouragement: string;
  strengths: string[];
  /** Gentle, framed-as-suggestions notes. Never red squiggles. */
  suggestions: { note: string; example?: string }[];
  oneThingToTry: string;
}

/** A trending subject surfaced from the web (fetched server-side). */
export interface Trend {
  id: string;
  title: string;
  source: string;
  platform: string;
  url?: string;
  blurb?: string;
}

/** The flavor of a scenario step — used for light UI cues. */
export type BeatKind = "react" | "opinion" | "reply" | "imagine" | "describe" | "open";

/** One small, interactive step of a scenario. */
export interface ScenarioStep {
  id: string;
  kind: BeatKind;
  prompt: string;
  starter?: string;
  hint?: string;
}

/**
 * A trending subject turned into a sectioned, interactive writing flow — small
 * beats that build on each other instead of one big essay.
 */
export interface Scenario {
  id: string;
  subject: string;
  source: "trend" | "ai" | "curated";
  platform?: string;
  intro: string;
  steps: ScenarioStep[];
}

/** A common alternative way natives express the same idea. */
export interface PhraseAlternative {
  text: string;
  /** Optional nuance/register note, e.g. "more formal". */
  note?: string;
}

/** What kind of lexical unit an item is — the Phrasebook holds them all, and
 *  practice adapts (a word drills with its collocations; an idiom rephrases). */
export type LexKind = "word" | "phrase" | "idiom" | "pattern" | "collocation" | "sentence";

/** Where a captured phrase was highlighted — the Phrasebook's provenance. */
export interface CaptureSource {
  /** Module label, e.g. "News Chat". */
  module: string;
  /** The sentence/passage around the highlight (trimmed). */
  context?: string;
  day: DayKey;
}

/** A native phrase/idiom the learner practices producing in conversation. */
export interface Phrase {
  id: string;
  text: string;
  meaning: string;
  /** A natural, native-sounding usage example. */
  example: string;
  /** e.g. "casual", "at work". */
  register?: string;
  /** The image/origin behind an idiom — aids deep encoding. */
  origin?: string;
  /** 2+ popular "similar ways" to say the same thing, for real-world flexibility. */
  alternatives?: PhraseAlternative[];
  /** What kind of unit this is (word/idiom/pattern/…) — practice adapts to it. */
  kind?: LexKind;
  /** Natural partner words — how words actually travel (e.g. "heavy rain"). */
  collocations?: string[];
  /** Present when the learner highlighted this themselves (Phrasebook capture). */
  captured?: CaptureSource;
}

/** Spaced-repetition state for one phrase (Leitner boxes). */
export interface SrsRecord {
  /** Leitner box; higher = longer interval before it's due again. */
  box: number;
  /** Day it's next due for review (YYYY-MM-DD). */
  due: DayKey;
  /** How many times it's been successfully produced. */
  reps: number;
  /** Last review day. */
  last: DayKey;
}

/** A message in the coaching chat. */
export interface ChatMessage {
  role: "coach" | "user";
  content: string;
}

/** Per-phrase production status the coach reports each turn. */
export interface CoachProgress {
  id: string;
  /** True once the learner has produced it correctly and unprompted. */
  produced: boolean;
}

/** One coach response: what to say, phrase progress, and whether the lesson is done. */
export interface CoachTurn {
  reply: string;
  progress: CoachProgress[];
  done: boolean;
}

/** One beat of a writing session (a single prompt, or a scenario step). */
export interface WriteBeat {
  id: string;
  prompt: string;
  starter?: string;
  hint?: string;
}

/** What the writing screen works on: a subject + one or more beats. */
export interface WriteSession {
  promptId: string;
  subject: string;
  /** Display label for the subject's source, e.g. a platform name. */
  platform?: string;
  beats: WriteBeat[];
}

// --- News Chat v2: today's real news → one planned "mission" ---
//
// The plan is fixed; only the delivery is live. A mission is generated once per
// day (per level) from real headlines and then frozen: one scenario, one goal,
// three language targets, four beats with fading support. See docs/NEWS_CHAT_V2.md.

/** Rolling CEFR-ish level missions are planned at and adapted to. */
export type NewsLevel = "A2" | "B1" | "B2" | "C1";

export type TargetKind = "pattern" | "phrase";

/** One reusable language item this mission teaches, elicits, and tracks. */
export interface MissionTarget {
  id: string;
  /** e.g. "It's worth ___" — gaps in patterns use ___. */
  text: string;
  kind: TargetKind;
  /** Plain-words gloss (tap-to-reveal in the HUD). */
  meaning: string;
  /** A natural example ABOUT this topic (also woven into the briefing). */
  example: string;
}

/** The communicative act of a beat — the fixed react → reason → flip → goal arc. */
export type MissionAct = "react" | "reason" | "flip" | "goal";

/** Inline support the scene partner weaves into its own question (the fading curve). */
export type BeatSupport = "frame" | "keywords" | "none";

/**
 * Pre-generated stall help for one beat. Rungs are ordered and each preserves a
 * generation gap: a hint may unlock ideas or language, never a finished sentence.
 */
export interface HintLadder {
  /** Rung 1 — a thinking nudge; contains NO reusable English sentence material. */
  idea: string;
  /** Rung 2 — 3-4 short chunks (1-3 words) to build with; rendered inert, not tappable. */
  keywords: string[];
  /** Rung 3 — one sentence frame, gaps as "___"; insertable WITH gaps, send blocked until filled. */
  frame: string;
  /** Rung 4 — a full model answer; timed reveal, then write-from-memory. Never insertable. */
  model: string;
}

export interface MissionBeat {
  id: string;
  act: MissionAct;
  /** What the learner must produce — written as an instruction to the scene partner. */
  elicit: string;
  /** The one target this beat elicits; null for the final "goal" beat. */
  targetId: string | null;
  support: BeatSupport;
  hints: HintLadder;
}

/** The whole lesson plan, fixed at session start. */
export interface Mission {
  /** `${day}-${level}` — also the server cache key. */
  id: string;
  day: DayKey;
  level: NewsLevel;
  title: string;
  /** Honest attribution to the real headline. */
  source: string;
  url?: string;
  /** Who the AI plays + why they need the learner's words. */
  scenario: { role: string; situation: string };
  /** The one visible communicative outcome, addressed to the learner. */
  goal: string;
  /** 3-5 sentences of input; target uses marked **like this**. */
  briefing: string;
  /** One-tap comprehension check — the guaranteed first win. */
  check?: { question: string; options: string[]; answer: number };
  targets: MissionTarget[]; // exactly 3
  beats: MissionBeat[]; // exactly 4
}

export type TargetStatus =
  | "pending" // not yet produced
  | "produced" // learner's own sentence, no frame/model open this beat
  | "assisted" // produced, but after seeing the frame or model rung
  | "missed"; // beat ended without it (force-advanced)

/** Deepest hint rung opened this beat; frame/model downgrade a production to "assisted". */
export type HintRung = "none" | "idea" | "keywords" | "frame" | "model";

/** Client-held session progress; the server merges it each turn (never the model). */
export interface MissionProgress {
  /** 0-based; === beats.length ⇒ mission complete. */
  beatIndex: number;
  /** Code force-advances a beat after 3 learner turns so nothing drags. */
  turnsInBeat: number;
  turn: number;
  level: NewsLevel;
  /** Kept as momentum, demoted from "the metric" — see the HUD. */
  wordsProduced: number;
  deepestHint: HintRung;
  targets: Record<string, TargetStatus>;
}

/** One scene-partner turn: in-character reply + honest judgment, merged state. */
export interface MissionTurn {
  /** Always ends with exactly one production demand (the Iron Rule). */
  reply: string;
  /** Target ids the learner produced this turn, in their own words. */
  targetsUsed: string[];
  beatDone: boolean;
  /** Was their last message English, about the scenario? */
  onTask: boolean;
  missionComplete: boolean;
  state: MissionProgress;
}

/** "Say it your way": building material for the learner's own intent — never a translation. */
export interface BridgeHelp {
  /** 3-4 short English chunks carrying their meaning. */
  keywords: string[];
  /** One sentence frame with 2+ ___ gaps. */
  frame: string;
}

/**
 * "Next words": help for a learner who stalled MID-sentence, grounded in the
 * draft they've already written. Options are alternative directions for the
 * very next words (1-3 words each, rendered inert — never tappable-to-insert);
 * the frame is one possible shape for the REST of the sentence, gaps as ___.
 * By contract this is never a completion: the learner always keeps writing.
 */
export interface ContinueHelp {
  /** 2-4 short alternative next-word chunks. Different directions, not a sequence. */
  options: string[];
  /** One continuation frame with ___ gaps for what's still theirs to write. */
  frame: string;
}

export interface TargetResult {
  id: string;
  verdict: "produced" | "assisted" | "missed";
  /** Tiny specific note; quotes the learner's own words when produced. */
  note: string;
}

/** Post-hoc, pattern-level correction — the only correction in the product. */
export interface Upgrade {
  /** The learner's actual sentence (short quote). */
  you: string;
  /** The natural version. */
  upgrade: string;
  /** ≤6 words. */
  why: string;
}

/** Closing debrief: where learning becomes explicit, then feeds the SRS. */
export interface Debrief {
  celebration: string;
  goalHit: boolean;
  targetResults: TargetResult[]; // one per target
  upgrades: Upgrade[]; // 0-2, never more
  /** 0-2 bonus phrases from the chat → the mined pool. */
  keep: { text: string; meaning: string }[];
}

// --- Phrasebook: highlight anywhere → collect → apply in real situations ---
//
// The capture-to-application loop (docs/PHRASEBOOK.md). Highlights are enriched
// into reusable Phrase entries; practice is always PRODUCTION — a real-life
// situation the learner answers in their own sentence — never a flashcard flip.

/** What enrichment makes of a raw highlight — a Phrase minus id/provenance. */
export interface CaptureEnrichment {
  /** The reusable unit (trimmed/normalized; patterns may carry ___ gaps). */
  text: string;
  /** Plain-words gloss at the learner's level. */
  meaning: string;
  /** One natural example in a DIFFERENT situation than the source (transfer). */
  example: string;
  register?: string;
  alternatives?: PhraseAlternative[];
  /** Classified unit kind — words, idioms, patterns… all live in the book. */
  kind?: LexKind;
  /** For words especially: 2-4 natural partner words/chunks. */
  collocations?: string[];
}

/**
 * How one drill round asks for production — the variety axis. Every method
 * ends the same way: the learner writes their own sentence.
 */
export type DrillMethod =
  | "situation" // an everyday moment to respond to
  | "reply" // a mini-dialogue ending on a line spoken TO the learner
  | "rephrase" // a flat plain sentence to say more naturally with the phrase
  | "personal" // point at the learner's own life where the phrase fits
  | "collocation"; // use a word together with a natural partner (words travel in company)

/**
 * How the learner chooses to practice — one mode per strand of a balanced
 * program (Nation's four strands; docs/PHRASEBOOK.md):
 *   mixed  — meaning-focused output: AI scenario rounds, methods interleaved
 *   recall — retrieval practice: item hidden, retrieve from meaning, then apply
 *   sprint — fluency development: timed rounds on familiar items only
 *   study  — language-focused learning: the full card, closed by writing
 *            your own example (never moves the schedule — study ≠ testing)
 */
export type PracticeMode = "mixed" | "recall" | "sprint" | "study";

/** One practice round's setup, built per phrase by the drill call. */
export interface DrillRoundSetup {
  /** The phrase id this round elicits. */
  id: string;
  method: DrillMethod;
  /** The scene material: the moment, the "Name: line" mini-chat, or the plain
   *  sentence to upgrade. Never contains the phrase (code-checked). */
  setup: string;
  /** One short instruction telling the learner what to write. */
  task: string;
  /** Up to 2 worked examples USING the phrase in clearly different contexts —
   *  input to learn from, rendered inert, never an answer to the setup. */
  examples: string[];
}

/** Honest judgment of one drill answer. */
export interface DrillJudgment {
  /** Did they apply the phrase (or a close variant) in their OWN sentence? */
  used: boolean;
  /** One short warm line; quotes their words when it worked. */
  note: string;
  /** At most one pattern-level fix (the debrief's Upgrade shape). */
  upgrade?: Upgrade;
}

/**
 * "Ask · anything": the free aide in the News Chat margin. The learner asks to
 * translate / explain / rephrase; the aide answers briefly and, when they asked
 * how to say something, hands back an insertable English phrase.
 */
export interface AskHelp {
  /** A short, level-appropriate answer (plain text). */
  answer: string;
  /** An English phrase the learner can drop straight into their reply, if any. */
  insert?: string;
}

/**
 * A saved News Chat conversation — persisted so the /news dashboard can show
 * recent chats, roll up stats, and resume an unfinished one. Holds enough of the
 * live session (mission + transcript + progress) to re-enter it exactly.
 */
export interface NewsSession {
  id: string;
  day: DayKey;
  createdAt: number;
  updatedAt: number;
  level: NewsLevel;
  /** The mission title — the conversation's headline. */
  title: string;
  /** Attribution to the real source. */
  source: string;
  url?: string;
  /** The mission goal, for the resume card. */
  goal: string;
  /** "active" until the debrief lands; "complete" after. */
  status: "active" | "complete";
  wordsProduced: number;
  /** Targets produced or assisted so far — the numerator of the phrase count. */
  targetsProduced: number;
  targetsTotal: number;
  /** Whether the learner accomplished the mission goal (set at debrief). */
  goalHit?: boolean;
  /** The full frozen mission — lets resume run turns with no re-plan. */
  mission: Mission;
  /** The transcript so far (partner + learner). */
  messages: ChatMessage[];
  /** Client-held progress — merged server-side each turn. */
  progress: MissionProgress;
}
