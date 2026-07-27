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

// --- Daily words: one call builds every "use it" round for today's set -------

/** The real-life moments today's words are needed in. Callers fall back to the
 *  local packs in `lib/shared/words.ts`, so a session never blocks on this. */
export async function fetchWordRounds(
  level: NewsLevel,
  words: Pick<WordSeed, "id" | "word" | "pos" | "meaning" | "collocations">[],
): Promise<WordRound[]> {
  const res = await fetch("/api/words/daily", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, words }),
  });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return Array.isArray(data.rounds) ? (data.rounds as WordRound[]) : [];
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

/** The four-rung thinking ladder, grounded in this source. Callers fall back
 *  to `localQuestions()` so the ladder always runs. */
export async function thinkLadder(
  level: NewsLevel,
  source: SourceRef,
  text: string,
): Promise<ThinkQuestion[]> {
  const res = await fetch("/api/respond/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, source, text }),
  });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return Array.isArray(data.questions) ? (data.questions as ThinkQuestion[]) : [];
}

/** "Push me": one harder question about the answer they just gave. */
export async function sharpenThinking(
  level: NewsLevel,
  question: string,
  answer: string,
): Promise<string> {
  const res = await fetch("/api/respond/sharpen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, question, answer }),
  });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return typeof data.question === "string" ? data.question : "";
}

/** Are these angles theirs, or the source restated? */
export async function judgeContentIdeas(
  level: NewsLevel,
  source: SourceRef,
  text: string,
  ideas: { id: string; hook: string; bullets: string[] }[],
): Promise<Pick<ContentIdea, "id" | "own" | "note" | "borrowed">[]> {
  const res = await fetch("/api/respond/ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, source, text, ideas }),
  });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return Array.isArray(data.verdicts) ? data.verdicts : [];
}

/** Encouragement-first feedback on the finished piece. */
export async function polishPiece(
  level: NewsLevel,
  source: SourceRef,
  hook: string,
  draft: string,
): Promise<Polish> {
  const res = await fetch("/api/respond/polish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, source, hook, draft }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<Polish>;
}

// --- News Chat v2: today's planned mission, then the beat-by-beat delivery ---

/** Today's mission, planned once per (day, level) from real headlines. */
export async function fetchMission(level: NewsLevel): Promise<Mission> {
  const res = await fetch(`/api/news/mission?level=${encodeURIComponent(level)}`);
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
  level: NewsLevel,
  currentDemand: string,
  intent: string,
): Promise<BridgeHelp> {
  const res = await fetch("/api/converse/bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, currentDemand, intent }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<BridgeHelp>;
}

/** "Next words": the learner stalled mid-sentence — their unfinished draft →
 *  2-4 alternative next-word chunks + one continuation frame with ___ gaps.
 *  Building material only; by contract never a completion of their sentence. */
export async function missionContinue(
  level: NewsLevel,
  currentDemand: string,
  draft: string,
): Promise<ContinueHelp> {
  const res = await fetch("/api/converse/continue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, currentDemand, draft }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<ContinueHelp>;
}

/** "Ask · anything": a free translate / explain / rephrase aide, with an
 *  optional insertable English phrase. */
export async function missionAsk(
  level: NewsLevel,
  context: string,
  question: string,
): Promise<AskHelp> {
  const res = await fetch("/api/converse/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, context, question }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<AskHelp>;
}

// --- Phrasebook: capture anywhere → apply in real situations -----------------

/** Enrich a highlighted snippet into a phrasebook entry (reusable form,
 *  meaning, transfer example). Callers fail soft to saving the raw text. */
export async function enrichPhrase(
  level: NewsLevel,
  text: string,
  context: string,
): Promise<CaptureEnrichment> {
  const res = await fetch("/api/phrasebook/enrich", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, text, context }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<CaptureEnrichment>;
}

/** One practice session's rounds — one call for all due phrases. Methods
 *  rotate (situation / reply / rephrase / personal); each round carries
 *  worked examples to learn from. */
export async function drillPhrases(
  level: NewsLevel,
  items: { id: string; text: string; meaning: string; example?: string; kind?: LexKind }[],
): Promise<DrillRoundSetup[]> {
  const res = await fetch("/api/phrasebook/drill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, items }),
  });
  if (!res.ok) throw await httpError(res);
  const data = await res.json();
  return Array.isArray(data.rounds) ? (data.rounds as DrillRoundSetup[]) : [];
}

/** Honest judgment of one drill answer: applied, or not yet. */
export async function judgePhrase(
  level: NewsLevel,
  phrase: { text: string; meaning: string },
  situation: string,
  sentence: string,
): Promise<DrillJudgment> {
  const res = await fetch("/api/phrasebook/judge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, phrase, situation, sentence }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<DrillJudgment>;
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
