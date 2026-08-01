import type {
  DictationScore,
  DiffSegment,
  MilestoneQuiz,
  TranscribeChunk,
  TranscribeCue,
} from "@/types";

/**
 * The Transcribe engine (docs/TRANSCRIBE.md) — everything about the mode that
 * can be decided without a network, a key, or a model.
 *
 * Two ideas shape this file:
 *
 *   1. THE SCORE IS CODE'S JOB. Dictation is the one place in Flowrite where
 *      the learner's output can be checked against a known right answer, so it
 *      is checked exactly, here, and a model never gets a vote. A learner who
 *      wrote a word correctly must never be told they didn't — that is the
 *      failure that would make the mode unusable. The AI layer sits strictly
 *      downstream, naming the *pattern* behind slips this file already found.
 *
 *   2. CHUNKS FOLLOW SENTENCES, NOT THE CLOCK. Fifteen seconds is the budget,
 *      not the rule: cutting mid-clause would ask someone to transcribe half a
 *      thought, which tests short-term memory instead of listening. So the cut
 *      lands on the sentence boundary nearest the budget.
 */

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/** Word-match percentage a dictation must clear to open the next chunk. High
 *  enough that it means something, low enough that two slips don't block. */
export const PASS_LINE = 90;

/** Seconds of audio per chunk — long enough to hold a real sentence, short
 *  enough to hold in the ear. */
export const CHUNK_SECONDS = 15;

/** Chunks per passage. Eighty chunks with a full exam each would be punishing,
 *  so comprehension is asked every tenth — the milestone. */
export const CHUNKS_PER_PASSAGE = 10;

/** Cut no earlier than this fraction of the budget when honouring a sentence. */
const MIN_CHUNK_RATIO = 0.6;

/** A learner who pastes an essay instead of a chunk shouldn't hang the diff. */
const MAX_ATTEMPT_WORDS = 400;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** Word tokens, keeping the learner's original spelling for display. */
const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

