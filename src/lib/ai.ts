import Anthropic from "@anthropic-ai/sdk";
import type { Entry, Feedback, AiSettings, AiProviderConfig } from "../types";

/**
 * Optional, opt-in AI feedback with a pluggable provider. The core app never
 * needs this — the freewriting loop and on-device feedback work fully offline.
 * When a learner adds their own key, they can choose whichever service suits
 * them: Anthropic (Claude), or a free-tier provider like Google Gemini, Groq,
 * or any OpenAI-compatible endpoint (OpenRouter, a local model, …).
 *
 * Keys are the learner's own and live only in their browser. Each call goes
 * directly from the browser to the chosen provider — this is a personal,
 * local-first tool with no backend.
 */

const SYSTEM = `You are a warm, encouraging English writing coach for someone learning English as a second language. They just finished a timed *freewriting* session — the goal was to keep writing without stopping, not to be perfect. Your job is to make producing English feel safe and rewarding so they come back tomorrow.

Rules:
- ALWAYS lead with genuine, specific encouragement. Notice what they actually did well.
- Treat this as fluency practice, not an exam. Do NOT nitpick. Never produce a long list of corrections.
- Offer at most TWO gentle suggestions, framed as friendly ideas to play with — never as "errors". Focus on the ones that most help them be understood.
- Be specific to THEIR text. Quote short phrases of theirs when you praise or suggest.
- Keep it short and human. No jargon, no grammar-lecture tone.
- Respond with ONLY a JSON object, no markdown, in exactly this shape:
{
  "encouragement": "one or two warm sentences",
  "strengths": ["2-4 specific things they did well"],
  "suggestions": [{"note": "a gentle idea", "example": "optional short fix or example"}],
  "oneThingToTry": "one small, doable thing to try next time"
}`;

function buildUserMessage(entry: Entry): string {
  return [
    `The prompt they responded to was: "${entry.promptText}"`,
    `They wrote ${entry.words} words in about ${Math.round(entry.durationMs / 1000)} seconds.`,
    "",
    "Here is exactly what they wrote:",
    "---",
    entry.text,
    "---",
    "",
    "Give your feedback as the JSON object described.",
  ].join("\n");
}

/** Pull the first balanced JSON object out of a model response. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in the response.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function coerceFeedback(raw: unknown): Feedback {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const strengths = Array.isArray(obj.strengths)
    ? obj.strengths.map(String).filter(Boolean)
    : [];
  const suggestions = Array.isArray(obj.suggestions)
    ? obj.suggestions
        .map((s) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return {
            note: String(o.note ?? "").trim(),
            example: o.example ? String(o.example) : undefined,
          };
        })
        .filter((s) => s.note)
    : [];
  return {
    source: "ai",
    encouragement: String(obj.encouragement ?? "You kept the pen moving — that's the win.").trim(),
    strengths: strengths.length ? strengths : ["You wrote freely and finished the session."],
    suggestions,
    oneThingToTry: String(obj.oneThingToTry ?? "Come back tomorrow and keep the streak alive.").trim(),
  };
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return `${res.status} ${body}`.slice(0, 300);
}

// ---- Anthropic (official SDK, browser-direct with the learner's own key) ----

async function callAnthropic(entry: Entry, cfg: AiProviderConfig): Promise<Feedback> {
  const client = new Anthropic({ apiKey: cfg.apiKey.trim(), dangerouslyAllowBrowser: true });
  const res = await client.messages.create({
    model: cfg.model || "claude-haiku-4-5",
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: "user", content: buildUserMessage(entry) }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return coerceFeedback(extractJson(text));
}

// ---- Google Gemini (free tier via AI Studio) ----

async function callGemini(entry: Entry, cfg: AiProviderConfig): Promise<Feedback> {
  const model = cfg.model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey.trim())}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: buildUserMessage(entry) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.7 },
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ??
    "";
  return coerceFeedback(extractJson(text));
}

// ---- OpenAI-compatible (Groq, OpenRouter, OpenAI, local servers) ----

const GROQ_BASE = "https://api.groq.com/openai/v1";

async function callOpenAICompatible(
  entry: Entry,
  cfg: AiProviderConfig,
  baseUrl: string,
): Promise<Feedback> {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildUserMessage(entry) },
      ],
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return coerceFeedback(extractJson(text));
}

/** Dispatch to whichever provider the learner selected. */
export async function aiFeedback(entry: Entry, ai: AiSettings): Promise<Feedback> {
  const cfg = ai.providers[ai.provider];
  if (!cfg || !cfg.apiKey.trim()) {
    throw new Error("No API key set.");
  }
  switch (ai.provider) {
    case "anthropic":
      return callAnthropic(entry, cfg);
    case "gemini":
      return callGemini(entry, cfg);
    case "groq":
      return callOpenAICompatible(entry, cfg, GROQ_BASE);
    case "openai":
      return callOpenAICompatible(entry, cfg, cfg.baseUrl || "https://api.openai.com/v1");
  }
}
