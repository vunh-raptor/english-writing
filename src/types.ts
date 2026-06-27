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
  /** Gentle "keep going" pulse when the writer pauses mid-session. */
  gentleNudge: boolean;
  /** Juicy completion sound on the celebrate screen. */
  sound: boolean;
  ai: AiSettings;
}

export interface AiSettings {
  enabled: boolean;
  /** Stored only in this browser's localStorage. Never sent anywhere but Anthropic. */
  apiKey: string;
  model: string;
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
  /** Whether the learner has finished the first session (we defer "settings" nudges). */
  hasWritten: boolean;
}

/** A leveled, personal writing prompt. Never a blank page. */
export interface Prompt {
  id: string;
  level: Difficulty;
  text: string;
  /** An optional sentence-starter to break the ice. */
  starter?: string;
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
