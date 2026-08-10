import type {
  ChatMessage,
  ContentIdea,
  Polish,
  SourceRef,
  ThinkQuestion,
  Mission,
  MissionProgress,
  MissionTurn,
  BridgeHelp,
  ContinueHelp,
  AskHelp,
  Debrief,
  NewsLevel,
  CaptureEnrichment,
  DrillRoundSetup,
  DrillJudgment,
  LexKind,
  WordRound,
  WordSeed,
  TranscribeClip,
  TranscribeCue,
  SlipPattern,
  MilestoneQuiz,
  MilestoneVerdict,
} from "@/types";

/** Client calls to our own API routes (server does the crawling + AI). */

/** Turn a server error response into an `Error` carrying its status + message. */
async function httpError(res: Response): Promise<Error> {
  let msg = String(res.status);
  try {
    const j = await res.json();
    if (j?.error) msg = `${res.status} ${j.error}`;
  } catch {
    /* ignore */
  }
  return new Error(msg);
}

/** Map the UI's chat roles (coach/user) to the API's (assistant/user). */
function toApiMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "coach" ? "assistant" : "user",
    content: m.content,
  }));
}

// --- Daily words: one call resolves the whole session ------------------------

export interface WordSession {
  /** The items this session runs, reviews and new words together. */
  words: WordSeed[];
  /** One round pack per word — the moment, the examples, the drill material. */
  rounds: WordRound[];
  /** The full set today issued, so the client can fix it against reshuffling. */
  todaysNew: WordSeed[];
}

/**
 * Today's session: which words, and the material for each.
 *
 * This used to send the client's own curriculum up and ask only for the
 * tailored halves. The curriculum is generated per learner and lives in
 * Postgres now, so the server decides the whole day — and there is no local
 * fallback behind a failure here, by design.
 */
export async function fetchWordSession(): Promise<WordSession> {
  const res = await fetch("/api/words/daily", { method: "POST" });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return {
    words: Array.isArray(data.words) ? (data.words as WordSeed[]) : [],
    rounds: Array.isArray(data.rounds) ? (data.rounds as WordRound[]) : [],
    todaysNew: Array.isArray(data.todaysNew) ? (data.todaysNew as WordSeed[]) : [],
  };
}

// --- Respond: bring a source, think against it, produce your own ------------

/** Paste text or hand over a link — the server extracts the readable article.
 *  No AI involved, so pasting works with no provider key at all. */
export async function loadSource(input: {
  text?: string;
  url?: string;
}): Promise<{ source: SourceRef; text: string }> {
  const res = await fetch("/api/respond/source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<{ source: SourceRef; text: string }>;
}

/** The four-rung thinking ladder, grounded in this source. All four rungs or
 *  none — a ladder missing a rung is a different, easier exercise. */
export async function thinkLadder(
  source: SourceRef,
  text: string,
): Promise<ThinkQuestion[]> {
  const res = await fetch("/api/respond/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, text }),
  });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return Array.isArray(data.questions) ? (data.questions as ThinkQuestion[]) : [];
}

/** "Push me": one harder question about the answer they just gave. */
export async function sharpenThinking(question: string, answer: string): Promise<string> {
  const res = await fetch("/api/respond/sharpen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, answer }),
  });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return typeof data.question === "string" ? data.question : "";
}

/** Are these angles theirs, or the source restated? */
export async function judgeContentIdeas(
  source: SourceRef,
  text: string,
  ideas: { id: string; hook: string; bullets: string[] }[],
): Promise<Pick<ContentIdea, "id" | "own" | "note" | "borrowed">[]> {
  const res = await fetch("/api/respond/ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, text, ideas }),
  });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return Array.isArray(data.verdicts) ? data.verdicts : [];
}

