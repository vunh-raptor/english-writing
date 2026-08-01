/**
 * Core data model for Flowrite.
 *
 * Everything lives on-device in localStorage — private by default, no account,
 * no audience. Nothing here ever leaves the browser except, optionally, the
 * text the learner explicitly sends for AI feedback.
 */

/** A calendar day in the learner's local time, formatted `YYYY-MM-DD`. */
export type DayKey = string;

export interface Settings {
  /** Optional first name, only used to greet warmly. */
  name: string;
  /** How many brand-new words a daily set introduces (the deliberate dose). */
  wordsPerDay: number;
  /** Juicy completion sound when a session lands. */
  sound: boolean;
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
  profile: Profile;
  settings: Settings;
  vocab: Vocab;
  /** Spaced-repetition schedule per lexical item id (phrases and daily words). */
  phraseSrs: Record<string, SrsRecord>;
  /** Clean applications per local day (Daily Words, Phrasebook drills, News Chat
   *  missions) — powers the "this week" cards. Pruned to recent days. */
  phraseApplied: Record<DayKey, number>;
  /** The learner's lexical pool — daily words they've met, mission targets/keeps
   *  from News Chat, and captured highlights. The Phrasebook's library. */
  minedPhrases: Phrase[];
  /** Which curated words each local day introduced — keeps today's set stable
   *  across reloads and reopenings. Pruned to recent days. */
  wordDays: Record<DayKey, string[]>;
  /** The last sentence the learner wrote with each item, keyed by item id.
   *  Their own words are the best retrieval cue we have, so weeks later the
   *  `echo` drill gaps this back to them (docs/DAILY_WORDS.md). */
  myLines: Record<string, string>;
  /** Saved News Chat conversations — powers the /news dashboard (recent, stats, resume). */
  newsSessions: NewsSession[];
  /** Saved Respond sessions — the reading, the thinking, and the idea bank
   *  of angles the learner wrote but hasn't drafted yet. */
  respondSessions: RespondSession[];
  /** Saved Transcribe sessions — where in each clip the ear got to. */
  transcribeSessions: TranscribeSession[];
  /** Rolling CEFR-ish level — the band daily words are drawn at and missions
   *  are planned at. */
  newsLevel: NewsLevel;
  /** Whether the learner has finished their first session (we defer nudges). */
  hasWritten: boolean;
}

/** A common alternative way natives express the same idea. */
export interface PhraseAlternative {
  text: string;
  /** Optional nuance/register note, e.g. "more formal". */
  note?: string;
}

/** What kind of lexical unit an item is — the Phrasebook holds them all, and
 *  practice adapts (a word drills with its collocations; an idiom rephrases). */
export type LexKind = "word" | "phrase" | "idiom" | "pattern" | "collocation" | "sentence";

/** Where a captured phrase was highlighted — the Phrasebook's provenance. */
export interface CaptureSource {
  /** Module label, e.g. "News Chat". */
  module: string;
  /** The sentence/passage around the highlight (trimmed). */
  context?: string;
  day: DayKey;
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
  /** 2+ popular "similar ways" to say the same thing, for real-world flexibility. */
  alternatives?: PhraseAlternative[];
  /** What kind of unit this is (word/idiom/pattern/…) — practice adapts to it. */
  kind?: LexKind;
  /** Natural partner words — how words actually travel (e.g. "heavy rain"). */
  collocations?: string[];
  /** Present when the learner highlighted this themselves (Phrasebook capture). */
  captured?: CaptureSource;
}

/** Spaced-repetition state for one phrase (Leitner boxes). */
export interface SrsRecord {
  /** Leitner box; higher = longer interval before it's due again. */
  box: number;
  /** Day it's next due for review (YYYY-MM-DD). */
  due: DayKey;
  /** How many times it's been successfully produced. */
  reps: number;
  /** Last review day. */
  last: DayKey;
}

/** A message in a scene-partner chat. */
export interface ChatMessage {
  role: "coach" | "user";
  content: string;
}

// --- News Chat v2: today's real news → one planned "mission" ---
//
// The plan is fixed; only the delivery is live. A mission is generated once per
// day (per level) from real headlines and then frozen: one scenario, one goal,
// three language targets, four beats with fading support. See docs/NEWS_CHAT_V2.md.

