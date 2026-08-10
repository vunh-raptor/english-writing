import "server-only";
import type {
  ContentIdea,
  Polish,
  SourceRef,
  ThinkQuestion,
  ThinkRung,
  Upgrade,
} from "@/types";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { extractObject, str, strList } from "@/lib/shared/modelJson";
import { rawComplete } from "./ai";
import { countWords } from "@/lib/shared/stats";
import { RUNG_ORDER, checkBorrowing, ideaText } from "@/lib/shared/respond";
import {
  IDEAS_SYSTEM,
  POLISH_SYSTEM,
  QUESTIONS_SYSTEM,
  SHARPEN_SYSTEM,
  ideasUser,
  polishUser,
  questionsUser,
  sharpenUser,
} from "./prompts/respond";

/**
 * The Respond engine (docs/RESPOND.md) — four small stateless jobs, all bound
 * by one rule:
 *
 *   **The model asks; the learner answers. Never the other way round.**
 *
 * It may not summarize the source, propose an angle, or write a line the
 * learner could paste. A mode that hands back the model's thinking would let
 * someone finish a session having produced nothing, which is the exact failure
 * this app exists to avoid. The prompts say so, and the code checks it where
 * it can: a "question" that isn't interrogative is dropped.
 *
 *   thinkQuestions : four questions climbing grasp → assume → push → extend,
 *                    grounded in this specific source.
 *   sharpen        : one harder question about the answer they just gave.
 *   judgeIdeas     : are these angles theirs, or the source's? Model judgment
 *                    INTERSECTED with a deterministic borrowing check, so the
 *                    model can tighten the verdict but never loosen it.
 *   polishDraft    : what landed, ≤2 upgrades, phrases worth keeping.
 *
 * None of the four has a canned fallback any more. A generic ladder is a ladder
 * about nothing, and a canned celebration is feedback about work it never read
 * — an honest error the learner can retry is worth more than either.
 */

/** A question is a question. Anything declarative is the model answering. */
function looksLikeQuestion(s: string): boolean {
  return s.includes("?") && countWords(s) <= 45;
}

// ---------------------------------------------------------------------------
// 1. The thinking ladder
// ---------------------------------------------------------------------------

const RUNGS = new Set<ThinkRung>(RUNG_ORDER);

/**
 * Four source-grounded questions, in ladder order.
 *
 * All four rungs or none: a ladder missing its "assume" rung silently becomes a
 * different, easier exercise, and the learner has no way to know. Retries once,
 * then fails honestly.
 */
export async function thinkQuestions(
  snapshot: LearnerSnapshot,
  source: SourceRef,
  text: string,
): Promise<ThinkQuestion[]> {
  const prompt = questionsUser(snapshot, source, text);

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await rawComplete(QUESTIONS_SYSTEM, prompt, 700);
    const obj = extractObject(raw);
    const got = new Map<ThinkRung, string>();

    if (obj && Array.isArray(obj.questions)) {
      for (const q of obj.questions) {
        const o = (q ?? {}) as Record<string, unknown>;
        const rung = o.rung as ThinkRung;
        const question = str(o.question);
        if (RUNGS.has(rung) && !got.has(rung) && looksLikeQuestion(question)) {
          got.set(rung, question);
        }
      }
    }
    if (got.size === RUNG_ORDER.length) {
      return RUNG_ORDER.map((rung) => ({ rung, question: got.get(rung)! }));
    }
    console.warn(`[respond] questions attempt ${attempt}: got ${got.size} of ${RUNG_ORDER.length} rungs`);
  }

  throw new Error("Couldn't build the thinking ladder for this piece — try again.");
}

// ---------------------------------------------------------------------------
// 2. Sharpen — one harder question about what they just wrote
// ---------------------------------------------------------------------------

/**
 * One follow-up question about the answer they just gave.
 *
 * A canned "what makes you say that?" used to stand in here. It reads as a
 * real push and isn't one — it would be asked identically of every answer ever
 * written — so a failure now surfaces as a failure and the learner can ask
 * again.
 */