export function splitWords(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

/**
 * A word plus whatever punctuation trails it.
 *
 * Scoring only ever looks at `word`, but the diff has to hand the learner back
 * the sentence they actually wrote — commas and full stops included — or it
 * stops being *their* text on the page and becomes a list of tokens.
 */
const TOKEN_RE = /([\p{L}\p{N}][\p{L}\p{N}'’-]*)([^\p{L}\p{N}\s]*)/gu;

interface Token {
  word: string;
  /** The word as it should appear on screen, punctuation and all. */
  display: string;
}

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) out.push({ word: m[1], display: m[1] + m[2] });
  return out;
}

/**
 * The comparison form. Case, curly apostrophes, and surrounding punctuation are
 * all normalized away: the mode scores whether the *word* was heard, and
 * marking someone down for a straight quote would be scoring their keyboard.
 */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[’']/g, "'").replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// The diff
// ---------------------------------------------------------------------------

/** Longest-common-subsequence table over the normalized token arrays. */
function lcsTable(ref: string[], att: string[]): Uint16Array[] {
  const rows: Uint16Array[] = [];
  for (let i = 0; i <= ref.length; i++) rows.push(new Uint16Array(att.length + 1));
  for (let i = ref.length - 1; i >= 0; i--) {
    for (let j = att.length - 1; j >= 0; j--) {
      rows[i][j] =
        ref[i] === att[j]
          ? rows[i + 1][j + 1] + 1
          : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  return rows;
}

type RawOp =
  | { op: "ok"; heard: string }
  | { op: "miss"; heard: string }
  | { op: "extra"; wrote: string };

/** Walk the LCS table into an ordered op list. */
function alignOps(ref: Token[], att: Token[]): RawOp[] {
  const refNorm = ref.map((t) => normalizeWord(t.word));
  const attNorm = att.map((t) => normalizeWord(t.word));
  const table = lcsTable(refNorm, attNorm);
  const ops: RawOp[] = [];
  let i = 0;
  let j = 0;
  while (i < ref.length && j < att.length) {
    if (refNorm[i] === attNorm[j]) {
      // Correct: show it as the learner punctuated it — it is their sentence.
      ops.push({ op: "ok", heard: att[j].display });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ op: "miss", heard: ref[i].display });
      i++;
    } else {
      ops.push({ op: "extra", wrote: att[j].display });
      j++;
    }
  }
  while (i < ref.length) ops.push({ op: "miss", heard: ref[i++].display });
  while (j < att.length) ops.push({ op: "extra", wrote: att[j++].display });
  return ops;
}

/**
 * Collapse a run of slips into the tutor's-pencil shape: an extra paired with a
 * miss is one *substitution* ("warm" → **warms**), which is what a learner
 * actually did, rather than two unrelated marks in the margin.
 */
function toSegments(ops: RawOp[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  let run: RawOp[] = [];

  const flush = () => {
    const wrote = run.filter((o): o is Extract<RawOp, { op: "extra" }> => o.op === "extra");
    const heard = run.filter((o): o is Extract<RawOp, { op: "miss" }> => o.op === "miss");
    const pairs = Math.min(wrote.length, heard.length);
    for (let k = 0; k < pairs; k++) {
      out.push({ kind: "fix", wrote: wrote[k].wrote, heard: heard[k].heard });
    }
    for (let k = pairs; k < wrote.length; k++) out.push({ kind: "extra", wrote: wrote[k].wrote });
    for (let k = pairs; k < heard.length; k++) out.push({ kind: "miss", heard: heard[k].heard });
    run = [];
  };

  for (const op of ops) {
    if (op.op === "ok") {
      flush();
      const last = out[out.length - 1];
      // Runs of correct words merge, so the diff reads as prose rather than
      // as a list of tokens.
      if (last && last.kind === "ok") last.heard = `${last.heard} ${op.heard}`;
      else out.push({ kind: "ok", heard: op.heard });
    } else {
      run.push(op);
    }
  }
  flush();
  return out;
}

/**
 * Check one dictation against what was actually said.
 *
 * Accuracy is matched words over the LONGER of the two texts, so padding an
 * attempt with words that weren't there can't inflate the percentage — the
 * denominator grows with it.
 */
export function scoreDictation(
  reference: string,
  attempt: string,
  passLine: number = PASS_LINE,
): DictationScore {
  const ref = tokenize(reference);
  const att = tokenize(attempt).slice(0, MAX_ATTEMPT_WORDS);

  const ops = alignOps(ref, att);
  const matched = ops.reduce((n, o) => (o.op === "ok" ? n + 1 : n), 0);
  const denominator = Math.max(ref.length, att.length);
  const accuracy = denominator === 0 ? 0 : Math.round((matched / denominator) * 100);
  const segments = toSegments(ops);

  // Missed words go to the Phrasebook, where trailing punctuation would be
  // noise — so these are stripped back to the bare word.
  const missed: string[] = [];
  const seen = new Set<string>();
  for (const seg of segments) {
    if (seg.kind !== "fix" && seg.kind !== "miss") continue;
    const bare = splitWords(seg.heard ?? "")[0];
    if (!bare) continue;
    const key = normalizeWord(bare);
    if (seen.has(key)) continue;
    seen.add(key);
    missed.push(bare);
  }

  return {
    accuracy,
    passed: ref.length > 0 && accuracy >= passLine,
    segments,
    missed,
    total: ref.length,
  };
}

// ---------------------------------------------------------------------------
// Cutting a clip into chunks
// ---------------------------------------------------------------------------

function endsSentence(text: string): boolean {
  return /[.!?]["'”’)\]]?\s*$/.test(text);
}

/** Index of the last cue in `buf` that closed a sentence, or -1. */
function lastBoundaryIn(buf: TranscribeCue[]): number {
  for (let i = buf.length - 1; i >= 0; i--) if (endsSentence(buf[i].text)) return i;
  return -1;
}

function makeChunk(index: number, buf: TranscribeCue[]): TranscribeChunk {
  const text = buf
    .map((c) => c.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
  return {
    index,
    start: buf[0].start,
    end: buf[buf.length - 1].end,
    text,
    stress: stressWords(text),
  };
}

/**
 * Cut a cued transcript into chunks of roughly `seconds`, landing every cut on
 * the sentence boundary nearest the budget. A cue list with no punctuation at
 * all still cuts — on the clock, as a last resort.
 */
export function cutIntoChunks(
  cues: TranscribeCue[],
  seconds: number = CHUNK_SECONDS,
): TranscribeChunk[] {
  const usable = cues.filter((c) => c.text.trim());
  if (usable.length === 0) return [];

  const chunks: TranscribeChunk[] = [];
  let buf: TranscribeCue[] = [];

  for (const cue of usable) {
    buf.push(cue);
    if (cue.end - buf[0].start < seconds) continue;

    // Past the budget: close on the last sentence end, unless that would make
    // an uncomfortably short chunk, in which case close here.
    const boundary = lastBoundaryIn(buf);
    const cutAt =
      boundary >= 0 && buf[boundary].end - buf[0].start >= seconds * MIN_CHUNK_RATIO
        ? boundary
        : buf.length - 1;

    chunks.push(makeChunk(chunks.length, buf.slice(0, cutAt + 1)));
    buf = buf.slice(cutAt + 1);
  }

  if (buf.length > 0) chunks.push(makeChunk(chunks.length, buf));
  return chunks;
}

// ---------------------------------------------------------------------------
// Passages
// ---------------------------------------------------------------------------

/** Which passage (0-based) a chunk belongs to. */
export function passageOf(chunkIndex: number): number {
  return Math.floor(chunkIndex / CHUNKS_PER_PASSAGE);
}

export function passageCount(chunks: number): number {
  return Math.ceil(chunks / CHUNKS_PER_PASSAGE);
}

/** The inclusive chunk range a passage covers, clamped to the clip. */
export function passageRange(passage: number, chunks: number): { from: number; to: number } {
  const from = passage * CHUNKS_PER_PASSAGE;
  return { from, to: Math.min(from + CHUNKS_PER_PASSAGE - 1, chunks - 1) };
}

/** A milestone is due when the last chunk of a passage has just been cleared. */
export function milestoneDue(chunkIndex: number, chunks: number): boolean {
  const { to } = passageRange(passageOf(chunkIndex), chunks);
  return chunkIndex === to;
}

// ---------------------------------------------------------------------------
// Scaffolds — they unlock language, they never finish the line
// ---------------------------------------------------------------------------

/**
 * The peek: every word reduced to its first letter, punctuation kept. Enough
 * shape to unstick someone who has the sentence and lost one word; never
 * enough to write the line from.
 */
export function firstLetters(text: string): string {
  return text.replace(WORD_RE, (w) => w[0]);
}

/** Words too ordinary to be the "hard one", or to carry sentence stress. */
const FUNCTION_WORDS = new Set(
  ("a an the and or but so yet for nor of to in on at by from with as is are was were be been being " +
    "it its they them their this that these those we you i he she his her him our your my me not no " +
    "than then when while if do does did have has had will would can could may might must there here " +
    "what which who whom whose how why all any some each every one two both very just more most other")
    .split(" "),
);

/**
 * The single hardest word in a chunk — the one "reveal one word" spends its
 * miss on. Longest content word wins, which in practice picks the technical
 * term a learner genuinely couldn't spell rather than a word they simply
 * mistyped.
 */
export function hardestWord(text: string): string {
  let best = "";
  for (const w of splitWords(text)) {
    if (FUNCTION_WORDS.has(normalizeWord(w))) continue;
    if (w.length > best.length) best = w;
  }
  return best;
}

/**
 * Content words carrying the sentence stress — what the shadowing pane
 * underlines so a learner knows where the speaker leans, not just what she
 * said. Spread across the chunk rather than clustered at its start.
 */
export function stressWords(text: string, max = 7): string[] {
  const content = splitWords(text).filter(
    (w) => w.length >= 4 && !FUNCTION_WORDS.has(normalizeWord(w)),
  );
  if (content.length <= max) return content;
  const step = content.length / max;
  return Array.from({ length: max }, (_, i) => content[Math.floor(i * step)]);
}

// ---------------------------------------------------------------------------
// The offline milestone
// ---------------------------------------------------------------------------

/**
 * Two reusable phrases pulled straight out of a passage: runs of consecutive
 * content words, longest first, taken from different parts of the text so they
 * aren't two halves of the same clause.
 */
export function keyPhrases(passage: string, want = 2): string[] {
  const words = splitWords(passage);
  const runs: { text: string; at: number }[] = [];
  let run: string[] = [];
  let startedAt = 0;

  const flush = () => {
    if (run.length >= 2) runs.push({ text: run.slice(0, 3).join(" "), at: startedAt });
    run = [];
  };
  words.forEach((w, i) => {
    if (FUNCTION_WORDS.has(normalizeWord(w)) || w.length < 4) {
      flush();
      return;
    }
    if (run.length === 0) startedAt = i;
    run.push(w);
  });
  flush();

  const picked: { text: string; at: number }[] = [];
  for (const candidate of [...runs].sort((a, b) => b.text.length - a.text.length)) {
    if (picked.length >= want) break;
    if (picked.some((p) => p.text === candidate.text)) continue;
    // Keep the picks apart, so the milestone asks for two different ideas
    // rather than two halves of one clause.
    if (picked.some((p) => Math.abs(p.at - candidate.at) < 8)) continue;
    picked.push(candidate);
  }
  return picked.map((p) => p.text);
}

/**
 * The milestone a passage gets when no model is available. The questions are
 * generic in shape but real in demand: both require having followed the
 * passage, and neither can be answered by copying it back.
 */
export function localMilestone(passage: string): MilestoneQuiz {
  return {
    questions: [
      "In your own words, what was this passage actually about?",
      "What is the one thing here you would tell someone else, and why that one?",
    ],
    phrases: keyPhrases(passage, 2),
  };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * The rhythm of a spoken line, as normalized 0..1 bars.
 *
 * This is not a recording of the audio — it is derived from the words, by
 * spreading them across the chunk and weighting each bar by the length of the
 * words landing in it. That makes it an honest picture of *where the line is
 * heavy*, which is what the shadowing pane is asking the learner to match, and
 * it needs no decoded audio to draw.
 */
export function speechShape(text: string, bars: number): number[] {
  const words = splitWords(text);
  if (words.length === 0 || bars <= 0) return [];

  const out = new Array<number>(bars).fill(0);
  const perBar = words.length / bars;
  for (let b = 0; b < bars; b++) {
    const from = Math.floor(b * perBar);
    const to = Math.max(from + 1, Math.floor((b + 1) * perBar));
    let weight = 0;
    for (let i = from; i < to && i < words.length; i++) weight += words[i].length;
    out[b] = weight / (to - from);
  }

  const max = Math.max(...out);
  // A gentle floor keeps silent-looking bars visible as bars.
  return max > 0 ? out.map((v) => 0.18 + 0.82 * (v / max)) : out;
}

/** `mm:ss` — every timestamp in the mode is mono and tabular. */
export function clockTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