/** Rolling CEFR-ish level missions are planned at and adapted to. */
export type NewsLevel = "A2" | "B1" | "B2" | "C1";

export type TargetKind = "pattern" | "phrase";

/** One reusable language item this mission teaches, elicits, and tracks. */
export interface MissionTarget {
  id: string;
  /** e.g. "It's worth ___" — gaps in patterns use ___. */
  text: string;
  kind: TargetKind;
  /** Plain-words gloss (tap-to-reveal in the HUD). */
  meaning: string;
  /** A natural example ABOUT this topic (also woven into the briefing). */
  example: string;
}

/** The communicative act of a beat — the fixed react → reason → flip → goal arc. */
export type MissionAct = "react" | "reason" | "flip" | "goal";

/** Inline support the scene partner weaves into its own question (the fading curve). */
export type BeatSupport = "frame" | "keywords" | "none";

/**
 * Pre-generated stall help for one beat. Rungs are ordered and each preserves a
 * generation gap: a hint may unlock ideas or language, never a finished sentence.
 */
export interface HintLadder {
  /** Rung 1 — a thinking nudge; contains NO reusable English sentence material. */
  idea: string;
  /** Rung 2 — 3-4 short chunks (1-3 words) to build with; rendered inert, not tappable. */
  keywords: string[];
  /** Rung 3 — one sentence frame, gaps as "___"; insertable WITH gaps, send blocked until filled. */
  frame: string;
  /** Rung 4 — a full model answer; timed reveal, then write-from-memory. Never insertable. */
  model: string;
}

export interface MissionBeat {
  id: string;
  act: MissionAct;
  /** What the learner must produce — written as an instruction to the scene partner. */
  elicit: string;
  /** The one target this beat elicits; null for the final "goal" beat. */
  targetId: string | null;
  support: BeatSupport;
  hints: HintLadder;
}

/** The whole lesson plan, fixed at session start. */
export interface Mission {
  /** `${day}-${level}` — also the server cache key. */
  id: string;
  day: DayKey;
  level: NewsLevel;
  title: string;
  /** Honest attribution to the real headline. */
  source: string;
  url?: string;
  /** Who the AI plays + why they need the learner's words. */
  scenario: { role: string; situation: string };
  /** The one visible communicative outcome, addressed to the learner. */
  goal: string;
  /** 3-5 sentences of input; target uses marked **like this**. */
  briefing: string;
  /** One-tap comprehension check — the guaranteed first win. */
  check?: { question: string; options: string[]; answer: number };
  targets: MissionTarget[]; // exactly 3
  beats: MissionBeat[]; // exactly 4
}

export type TargetStatus =
  | "pending" // not yet produced
  | "produced" // learner's own sentence, no frame/model open this beat
  | "assisted" // produced, but after seeing the frame or model rung
  | "missed"; // beat ended without it (force-advanced)

/** Deepest hint rung opened this beat; frame/model downgrade a production to "assisted". */
export type HintRung = "none" | "idea" | "keywords" | "frame" | "model";

/** Client-held session progress; the server merges it each turn (never the model). */
export interface MissionProgress {
  /** 0-based; === beats.length ⇒ mission complete. */
  beatIndex: number;
  /** Code force-advances a beat after 3 learner turns so nothing drags. */
  turnsInBeat: number;
  turn: number;
  level: NewsLevel;
  /** Kept as momentum, demoted from "the metric" — see the HUD. */
  wordsProduced: number;
  deepestHint: HintRung;
  targets: Record<string, TargetStatus>;
}

/** One scene-partner turn: in-character reply + honest judgment, merged state. */
export interface MissionTurn {
  /** Always ends with exactly one production demand (the Iron Rule). */
  reply: string;
  /** Target ids the learner produced this turn, in their own words. */
  targetsUsed: string[];
  beatDone: boolean;
  /** Was their last message English, about the scenario? */
  onTask: boolean;
  missionComplete: boolean;
  state: MissionProgress;
}

/** "Say it your way": building material for the learner's own intent — never a translation. */
export interface BridgeHelp {
  /** 3-4 short English chunks carrying their meaning. */
  keywords: string[];
  /** One sentence frame with 2+ ___ gaps. */
  frame: string;
}

