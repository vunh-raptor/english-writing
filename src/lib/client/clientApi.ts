import type {
  Trend,
  Scenario,
  Phrase,
  ChatMessage,
  CoachTurn,
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

export async function fetchTrends(): Promise<Trend[]> {
  const res = await fetch("/api/trends");
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.trends) ? (data.trends as Trend[]) : [];
}

export async function createScenario(subject: string, platform?: string): Promise<Scenario> {
  const res = await fetch("/api/scenarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, platform }),
  });
  if (!res.ok) {
    let msg = String(res.status);
    try {
      const j = await res.json();
      if (j?.error) msg = `${res.status} ${j.error}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return data.scenario as Scenario;
}

export async function coachTurn(phrases: Phrase[], messages: ChatMessage[]): Promise<CoachTurn> {
  const apiMessages = messages.map((m) => ({
    role: m.role === "coach" ? "assistant" : "user",
    content: m.content,
  }));
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phrases, messages: apiMessages }),
  });
  if (!res.ok) throw await httpError(res);
  return res.json() as Promise<CoachTurn>;
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
  items: { id: string; text: string; meaning: string; example?: string }[],
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
