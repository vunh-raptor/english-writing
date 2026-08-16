import "server-only";
import {
  jsonContract,
  joinParts,
  numbered,
  renderSnapshot,
  section,
  type LearnerSnapshot,
} from "@/lib/shared/prompt";
import { PITCH, UNTRUSTED } from "./blocks";

/**
 * The word curriculum, written for one learner.
 *
 * This replaced a hand-curated frequency spine bundled with the app. Two things
 * the bundled list could not do, and this must:
 *
 *  - **Never repeat what they know.** The learner's met items go in as an
 *    explicit exclusion list, so the curriculum keeps moving instead of
 *    running out after a few hundred days.
 *  - **Keep the two findings the old list was built on.** Frequency-first
 *    (the General Service List tradition: a couple of thousand words carry most
 *    of everyday English), and never two words from one semantic field in the
 *    same batch — semantically clustered sets interfere and are learned more
 *    slowly (Tinkham 1993; Finkbeiner & Nicol 2003; Erten & Tekin 2008).
 *
 * Those findings are pedagogy, not content, so they belong in the prompt rather
 * than in a list of words.
 */

export const VERSION = "curriculum.words.v1";

export const SYSTEM = joinParts([
  "You build the next batch of a personal English vocabulary curriculum. You get everything the app knows about one learner; you return words they should meet next.",

  section(
    "WHICH WORDS",
    numbered([
      "Frequency first. Choose words a learner will actually need to PRODUCE in everyday life — the common spine of the language, not rare words that only impress. A word they will use this month beats a word they will admire.",
      "Never a word they already know. The exclusion list is exhaustive: if it is on the list, or an obvious inflection of something on it, it is spent.",
      "One word per semantic field per batch, and avoid the fields covered recently. Words taught in a cluster (five kinds of weather, four ways to be happy) interfere with each other and are learned more slowly. Spread the batch across unrelated areas of life.",
      "Pitch to the band. Most words sit at the learner's own band; a couple may sit one band above if they are common enough to be worth reaching for.",
      "Lean towards what they write about, when the app knows. A word is easier to keep when the first place they use it is a subject they care about.",
    ]),
  ),

  section(
    "WHAT EACH WORD CARRIES",
    numbered([
      'word: the citation form, lowercase, one word. No phrases.',
      'pos: "verb" | "noun" | "adjective" | "adverb" — the part of speech this entry teaches.',
      'band: "A2" | "B1" | "B2" | "C1" — where this word is normally met.',
      "meaning: a plain-words gloss at the band's level. Explain it the way you would to a friend, not the way a dictionary would. Never use the word itself in its own gloss.",
      "example: ONE natural sentence showing the word in ordinary use — the first encounter's context.",
      "collocations: 2-4 of its most natural partner chunks (for \"decision\": \"make a decision\", \"a tough decision\"). This is the thing that arrives last in a second language, so it is worth getting right.",
      'field: one or two plain words naming the semantic area ("money", "getting somewhere late", "disagreeing politely"). Used to keep sets apart — no two words in one batch may share one.',
    ]),
  ),

  PITCH,
  UNTRUSTED,

  jsonContract(
    `{"words":[{"word":"...","pos":"verb","band":"B1","meaning":"...","example":"...","collocations":["...","..."],"field":"..."}]}`,
  ),
]);

/** The per-request half: this learner, this many words. */
export function user(snapshot: LearnerSnapshot, count: number): string {
  return joinParts([
    renderSnapshot(snapshot, ["level", "streak", "known", "struggles", "topics", "fields", "recent"]),
    section("ASKED FOR", `${count} new words, in the order they should be met.`),
  ]);
}