/** Encouragement-first feedback on the finished piece. */
export async function polishPiece(
  source: SourceRef,
  hook: string,
  draft: string,
): Promise<Polish> {
  const res = await fetch("/api/respond/polish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, hook, draft }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<Polish>;
}

// --- News Chat v2: today's planned mission, then the beat-by-beat delivery ---

/** Today's mission, planned once per account per day from real headlines and
 *  the learner's own record. The level comes from their profile, not the URL. */
export async function fetchMission(): Promise<Mission> {
  const res = await fetch("/api/news/mission");
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return data.mission as Mission;
}

/** One scene-partner turn; the server merges all progress state. */
export async function missionConverse(
  mission: Mission,
  progress: MissionProgress,
  messages: ChatMessage[],
): Promise<MissionTurn> {
  const res = await fetch("/api/converse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mission, progress, messages: toApiMessages(messages) }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<MissionTurn>;
}

/** "Say it your way": the learner's intent (any language) → keywords + a
 *  gapped frame — building material, never a translation. */
export async function missionBridge(
  currentDemand: string,
  intent: string,
): Promise<BridgeHelp> {
  const res = await fetch("/api/converse/bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentDemand, intent }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<BridgeHelp>;
}

/** "Next words": the learner stalled mid-sentence — their unfinished draft →
 *  2-4 alternative next-word chunks + one continuation frame with ___ gaps.
 *  Building material only; by contract never a completion of their sentence. */
export async function missionContinue(
  currentDemand: string,
  draft: string,
): Promise<ContinueHelp> {
  const res = await fetch("/api/converse/continue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentDemand, draft }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<ContinueHelp>;
}

/** "Ask · anything": a free translate / explain / rephrase aide, with an
 *  optional insertable English phrase. */
export async function missionAsk(context: string, question: string): Promise<AskHelp> {
  const res = await fetch("/api/converse/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context, question }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<AskHelp>;
}

// --- Phrasebook: capture anywhere → apply in real situations -----------------

/** Enrich a highlighted snippet into a phrasebook entry (reusable form,
 *  meaning, transfer example). Callers fail soft to saving the raw text. */
export async function enrichPhrase(
  text: string,
  context: string,
): Promise<CaptureEnrichment> {
  const res = await fetch("/api/phrasebook/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, context }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<CaptureEnrichment>;
}

/** One practice session's rounds — one call for all due phrases. Methods
 *  rotate (situation / reply / rephrase / personal); each round carries
 *  worked examples to learn from. */
export async function drillPhrases(
  items: { id: string; text: string; meaning: string; example?: string; kind?: LexKind }[],
): Promise<DrillRoundSetup[]> {
  const res = await fetch("/api/phrasebook/drill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return Array.isArray(data.rounds) ? (data.rounds as DrillRoundSetup[]) : [];
}

/** Honest judgment of one drill answer: applied, or not yet. */
export async function judgePhrase(
  phrase: { text: string; meaning: string },
  situation: string,
  sentence: string,
): Promise<DrillJudgment> {
  const res = await fetch("/api/phrasebook/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phrase, situation, sentence }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<DrillJudgment>;
}

// --- Transcribe: write what you hear, then say it back -----------------------

/** A pasted video link → its captions, as timed cues. No AI, so this works
 *  with no provider key; a video without captions fails honestly. */
export async function fetchClipCues(
  url: string,
): Promise<{ videoId: string; title: string; cues: TranscribeCue[] }> {
  const res = await fetch("/api/transcribe/chunks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<{ videoId: string; title: string; cues: TranscribeCue[] }>;
}

/** The pattern behind a chunk's slips. The score itself is computed on-device
 *  in `lib/shared/transcribe.ts` and passed in — this only explains it, so a
 *  failure costs the explanation and never the score. */
export async function explainDictation(
  reference: string,
  attempt: string,
  missed: string[],
): Promise<{ patterns: SlipPattern[]; keep: string[] }> {
  const res = await fetch("/api/transcribe/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference, attempt, missed }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<{ patterns: SlipPattern[]; keep: string[] }>;
}

/** The two questions and two phrases that close a passage, remembered per
 *  passage so re-opening a milestone never moves the goalposts. */
export async function fetchMilestone(passage: string): Promise<MilestoneQuiz> {
  const res = await fetch("/api/transcribe/milestone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passage }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<MilestoneQuiz>;
}

/** Judge a milestone attempt. Deterministic phrase detection is the floor the
 *  model may tighten but never loosen. */
export async function judgeMilestoneAttempt(
  quiz: MilestoneQuiz,
  answers: string[],
  sentence: string,
): Promise<MilestoneVerdict> {
  const res = await fetch("/api/transcribe/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quiz, answers, sentence }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<MilestoneVerdict>;
}

/** Closing debrief: per-target results, ≤2 upgrades, phrases to keep. */
export async function missionDebrief(
  mission: Mission,
  progress: MissionProgress,
  messages: ChatMessage[],
): Promise<Debrief> {
  const res = await fetch("/api/converse/debrief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mission, progress, messages: toApiMessages(messages) }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<Debrief>;
}

// --- The listening library: passages written for this learner ---------------

/** Their stored passages, topped up by one if the library is short. */
export async function fetchClips(): Promise<TranscribeClip[]> {
  const res = await fetch("/api/transcribe/clips");
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return Array.isArray(data.clips) ? (data.clips as TranscribeClip[]) : [];
}

/** "Write me another one" — always generates, never waits for the library to
 *  run down. Returns the whole library with the new passage first. */
export async function writeAnotherClip(): Promise<TranscribeClip[]> {
  const res = await fetch("/api/transcribe/clips", { method: "POST" });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return Array.isArray(data.clips) ? (data.clips as TranscribeClip[]) : [];
}