/**
 * "Next words": help for a learner who stalled MID-sentence, grounded in the
 * draft they've already written. Options are alternative directions for the
 * very next words (1-3 words each, rendered inert — never tappable-to-insert);
 * the frame is one possible shape for the REST of the sentence, gaps as ___.
 * By contract this is never a completion: the learner always keeps writing.
 */
export interface ContinueHelp {
  /** 2-4 short alternative next-word chunks. Different directions, not a sequence. */
  options: string[];
  /** One continuation frame with ___ gaps for what's still theirs to write. */
  frame: string;
}

export interface TargetResult {
  id: string;
  verdict: "produced" | "assisted" | "missed";
  /** Tiny specific note; quotes the learner's own words when produced. */
  note: string;
}

/** Post-hoc, pattern-level correction — the only correction in the product. */
export interface Upgrade {
  /** The learner's actual sentence (short quote). */
  you: string;
  /** The natural version. */
  upgrade: string;
  /** ≤6 words. */
  why: string;
}

/** Closing debrief: where learning becomes explicit, then feeds the SRS. */
export interface Debrief {
  celebration: string;
  goalHit: boolean;
  targetResults: TargetResult[]; // one per target
  upgrades: Upgrade[]; // 0-2, never more
  /** 0-2 bonus phrases from the chat → the mined pool. */
  keep: { text: string; meaning: string }[];
}

// --- Phrasebook: highlight anywhere → collect → apply in real situations ---
//
// The capture-to-application loop (docs/PHRASEBOOK.md). Highlights are enriched
// into reusable Phrase entries; practice is always PRODUCTION — a real-life
// situation the learner answers in their own sentence — never a flashcard flip.

/** What enrichment makes of a raw highlight — a Phrase minus id/provenance. */
export interface CaptureEnrichment {
  /** The reusable unit (trimmed/normalized; patterns may carry ___ gaps). */
  text: string;
  /** Plain-words gloss at the learner's level. */
  meaning: string;
  /** One natural example in a DIFFERENT situation than the source (transfer). */
  example: string;
  register?: string;
  alternatives?: PhraseAlternative[];
  /** Classified unit kind — words, idioms, patterns… all live in the book. */
  kind?: LexKind;
  /** For words especially: 2-4 natural partner words/chunks. */
  collocations?: string[];
}

/**
 * How one drill round asks for production — the variety axis. Every method
 * ends the same way: the learner writes their own sentence.
 */
export type DrillMethod =
  | "situation" // an everyday moment to respond to
  | "reply" // a mini-dialogue ending on a line spoken TO the learner
  | "rephrase" // a flat plain sentence to say more naturally with the phrase
  | "personal" // point at the learner's own life where the phrase fits
  | "collocation"; // use a word together with a natural partner (words travel in company)

/**
 * How the learner chooses to practice — one mode per strand of a balanced
 * program (Nation's four strands; docs/PHRASEBOOK.md):
 *   mixed  — meaning-focused output: AI scenario rounds, methods interleaved
 *   recall — retrieval practice: item hidden, retrieve from meaning, then apply
 *   sprint — fluency development: timed rounds on familiar items only
 *   study  — language-focused learning: the full card, closed by writing
 *            your own example (never moves the schedule — study ≠ testing)
 */
export type PracticeMode = "mixed" | "recall" | "sprint" | "study";

/** One practice round's setup, built per phrase by the drill call. */
export interface DrillRoundSetup {
  /** The phrase id this round elicits. */
  id: string;
  method: DrillMethod;
  /** The scene material: the moment, the "Name: line" mini-chat, or the plain
   *  sentence to upgrade. Never contains the phrase (code-checked). */
  setup: string;
  /** One short instruction telling the learner what to write. */
  task: string;
  /** Up to 2 worked examples USING the phrase in clearly different contexts —
   *  input to learn from, rendered inert, never an answer to the setup. */
  examples: string[];
}

/** Honest judgment of one drill answer. */
export interface DrillJudgment {
  /** Did they apply the phrase (or a close variant) in their OWN sentence? */
  used: boolean;
  /** One short warm line; quotes their words when it worked. */
  note: string;
  /** At most one pattern-level fix (the debrief's Upgrade shape). */
  upgrade?: Upgrade;
}

/**
 * "Ask · anything": the free aide in the News Chat margin. The learner asks to
 * translate / explain / rephrase; the aide answers briefly and, when they asked
 * how to say something, hands back an insertable English phrase.
 */
