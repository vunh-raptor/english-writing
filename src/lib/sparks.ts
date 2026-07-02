import type { WriteBeat } from "../types";

/**
 * The anti-stuck engine. When a writer pauses, we offer a "spark": a tiny
 * question plus a tappable sentence-starter that drops straight into their
 * text. The design goal is the social-feed feeling — there is *always* a next
 * thing, and continuing costs one tap, not a decision.
 *
 * Sparks are discourse moves (why? / example / feeling / what next…) — the
 * universal ways any text can continue — lightly contextualized with a word
 * from the learner's own writing. This local engine is instant and offline;
 * AI sparks (generated from their actual text) join the queue when available.
 */

export interface Spark {
  id: string;
  question: string;
  starter: string;
  source: "local" | "ai";
}

interface Move {
  cat: string;
  question: string;
  /** Contextual variant; `{w}` is replaced with a word from their text. */
  questionWith?: string;
  starter: string;
}

const MOVES: Move[] = [
  { cat: "why", question: "Why is that?", questionWith: "Why does “{w}” matter to you?", starter: "Because" },
  { cat: "example", question: "Can you give an example?", questionWith: "Give one example of “{w}”.", starter: "For example," },
  { cat: "feeling", question: "How did it feel?", starter: "It felt like" },
  { cat: "next", question: "What happened next?", starter: "After that," },
  { cat: "detail", question: "What could you see or hear?", starter: "I remember" },
  { cat: "compare", question: "What is it similar to?", questionWith: "What is “{w}” similar to?", starter: "It's a bit like" },
  { cat: "person", question: "What would a friend say about this?", starter: "My friend would say" },
  { cat: "past", question: "Was it always this way?", starter: "It used to be" },
  { cat: "future", question: "What do you hope happens next?", starter: "I hope" },
  { cat: "other-side", question: "Could someone see it differently?", starter: "Some people might say" },
  { cat: "zoom-out", question: "Why does this matter?", questionWith: "Why does “{w}” matter?", starter: "This matters because" },
  { cat: "more", question: "Tell me more about that.", questionWith: "Tell me more about “{w}”.", starter: "What I mean is" },
];

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "so", "to", "of", "in", "on", "at", "for",
  "with", "is", "am", "are", "was", "were", "be", "been", "it", "i", "you", "he",
  "she", "we", "they", "my", "your", "this", "that", "have", "has", "had", "do",
  "did", "not", "as", "if", "then", "there", "here", "very", "about", "from",
  "because", "when", "what", "like", "just", "really", "some", "more", "than",
]);

/** The last meaningful word of their recent text, to personalize a spark. */
function topicWord(text: string): string | null {
  const tail = text.slice(-160).toLowerCase();
  const words = tail.match(/[a-z][a-z'-]{3,}/g) ?? [];
  for (let i = words.length - 1; i >= 0; i--) {
    if (!STOP.has(words[i])) return words[i];
  }
  return null;
}

let counter = 0;
function makeId(): string {
  return `spk-${Date.now().toString(36)}-${counter++}`;
}

/**
 * A stateful engine per writing session: rotates through move categories
 * without repeating recent ones, personalizing with the writer's own words.
 */
export function createSparkEngine() {
  const recent: string[] = [];

  return {
    next(text: string, beat: WriteBeat): Spark {
      // Blank page: the kindest spark is "just start" with the beat's starter.
      if (text.trim().length === 0) {
        return {
          id: makeId(),
          question: "Just write the first thing in your head — it doesn't need to be good.",
          starter: beat.starter ?? "I think",
          source: "local",
        };
      }

      const pool = MOVES.filter((m) => !recent.includes(m.cat));
      const move = pool[Math.floor(Math.random() * pool.length)] ?? MOVES[0];
      recent.push(move.cat);
      if (recent.length > 5) recent.shift();

      const w = topicWord(text);
      const question =
        w && move.questionWith ? move.questionWith.replace("{w}", w) : move.question;

      return { id: makeId(), question, starter: move.starter, source: "local" };
    },
  };
}

/** Word counts that earn a tiny celebration mid-session. */
export const MILESTONES = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