export async function sharpen(
  snapshot: LearnerSnapshot,
  question: string,
  answer: string,
): Promise<string> {
  const raw = await rawComplete(SHARPEN_SYSTEM, sharpenUser(snapshot, question, answer), 160);
  const q = str(extractObject(raw)?.question);
  if (!looksLikeQuestion(q)) throw new Error("Couldn't sharpen that one — try again.");
  return q;
}

// ---------------------------------------------------------------------------
// 3. Are these angles theirs?
// ---------------------------------------------------------------------------

/**
 * Judge each idea's originality. The deterministic borrowing check is the floor
 * and the model can only tighten it: if the learner's wording overlaps the
 * source enough to fail `checkBorrowing`, no amount of model enthusiasm makes
 * it their own. That asymmetry is the mirror of the judging elsewhere in the
 * app, where code can only ever *rescue* a real production.
 */
export async function judgeIdeas(
  snapshot: LearnerSnapshot,
  source: SourceRef,
  text: string,
  ideas: { id: string; hook: string; bullets: string[] }[],
): Promise<Pick<ContentIdea, "id" | "own" | "note" | "borrowed">[]> {
  const checks = new Map(ideas.map((i) => [i.id, checkBorrowing(text, ideaText(i))]));

  let fromModel = new Map<string, { own: boolean; note: string }>();
  try {
    const raw = await rawComplete(IDEAS_SYSTEM, ideasUser(snapshot, source, text, ideas), 700);
    const obj = extractObject(raw);
    if (obj && Array.isArray(obj.verdicts)) {
      fromModel = new Map(
        obj.verdicts
          .map((v) => (v ?? {}) as Record<string, unknown>)
          .filter((o) => str(o.id))
          .map((o) => [str(o.id), { own: o.own === true, note: str(o.note) }]),
      );
    }
  } catch {
    // Deterministic verdicts only — still a real, useful answer.
  }

  return ideas.map((i) => {
    const check = checks.get(i.id)!;
    const model = fromModel.get(i.id);
    // Both must agree it's theirs. Code can veto; the model cannot override.
    const own = check.own && (model ? model.own : true);
    const note =
      model?.note ||
      (own
        ? "That's an angle the piece didn't have — it's yours to write."
        : "This is still the article's point in new words. What do YOU know about it that they don't?");
    return {
      id: i.id,
      own,
      note,
      ...(check.longest && !check.own ? { borrowed: check.longest } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Polish the finished piece
// ---------------------------------------------------------------------------

/**
 * Encouragement-first feedback on the finished piece.
 *
 * This used to fail soft to a warm local note, on the reasoning that a finished
 * piece must never end on an error message. The note said "you turned it into
 * 137 words of your own" and nothing else, because it had not read a word of
 * it — praise for a word count, dressed as praise for the writing. An honest
 * "that didn't come back, try again" respects the work more.
 */
export async function polishDraft(
  snapshot: LearnerSnapshot,
  source: SourceRef,
  hook: string,
  draft: string,
): Promise<Polish> {
  const raw = await rawComplete(POLISH_SYSTEM, polishUser(snapshot, source, hook, draft), 800);
  const obj = extractObject(raw);
  const celebration = str(obj?.celebration);
  if (!obj || !celebration) throw new Error("Couldn't read your piece just now — try again.");

  const upgrades: Upgrade[] = Array.isArray(obj.upgrades)
    ? obj.upgrades
        .map((u) => (u ?? {}) as Record<string, unknown>)
        .map((o) => ({ you: str(o.you), upgrade: str(o.upgrade), why: str(o.why) }))
        .filter((u) => u.you && u.upgrade)
        .slice(0, 2)
    : [];

  const keep = Array.isArray(obj.keep)
    ? obj.keep
        .map((k) => (k ?? {}) as Record<string, unknown>)
        .map((o) => ({ text: str(o.text), meaning: str(o.meaning) }))
        // Only phrases they actually wrote — a "keep" they never produced
        // would put the model's language in their book under their name.
        .filter((k) => k.text && draft.toLowerCase().includes(k.text.toLowerCase()))
        .slice(0, 2)
    : [];

  return { celebration, landed: strList(obj.landed, 3), upgrades, keep };
}