export interface AskHelp {
  /** A short, level-appropriate answer (plain text). */
  answer: string;
  /** An English phrase the learner can drop straight into their reply, if any. */
  insert?: string;
}

// --- Daily words: a frequency-first curriculum, met → retrieved → used -------
//
// The one mode that DELIVERS language instead of waiting for the learner to
// meet it (docs/DAILY_WORDS.md): a small set of high-frequency words a day,
// each walked from first meeting to the learner's own sentence, then handed to
// the same Leitner pool the Phrasebook and News Chat share.

/** Part of speech — shown on the card, and what the round asks them to do with it. */
export type WordPos = "verb" | "noun" | "adjective" | "adverb";

/** One entry in the curated, frequency-ordered curriculum (lib/shared/words.ts). */
export interface WordSeed {
  /** Stable content id (`w-<word>`) — also this item's id in the phrase pool. */
  id: string;
  word: string;
  pos: WordPos;
  /** The band that meets this word; a day's set is drawn at the learner's level. */
  band: NewsLevel;
  /** Plain-words gloss, at the band's level. */
  meaning: string;
  /** One natural example — the first encounter's context. */
  example: string;
  /** 2-4 natural partner chunks: words are learned in company, not alone. */
  collocations: string[];
  /** Semantic field. A day's set never repeats one — semantically clustered
   *  sets interfere with each other (Tinkham; Finkbeiner & Nicol; Erten & Tekin). */
  field: string;
}

/** The beats a new word walks in a daily session. Review words skip `meet`. */
export type WordBeat = "meet" | "drill" | "use";

/**
 * The middle beat — what a word is asked to do between being met and being
 * used. The rung is chosen by the word's Leitner box, so the ask gets harder
 * as the memory gets stronger (expanding difficulty alongside the expanding
 * interval). Each rung tests something the others can't:
 *
 *   recall  — the form-meaning link itself: type the word from its meaning.
 *   fit     — the classic gap-fill: the right word AND the right form in a
 *             real sentence. Grammar knowledge production alone doesn't isolate.
 *   partner — the collocate is gapped, not the word ("___ a decision"). Which
 *             words travel together is the last thing to arrive and the most
 *             persistent marker of non-nativeness.
 *   repair  — a near-miss sentence to fix. Noticing the gap between almost and
 *             natural, on someone else's sentence so nobody's being corrected.
 *   echo    — a sentence THEY wrote days ago, gapped. Personally meaningful,
 *             which is the strongest encoding context there is.
 */
export type WordDrill = "recall" | "fit" | "partner" | "repair" | "echo";

/** One word's round pack for a session: the material every rung needs. */
export interface WordRound {
  /** The word id this round elicits. */
  id: string;
  /** A concrete everyday moment addressed to "you". Never contains the word. */
  setup: string;
  /** One short instruction — they always answer in their own sentence. */
  task: string;
  /** Up to 2 worked examples using the word elsewhere — inert input, never an answer. */
  examples: string[];
  /** A natural sentence USING the word; the gap is cut in code, so the answer
   *  is always exactly the form the sentence needs. Feeds the `fit` rung. */
  cloze?: string;
  /** A near-miss and its natural version — the `repair` rung. `wrong` is what
   *  the learner fixes; `right` is revealed after, never before. */
  repair?: { wrong: string; right: string };
}

/** How one word's turn ended — drives the debrief and the schedule. */
export type WordOutcome = "clean" | "helped" | "missed";

// --- Respond: bring a source, think against it, produce your own ------------
//
// The learner supplies the English (an article, a post, a newsletter) and the
// app supplies only *questions* (docs/RESPOND.md). The AI never contributes an
// idea, a summary, or an angle — if it did, the learner would leave with the
// model's thinking instead of their own. Source → think → three angles of their
// own → draft one → polish.

/** Where a source came from. Attribution is kept honestly, always shown. */
export interface SourceRef {
  title: string;
  /** Publication or site name, when we can tell. */
  site?: string;
  url?: string;
  /** Words in the extracted text — so the read feels bounded before it starts. */
  words: number;
}

