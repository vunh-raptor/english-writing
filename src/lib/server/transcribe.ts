import "server-only";
import type {
  MilestoneQuiz,
  MilestoneVerdict,
  NewsLevel,
  SlipPattern,
  TranscribeCue,
} from "@/types";
import type { LearnerSnapshot } from "@/lib/shared/prompt";
import { extractObject, str, strList } from "@/lib/shared/modelJson";
import { rawComplete } from "./ai";
import {
  EXPLAIN_SYSTEM,
  JUDGE_SYSTEM,
  MILESTONE_SYSTEM,
  explainUser,
  judgeUser,
  milestoneUser,
} from "./prompts/transcribe";
import { phraseMatcher } from "@/lib/shared/phrases";
import { countWords } from "@/lib/shared/stats";

/**
 * The Transcribe server layer (docs/TRANSCRIBE.md) — a caption fetcher plus
 * three small stateless AI jobs. Same robustness idiom as `phrasebook.ts`:
 * extract the first {…}, coerce per field, fail soft. Learner text and
 * third-party captions are content, never instructions.
 *
 * Note what is NOT here: the score. Dictation accuracy, the word diff and the
 * missed-word list are computed in `lib/shared/transcribe.ts` and passed IN.
 * A model that judged the transcription could mark a correct word wrong, and
 * there is no version of this mode that survives that. The model's whole job
 * downstream is to name the *pattern* behind slips code already found.
 */

// ---------------------------------------------------------------------------
// 1. Captions for a pasted link
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3_000_000;
/** Long enough for an hour of speech; finite so one paste can't exhaust memory. */
const MAX_CUES = 4_000;

const UA =
  "Mozilla/5.0 (compatible; FlowriteReader/1.0; +https://github.com/vunh-raptor/english-writing)";

/**
 * Pull the video id out of anything a learner is likely to paste — a watch URL,
 * a share link, an embed, or the bare id.
 *
 * This is what keeps the fetch below safe. Unlike `extract.ts`, which must
 * fetch a host the user chose and therefore carries full request-forgery
 * guards, this never fetches a user-supplied host at all: we take eleven
 * characters of id and build our own YouTube URL. There is no hostname here
 * for an attacker to point anywhere.
 */
export function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const id =
    host === "youtu.be"
      ? url.pathname.slice(1)
      : host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com"
        ? url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop() || ""
        : "";
  return /^[\w-]{11}$/.test(id) ? id : null;
}

async function getText(url: string, accept: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept, "accept-language": "en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Upstream said ${res.status}.`);
  return (await res.text()).slice(0, MAX_BYTES);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&(\w+|#\d+);/g, (m, name: string) => ENTITIES[name] ?? m);
}

/** Parse YouTube's timedtext XML into cues. */
function parseTimedText(xml: string): TranscribeCue[] {
  const cues: TranscribeCue[] = [];
  const re = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && cues.length < MAX_CUES) {
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const start = Number(m[1]);
    const dur = Number(m[2]);
    if (!Number.isFinite(start) || !Number.isFinite(dur)) continue;
    cues.push({ start, end: start + dur, text });
  }
  return cues;
}

/** Prefer a real English track; an auto-generated one is better than nothing. */
function pickTrack(tracks: { baseUrl: string; languageCode?: string; kind?: string }[]) {
  const english = tracks.filter((t) => (t.languageCode ?? "").toLowerCase().startsWith("en"));
  const pool = english.length > 0 ? english : tracks;
  return pool.find((t) => t.kind !== "asr") ?? pool[0];
}

export interface FetchedTranscript {
  title: string;
  cues: TranscribeCue[];
}

/**
 * The transcript behind a pasted video, as timed cues, plus its title — both
 * off one page fetch.
 *
 * Throws when there are no captions, which is a normal outcome rather than a
 * bug, and the UI says so plainly. A video nobody captioned cannot be cut into
 * chunks, and guessing at the words would make the score a lie.
 */
export async function fetchTranscript(videoId: string): Promise<FetchedTranscript> {
  // Two different failures the learner needs told apart: we couldn't reach the
  // video at all, versus we reached it and it simply has no captions. Only the
  // second means "pick a curated clip instead".
  let page: string;
  try {
    page = await getText(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      "text/html",
    );
  } catch {
    throw new Error("That video couldn't be reached just now. Try again in a moment.");
  }

  const titleMatch = page.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch
    ? decodeEntities(titleMatch[1]).replace(/\s*-\s*YouTube\s*$/, "").trim().slice(0, 120)
    : "";

  const blob = page.match(/"captionTracks":(\[.*?\])/);
  if (!blob) throw new Error("That video has no captions to cut.");

  let tracks: { baseUrl: string; languageCode?: string; kind?: string }[];
  try {
    tracks = JSON.parse(blob[1]);
  } catch {
    throw new Error("That video has no captions to cut.");
  }

  const track = Array.isArray(tracks) ? pickTrack(tracks.filter((t) => t?.baseUrl)) : undefined;
  if (!track) throw new Error("That video has no captions to cut.");

  // The baseUrl comes from YouTube's own page, but it is still third-party
  // data, so it is pinned to the host we expect before it is fetched.
  const url = new URL(decodeEntities(track.baseUrl.replace(/\\u0026/g, "&")));
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) {
    throw new Error("That video has no captions to cut.");
  }

  const cues = parseTimedText(await getText(url.toString(), "text/xml"));
  if (cues.length === 0) throw new Error("That video has no captions to cut.");
  return { title: title || "Your clip", cues };
}

