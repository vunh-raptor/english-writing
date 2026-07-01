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
  /** Phrase ids the learner has produced independently in the coach. */
  masteredPhrases: string[];
  /** Whether the learner has finished the first session (we defer "settings" nudges). */
  hasWritten: boolean;
}

/** A real-life domain the learner practices English for — the syllabus axis. */
export interface Theme {
  id: string;
  label: string;
  emoji: string;
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
