import type { Prompt, Theme, Difficulty, DayKey } from "@/types";
import { parseDayKey } from "./date";

/**
 * The syllabus: a curated set of prompts organized around **real-life themes**
 * — the situations people actually need English for (work email, messaging
 * friends, giving an opinion, telling what happened). This replaces a flat,
 * random list with a managed curriculum:
 *
 * - prompts are tagged by theme + level, so they can be filtered to what a
 *   learner is practicing for,
 * - the daily prompt rotates across themes for balanced coverage, and
 * - the curated set is the always-offline backbone that the AI generator
 *   (see lib/ai.ts) extends with fresh, personalized prompts.
 */

export const THEMES: Theme[] = [
  { id: "everyday", label: "Everyday life", blurb: "Routines, food, errands — the small stuff" },
  { id: "work", label: "Work & email", blurb: "Messages, updates, and requests at work or school" },
  { id: "social", label: "Friends & social", blurb: "Texts, plans, and catching up" },
  { id: "opinions", label: "Opinions & debate", blurb: "Take a side and explain it" },
  { id: "travel", label: "Travel & places", blurb: "Trips, directions, describing places" },
  { id: "stories", label: "Stories & memories", blurb: "Tell what happened" },
  { id: "growth", label: "Goals & reflection", blurb: "You, your plans, what matters" },
];

const C = (
  id: string,
  themeId: string,
  level: Difficulty,
  text: string,
  starter?: string,
): Prompt => ({ id, themeId, level, text, starter, source: "curated" });

export const CURATED: Prompt[] = [
  // everyday
  C("ev1", "everyday", 1, "What did you eat today? Describe how it looked, smelled, and tasted.", "Today I ate"),
  C("ev2", "everyday", 1, "Walk through your morning, step by step.", "First, I"),
  C("ev3", "everyday", 2, "Describe a small habit that makes your day better — and one you'd like to drop.", "One thing that helps me is"),
  C("ev4", "everyday", 3, "Is your daily routine actually working for you right now? What would you change?", "Honestly, my days"),

  // work
  C("wk1", "work", 1, "Write a short message telling a coworker you'll be ten minutes late, and why.", "Hi — quick note,"),
  C("wk1b", "work", 1, "Write a quick message thanking a coworker for help today.", "Thanks so much for"),
  C("wk2", "work", 2, "Write an email asking a colleague for help on something you're stuck on.", "Hi, I'm working on"),
  C("wk3", "work", 2, "Describe what you did at work or school today, as if updating a teammate.", "Today I focused on"),
  C("wk4", "work", 3, "Argue for one change you'd make at your workplace or school, and how you'd pitch it.", "I think we should"),

  // social
  C("so1", "social", 1, "Text a friend to invite them somewhere this weekend.", "Hey! Do you want to"),
  C("so2", "social", 1, "A friend asks 'how have you been?' — really answer it.", "Honestly, lately I've been"),
  C("so3", "social", 2, "Describe a friend and why they matter to you.", "One person I'm grateful for is"),
  C("so4", "social", 3, "How do you keep friendships alive when life gets busy? What works, what doesn't?", "For me, staying close to people"),

  // opinions
  C("op1", "opinions", 2, "Would you rather live in a big city or a small town? Explain why.", "I would rather live"),
  C("op2", "opinions", 2, "What's a popular opinion you quietly disagree with?", "A lot of people think — but I"),
  C("op3", "opinions", 3, "Is technology making our lives better or worse? Argue your side.", "I believe technology"),
  C("op4", "opinions", 3, "Should everyone learn a second language? Make your case.", "When it comes to learning languages,"),

  // travel
  C("tr1", "travel", 1, "Describe a place near you that you'd take a visitor to see.", "If a friend visited, I'd take them to"),
  C("tr2", "travel", 1, "Give directions from your home to a place you go often.", "To get there, first you"),
  C("tr3", "travel", 2, "Describe a place you've been that surprised you.", "I did not expect"),
  C("tr4", "travel", 3, "If you could live in another country for a year, where — and what would you do there?", "I'd choose"),

  // stories
  C("st1", "stories", 1, "What happened the last time you laughed really hard?", "The last time I laughed,"),
  C("st1b", "stories", 1, "Describe something small that made you smile today.", "Today, I noticed"),
  C("st2", "stories", 2, "Tell the story of a time a small decision changed your day.", "It started as something small:"),
  C("st3", "stories", 2, "Describe a meal or a moment you still remember clearly.", "I can still picture"),
  C("st4", "stories", 3, "Tell the story of a failure that taught you something important.", "It didn't go the way I planned, but"),

  // growth
  C("gr1", "growth", 1, "What do you want to do this weekend, and why?", "This weekend I want to"),
  C("gr1b", "growth", 1, "What's one thing you're looking forward to?", "I'm looking forward to"),
  C("gr2", "growth", 2, "What is a skill you wish you had, and what would you do with it?", "If I could"),
  C("gr3", "growth", 2, "What advice would you give your younger self?", "I would tell my younger self to"),
  C("gr4", "growth", 3, "Where do you hope to be in five years, and what has to change to get there?", "In five years, I hope"),
  C("gr5", "growth", 3, "What makes a day feel well spent to you?", "A good day, for me, is one where"),
];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

/**
 * Build the eligible prompt pool for a level + focus selection, drawing from
 * both the curated syllabus and the learner's AI-generated library. Broadens
 * gracefully if a narrow filter would otherwise come up empty.
 */
export function promptPool(
  level: Difficulty,
  focuses: string[],
  aiPrompts: Prompt[],
): Prompt[] {
  const all = [...CURATED, ...aiPrompts];
  const focus = new Set(focuses);
  const inFocus = (p: Prompt) => focus.size === 0 || focus.has(p.themeId);

  let pool = all.filter((p) => p.level === level && inFocus(p));
  if (pool.length === 0) pool = all.filter(inFocus); // any level, keep focus
  if (pool.length === 0) pool = all.filter((p) => p.level === level); // drop focus
  if (pool.length === 0) pool = all;
  return pool;
}

/** Deterministic prompt-of-the-day that rotates across themes for coverage. */
export function dailyPrompt(
  day: DayKey,
  level: Difficulty,
  focuses: string[],
  aiPrompts: Prompt[],
): Prompt {
  const pool = promptPool(level, focuses, aiPrompts);
  const seed = Math.floor(parseDayKey(day).getTime() / 86_400_000);
  const themeOrder = [...new Set(pool.map((p) => p.themeId))];
  const themeId = themeOrder[seed % themeOrder.length];
  const inTheme = pool.filter((p) => p.themeId === themeId);
  return inTheme[seed % inTheme.length];
}

export function randomPrompt(
  level: Difficulty,
  focuses: string[],
  aiPrompts: Prompt[],
  excludeId?: string,
): Prompt {
  const base = promptPool(level, focuses, aiPrompts);
  const withoutCurrent = base.filter((p) => p.id !== excludeId);
  // If excluding the current prompt empties the pool (e.g. a narrow focus with
  // a single prompt), reuse the full pool rather than jumping outside the focus.
  const choose = withoutCurrent.length > 0 ? withoutCurrent : base;
  return choose[Math.floor(Math.random() * choose.length)] ?? CURATED[0];
}