// ---------------------------------------------------------------------------
// 2. Name the pattern behind the slips
// ---------------------------------------------------------------------------

export interface SlipExplanation {
  patterns: SlipPattern[];
  keep: string[];
}

/**
 * Explain the slips a dictation check already found. The `missed` list is the
 * authority: it was computed deterministically and is passed in so the model
 * describes it rather than re-deriving it. A failure here costs the learner an
 * explanation, never a score — callers show the diff alone.
 */
export async function explainSlips(
  snapshot: LearnerSnapshot,
  reference: string,
  attempt: string,
  missed: string[],
): Promise<SlipExplanation> {
  if (missed.length === 0) return { patterns: [], keep: [] };

  const raw = await rawComplete(
    EXPLAIN_SYSTEM,
    explainUser(snapshot, reference, attempt, missed),
    500,
  );
  const obj = extractObject(raw);
  if (!obj) throw new Error("Explanation unavailable.");

  const patterns: SlipPattern[] = Array.isArray(obj.patterns)
    ? obj.patterns
        .map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return { label: str(o.label).slice(0, 60), note: str(o.note) };
        })
        .filter((p) => p.label && p.note)
        .slice(0, 2)
    : [];

  // Keep-phrases must actually come from the passage — a phrase the speaker
  // never said is not something the learner heard, and it would poison the
  // Phrasebook with material that has no source.
  const keep = strList(obj.keep, 3).filter(
    (k) => countWords(k) <= 4 && phraseMatcher(k).test(reference),
  );

  return { patterns, keep };
}

// ---------------------------------------------------------------------------
// 3. The milestone — what stayed, and what can now be used
// ---------------------------------------------------------------------------

/**
 * The two questions and two phrases that gate a passage. Throws when the model
 * can't produce a usable pair; callers fall back to the local milestone so a
 * passage is never blocked by a provider outage.
 */
export async function milestoneCheck(
  snapshot: LearnerSnapshot,
  passage: string,
): Promise<MilestoneQuiz> {
  const raw = await rawComplete(MILESTONE_SYSTEM, milestoneUser(snapshot, passage), 500);
  const obj = extractObject(raw);
  if (!obj) throw new Error("Milestone unavailable.");

  const questions = strList(obj.questions, 2);
  // A phrase the passage doesn't contain can't be reused FROM the passage.
  const phrases = strList(obj.phrases, 2).filter(
    (p) => countWords(p) <= 5 && phraseMatcher(p).test(passage),
  );
  if (questions.length < 2 || phrases.length < 2) throw new Error("Milestone unavailable.");

  return { questions, phrases };
}

/** The words a code-computed verdict wears when the model didn't write one. */
const PASSED_NOTE = "You followed it and you used it — that's the passage closed.";
const MISSED_NOTE = "Both phrases need to turn up in a sentence that's yours. Have another go.";

/**
 * Judge a milestone attempt.
 *
 * The deterministic phrase check is the FLOOR: if code cannot find both phrases
 * in their sentence, the milestone does not pass, whatever the model says. The
 * model may only withhold a pass on comprehension grounds code cannot see.
 * Fails soft to the deterministic result alone.
 */
export async function judgeMilestone(
  snapshot: LearnerSnapshot,
  quiz: MilestoneQuiz,
  answers: string[],
  sentence: string,
): Promise<MilestoneVerdict> {
  const used = quiz.phrases.filter((p) => phraseMatcher(p).test(sentence));
  const bothUsed = used.length === quiz.phrases.length;
  const answered = answers.filter((a) => countWords(a) >= 3).length === quiz.questions.length;
  const floor = bothUsed && answered;

  try {
    const raw = await rawComplete(
      JUDGE_SYSTEM,
      judgeUser(snapshot, quiz, answers, sentence),
      260,
    );
    const obj = extractObject(raw);
    if (!obj) return { passed: floor, used, note: floor ? PASSED_NOTE : MISSED_NOTE };
    // The model can only tighten: it never turns a missing phrase into a pass.
    const passed = floor && obj.passed !== false;
    return { passed, used, note: str(obj.note) || (passed ? PASSED_NOTE : MISSED_NOTE) };
  } catch {
    return { passed: floor, used, note: floor ? PASSED_NOTE : MISSED_NOTE };
  }
}
