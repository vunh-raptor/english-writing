import type { Phrase } from "../types";
import { todayKey, parseDayKey } from "./date";

/**
 * A seed set of high-frequency, genuinely native phrases/idioms — the kind
 * people actually say. (Later these also come from trending content and from
 * phrases mined from the learner's own writing.)
 */
export const SEED_PHRASES: Phrase[] = [
  { id: "ph-ice", text: "break the ice", meaning: "start a conversation in an awkward or new situation", example: "I told a joke to break the ice with the new team.", register: "casual" },
  { id: "ph-page", text: "on the same page", meaning: "in agreement / sharing the same understanding", example: "Let's have a quick call so we're all on the same page.", register: "at work" },
  { id: "ph-cake", text: "a piece of cake", meaning: "very easy", example: "The exam was a piece of cake — I finished early.", register: "casual" },
  { id: "ph-day", text: "call it a day", meaning: "decide to stop working for now", example: "We've done enough — let's call it a day.", register: "casual" },
  { id: "ph-bell", text: "ring a bell", meaning: "sound familiar", example: "That name rings a bell, but I can't place her.", register: "casual" },
  { id: "ph-chase", text: "cut to the chase", meaning: "get to the point without wasting time", example: "I'll cut to the chase: we need this by Friday.", register: "at work" },
  { id: "ph-court", text: "the ball is in your court", meaning: "it's your turn to decide or act", example: "I've sent my offer — now the ball is in your court.", register: "neutral" },
  { id: "ph-bullet", text: "bite the bullet", meaning: "force yourself to do something difficult you've been avoiding", example: "I finally bit the bullet and booked the dentist.", register: "casual", origin: "From soldiers biting a bullet to bear pain before anesthetic." },
  { id: "ph-hang", text: "hang in there", meaning: "stay strong; don't give up", example: "I know it's hard — hang in there, it gets better.", register: "casual" },
  { id: "ph-weather", text: "under the weather", meaning: "feeling a little ill", example: "I'm a bit under the weather, so I'll rest today.", register: "casual" },
  { id: "ph-sack", text: "hit the sack", meaning: "go to bed", example: "I'm exhausted — I'm going to hit the sack.", register: "casual" },
  { id: "ph-beans", text: "spill the beans", meaning: "reveal a secret", example: "Come on, spill the beans — what did she say?", register: "casual", origin: "Possibly from ancient voting with beans that could be spilled early." },
];

export function phraseById(id: string): Phrase | undefined {
  return SEED_PHRASES.find((p) => p.id === id);
}

/**
 * "Today's phrases": a small, stable-per-day set that skips already-mastered
 * ones. Deterministic by day so the session doesn't shuffle on reload.
 */
export function todaysPhrases(mastered: string[], count = 3): Phrase[] {
  const pool = SEED_PHRASES.filter((p) => !mastered.includes(p.id));
  const source = pool.length >= count ? pool : SEED_PHRASES; // once all learned, review
  const seed = Math.floor(parseDayKey(todayKey()).getTime() / 86_400_000);
  const out: Phrase[] = [];
  for (let i = 0; i < count && i < source.length; i++) {
    out.push(source[(seed + i * 5) % source.length]);
  }
  // De-dup in case of wrap.
  return out.filter((p, i) => out.findIndex((q) => q.id === p.id) === i);
}
