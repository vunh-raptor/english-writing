import type { Prompt, Difficulty, DayKey } from "../types";
import { parseDayKey } from "./date";

/**
 * The blank page is where paralysis lives. We never show one. Every session
 * opens with a leveled, *personal* prompt — about the learner's own life and
 * opinions, which is what makes writing feel meaningful (and meaning is what
 * drives flow). Difficulty is calibrated so the task sits between boredom and
 * anxiety.
 */

export const PROMPTS: Prompt[] = [
  // ---- Level 1: concrete, everyday, easy to start ----
  { id: "l1-food", level: 1, text: "What did you eat today? Describe it — how it looked, smelled, and tasted.", starter: "Today I ate" },
  { id: "l1-morning", level: 1, text: "Walk me through your morning, step by step.", starter: "First, I" },
  { id: "l1-weather", level: 1, text: "What is the weather like right now, and how does it make you feel?", starter: "Right now it is" },
  { id: "l1-room", level: 1, text: "Look around the room. Describe three things you can see.", starter: "Near me there is" },
  { id: "l1-weekend", level: 1, text: "What do you want to do this weekend?", starter: "This weekend I want to" },
  { id: "l1-music", level: 1, text: "What music have you listened to lately? Why do you like it?", starter: "Lately I have been listening to" },
  { id: "l1-person", level: 1, text: "Describe a person you saw today, even a stranger.", starter: "I saw someone who" },

  // ---- Level 2: opinions, small stories, light reflection ----
  { id: "l2-changemind", level: 2, text: "Tell me about a time you changed your mind about something.", starter: "I used to think" },
  { id: "l2-city", level: 2, text: "Would you rather live in a big city or a small town? Explain why.", starter: "I would rather live" },
  { id: "l2-skill", level: 2, text: "What is a skill you wish you had, and what would you do with it?", starter: "If I could" },
  { id: "l2-advice", level: 2, text: "What advice would you give your younger self?", starter: "I would tell my younger self to" },
  { id: "l2-routine", level: 2, text: "Describe a small habit that makes your day better.", starter: "One thing that helps me is" },
  { id: "l2-disagree", level: 2, text: "What is a popular opinion you quietly disagree with?", starter: "A lot of people think, but I" },
  { id: "l2-travel", level: 2, text: "Describe a place you have been that surprised you.", starter: "I did not expect" },
  { id: "l2-fear", level: 2, text: "What is something that used to scare you but doesn't anymore?", starter: "I used to be afraid of" },

  // ---- Level 3: abstract, argumentative, richer reflection ----
  { id: "l3-success", level: 3, text: "How do you personally define success? Has that definition changed?", starter: "To me, success means" },
  { id: "l3-tech", level: 3, text: "Is technology making our lives better or worse? Argue your side.", starter: "I believe technology" },
  { id: "l3-failure", level: 3, text: "Describe a failure that taught you something important.", starter: "It did not go the way I planned, but" },
  { id: "l3-money", level: 3, text: "If money were no object, how would you spend your time?", starter: "Without worrying about money, I would" },
  { id: "l3-belief", level: 3, text: "What is a belief you hold strongly, and where did it come from?", starter: "I strongly believe that" },
  { id: "l3-future", level: 3, text: "Where do you hope to be in five years, and what has to change to get there?", starter: "In five years, I hope" },
  { id: "l3-meaning", level: 3, text: "What makes a day feel well spent to you?", starter: "A good day, for me, is one where" },
];

export function promptsForLevel(level: Difficulty): Prompt[] {
  return PROMPTS.filter((p) => p.level === level);
}

/** Deterministic prompt-of-the-day so the home screen is stable within a day. */
export function dailyPrompt(day: DayKey, level: Difficulty): Prompt {
  const pool = promptsForLevel(level);
  // Day-number seed → stable index for the day, rotating over time.
  const seed = Math.floor(parseDayKey(day).getTime() / 86_400_000);
  return pool[seed % pool.length];
}

export function randomPrompt(level: Difficulty, excludeId?: string): Prompt {
  const pool = promptsForLevel(level).filter((p) => p.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function promptById(id: string): Prompt | undefined {
  return PROMPTS.find((p) => p.id === id);
}