/**
 * The rungs the thinking phase climbs — Bloom's revised taxonomy compressed to
 * four, ending at the level that produces something new:
 *   grasp  (understand) say it back in your own words
 *   assume (analyse)    name what it takes for granted
 *   push   (evaluate)   weigh it against what you've actually seen
 *   extend (create)     find what it left out — the doorway to a fresh angle
 */
export type ThinkRung = "grasp" | "assume" | "push" | "extend";

export interface ThinkQuestion {
  rung: ThinkRung;
  question: string;
}

/** A question and what the learner answered. Their answers are the raw
 *  material the angle screen hands back to them — never an AI suggestion. */
export interface ThinkTurn extends ThinkQuestion {
  answer: string;
  /** A sharper follow-up they asked for, and how they answered it. */
  followUp?: { question: string; answer: string };
}

/** One content idea, written entirely by the learner — the idea bank's unit. */
export interface ContentIdea {
  id: string;
  /** The hook: a headline or opening line, one sentence. */
  hook: string;
  /** The spine — up to three bullets. */
  bullets: string[];
  /**
   * Is this the learner's own angle, or a restatement of the source? Novice
   * source-based writers borrow heavily, and that's the one failure mode this
   * mode exists to catch, so every idea is checked.
   */
  own?: boolean;
  /** One short note on the angle — what makes it theirs, or what doesn't. */
  note?: string;
  /** The longest run of words lifted verbatim from the source, if notable. */
  borrowed?: string;
  /** Set once this idea has been drafted into a piece. */
  drafted?: boolean;
}

/** Post-hoc polish on a finished piece: what landed first, then at most two
 *  upgrades. The same stance as everywhere else — never a red pen. */
export interface Polish {
  celebration: string;
  /** Specific things that worked, quoting the learner's own words. */
  landed: string[];
  upgrades: Upgrade[];
  /** Phrases from their draft worth keeping — they join the Phrasebook pool. */
  keep: { text: string; meaning: string }[];
}

/** One pass through the mode, saved so the idea bank survives the session. */
export interface RespondSession {
  id: string;
  day: DayKey;
  createdAt: number;
  updatedAt: number;
  source: SourceRef;
  /** A bounded copy of the extracted text, so a session can be reopened. */
  text: string;
  turns: ThinkTurn[];
  ideas: ContentIdea[];
  /** Which idea they took to a draft, if any. */
  chosenId?: string;
  draft: string;
  polish?: Polish;
  status: "thinking" | "ideas" | "drafting" | "done";
}

// --- Transcribe: write what you hear, then say it back ----------------------
//
// The one mode where the English arrives as SOUND (docs/TRANSCRIBE.md). A clip
// is cut into fifteen-second chunks; each chunk is written down from listening
// alone, then said back over the speaker's own rhythm. Two gates, deliberately
// different in kind: dictation is scored (a word-match pass line), shadowing is
// only witnessed — scoring someone's mouth is exactly the anxiety this product
// exists to remove. Every tenth chunk closes a passage with a milestone check,
// because transcribing is not understanding.

/** One timed caption cue as it arrives from a transcript — the raw material. */
export interface TranscribeCue {
  /** Seconds from the start of the clip. */
  start: number;
  end: number;
  text: string;
}

/** A fifteen-second unit of listening — the thing a learner actually faces. */
export interface TranscribeChunk {
  /** 0-based position in the clip; also its id within a session. */
  index: number;
  start: number;
  end: number;
  /** What was actually said — the reference the dictation is scored against. */
  text: string;
  /** Words carrying the sentence stress, for the shadowing pane's underlines. */
  stress: string[];
}

/** A curated clip and its bundled transcript. Frequency-first listening, and —
 *  like the word curriculum — it needs no network and no AI to run. */
export interface TranscribeClip {
  id: string;
  title: string;
  /** Honest attribution: the series or programme it came from. */
  source: string;
  /** YouTube video id, when there's a real video behind it. */
  videoId?: string;
  /** Whole-clip length in seconds. */
  duration: number;
  /** The band this clip's listening sits at. */
  level: NewsLevel;
  /** One line on what makes this clip easy or hard to hear. */
  blurb: string;
  /** The transcript, already cued. Chunking is derived, never stored. */
  cues: TranscribeCue[];
}

/** How one word in the learner's attempt lined up against what was said.
 *  `ok` renders plain, `fix`/`miss`/`extra` are the tutor's ochre pencil. */
