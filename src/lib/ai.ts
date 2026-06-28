import Anthropic from "@anthropic-ai/sdk";
import type {
  Entry,
  Feedback,
  AiSettings,
  AiProviderConfig,
  Prompt,
  Theme,
  Difficulty,
} from "../types";

/**
 * Optional, opt-in AI with a pluggable provider. Two uses:
 *  1. warmer, personal *feedback* after a session, and
 *  2. fresh, real-life *prompt generation* for the syllabus.
 *
 * The core app needs neither — offline feedback and the curated syllabus work
 * fully without a key. When a learner adds their own key they can pick any
 * provider: Anthropic (Claude), Google Gemini, Groq, or any OpenAI-compatible
 * endpoint (OpenRouter, a local model, …). Keys live only in the browser and
 * each call goes directly from the browser to the chosen provider.
 */

// ---------------------------------------------------------------------------
// Provider layer: one raw "system + user -> text" call, dispatched by provider.
// ---------------------------------------------------------------------------

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return `${res.status} ${body}`.slice(0, 300);
}

async function anthropicComplete(
  cfg: AiProviderConfig,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.apiKey.trim(), dangerouslyAllowBrowser: true });
  const res = await client.messages.create({
    model: cfg.model || "claude-haiku-4-5",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

async function geminiComplete(
  cfg: AiProviderConfig,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const model = cfg.model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey.trim())}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.9,
        maxOutputTokens: maxTokens,
      },
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("") ?? ""
  );
}

const GROQ_BASE = "https://api.groq.com/openai/v1";

async function openAICompatibleComplete(
  cfg: AiProviderConfig,
  baseUrl: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.9,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function rawComplete(
  ai: AiSettings,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const cfg = ai.providers[ai.provider];
  if (!cfg || !cfg.apiKey.trim()) throw new Error("No API key set.");
  switch (ai.provider) {
    case "anthropic":
      return anthropicComplete(cfg, system, user, maxTokens);
    case "gemini":
      return geminiComplete(cfg, system, user, maxTokens);
    case "groq":
      return openAICompatibleComplete(cfg, GROQ_BASE, system, user, maxTokens);
    case "openai":
      return openAICompatibleComplete(
        cfg,
        cfg.baseUrl || "https://api.openai.com/v1",
        system,
        user,
        maxTokens,
      );
  }
}

function extractJson(text: string, open: "{" | "[", close: "}" | "]"): unknown {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON found in the response.");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

const FEEDBACK_SYSTEM = `You are a warm, encouraging English writing coach for someone learning English as a second language. They just finished a timed *freewriting* session — the goal was to keep writing without stopping, not to be perfect. Your job is to make producing English feel safe and rewarding so they come back tomorrow.

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

function buildFeedbackUser(entry: Entry): string {
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

export async function aiFeedback(entry: Entry, ai: AiSettings): Promise<Feedback> {
  const text = await rawComplete(ai, FEEDBACK_SYSTEM, buildFeedbackUser(entry), 1200);
  return coerceFeedback(extractJson(text, "{", "}"));
}

// ---------------------------------------------------------------------------
// Prompt generation (the "syllabus, generated" part)
// ---------------------------------------------------------------------------

const GEN_SYSTEM =
  "You generate short freewriting prompts for people learning English as a second language. The prompts are for daily practice grounded in REAL-LIFE situations they actually need English for — not textbook drills. You always respond with only a JSON array, no markdown.";

const LEVEL_GUIDE: Record<Difficulty, string> = {
  1: "Beginner-friendly: concrete, everyday, simple vocabulary, easy to start.",
  2: "Intermediate: opinions, small stories, and light reflection.",
  3: "Advanced: more abstract or argumentative, with deeper reflection.",
};

export interface GenerateOptions {
  theme: Theme;
  level: Difficulty;
  count: number;
  name?: string;
  /** Recent prompt texts to avoid repeating. */
  avoid?: string[];
}

function makeId(): string {
  return "ai-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function aiGeneratePrompts(
  ai: AiSettings,
  opts: GenerateOptions,
): Promise<Prompt[]> {
  const { theme, level, count } = opts;
  const user = [
    `Generate ${count} freewriting prompts for an English learner.`,
    `Theme: ${theme.label} — ${theme.blurb}.`,
    `Level: ${LEVEL_GUIDE[level]}`,
    opts.name ? `The learner's name is ${opts.name}.` : "",
    "Each prompt must be about the learner's own real life, opinions, or experience, tied to a concrete real-life situation in this theme. One or two sentences. Include a short, natural sentence-starter they can continue.",
    opts.avoid && opts.avoid.length
      ? `Do not repeat or closely paraphrase these existing prompts: ${opts.avoid.map((t) => `"${t}"`).join("; ")}.`
      : "",
    `Respond with ONLY a JSON array of exactly ${count} objects, each: {"text": "...", "starter": "..."}. No markdown, no commentary.`,
  ]
    .filter(Boolean)
    .join("\n");

  const text = await rawComplete(ai, GEN_SYSTEM, user, 900);
  const raw = extractJson(text, "[", "]");
  if (!Array.isArray(raw)) throw new Error("Expected a JSON array of prompts.");

  const prompts: Prompt[] = [];
  for (const item of raw) {
    const o = (item ?? {}) as Record<string, unknown>;
    const ptext = String(o.text ?? "").trim();
    if (!ptext) continue;
    const starter = o.starter ? String(o.starter).trim() : undefined;
    prompts.push({
      id: makeId(),
      themeId: theme.id,
      level,
      text: ptext,
      starter: starter || undefined,
      source: "ai",
    });
  }
  if (prompts.length === 0) throw new Error("No usable prompts were returned.");
  return prompts;
}