export type DiffKind = "ok" | "fix" | "miss" | "extra";

export interface DiffSegment {
  kind: DiffKind;
  /** What the learner wrote — struck through on `fix` and `extra`. */
  wrote?: string;
  /** What was actually said — the ochre correction on `fix` and `miss`. */
  heard?: string;
}

/**
 * The deterministic result of checking one dictation. Computed in code, never
 * by a model: a learner who wrote a word correctly must never be told they
 * didn't, and no model gets a vote on that.
 */
export interface DictationScore {
  /** Whole-percent word match against the chunk's reference text. */
  accuracy: number;
  /** Did it clear the pass line? The chunk gate's first half. */
  passed: boolean;
  /** The learner's own text, aligned and annotated for inline display. */
  segments: DiffSegment[];
  /** Reference words they missed or mis-wrote — tomorrow's review material. */
  missed: string[];
  /** Words in the reference, the denominator behind the percentage. */
  total: number;
}

/** A pattern behind several slips, named once. The only correction in the mode,
 *  and it arrives after the score, never during the writing. */
export interface SlipPattern {
  /** Mono kicker, e.g. "Subject–verb agreement · twice". */
  label: string;
  /** One clause explaining the rule, quoting their own words. */
  note: string;
}

/** How one chunk ended. `shadowed` is the gate's second half — witnessed, not
 *  scored, so it is a boolean and never a number. */
export interface ChunkResult {
  index: number;
  accuracy: number;
  /** How many times they played it. Kept so it can be watched falling. */
  listens: number;
  /** Scaffolds cost one miss each — the fade is visible, never punitive. */
  aided: boolean;
  shadowed: boolean;
  missed: string[];
}

/** The gate at the end of a passage: what stayed, and what can now be used. */
export interface MilestoneQuiz {
  /** Exactly two comprehension questions about the passage. */
  questions: string[];
  /** Exactly two phrases from the passage to reuse in one sentence of theirs. */
  phrases: string[];
}

/** Judgment of a milestone attempt. Deterministic phrase detection is the
 *  floor the model may tighten but never loosen. */
export interface MilestoneVerdict {
  passed: boolean;
  /** Which of the two phrases actually turned up in their own sentence. */
  used: string[];
  /** One short warm line; quotes their words when it worked. */
  note: string;
}

/**
 * One pass through a clip, saved so a twenty-minute video survives being closed.
 * Progress is chunk-granular because that is the unit a learner resumes at.
 */
export interface TranscribeSession {
  id: string;
  day: DayKey;
  createdAt: number;
  updatedAt: number;
  clipId: string;
  /** The clip itself, frozen — a pasted link has no curated entry to look up. */
  clip: TranscribeClip;
  /** Seconds per chunk this session was cut at. */
  chunkSeconds: number;
  /** How many chunks the clip cut into. */
  chunkCount: number;
  /** 0-based cursor: the chunk they're on now. */
  cursor: number;
  /** Per-chunk outcomes, keyed by chunk index. */
  results: Record<number, ChunkResult>;
  /** Passage indexes whose milestone has been passed. */
  milestonesPassed: number[];
  status: "active" | "complete";
}

/**
 * A saved News Chat conversation — persisted so the /news dashboard can show
 * recent chats, roll up stats, and resume an unfinished one. Holds enough of the
 * live session (mission + transcript + progress) to re-enter it exactly.
 */
export interface NewsSession {
  id: string;
  day: DayKey;
  createdAt: number;
  updatedAt: number;
  level: NewsLevel;
  /** The mission title — the conversation's headline. */
  title: string;
  /** Attribution to the real source. */
  source: string;
  url?: string;
  /** The mission goal, for the resume card. */
  goal: string;
  /** "active" until the debrief lands; "complete" after. */
  status: "active" | "complete";
  wordsProduced: number;
  /** Targets produced or assisted so far — the numerator of the phrase count. */
  targetsProduced: number;
  targetsTotal: number;
  /** Whether the learner accomplished the mission goal (set at debrief). */
  goalHit?: boolean;
  /** The full frozen mission — lets resume run turns with no re-plan. */
  mission: Mission;
  /** The transcript so far (partner + learner). */
  messages: ChatMessage[];
  /** Client-held progress — merged server-side each turn. */
  progress: MissionProgress;
}
