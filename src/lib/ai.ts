import Anthropic from "@anthropic-ai/sdk";
import type { Entry, Feedback, AiSettings } from "../types";

/**
 * Optional, opt-in Claude-powered feedback. The core app never needs this — the
 * freewriting loop and local feedback work fully offline. When the learner adds
 * their own API key, this gives warmer, more specific encouragement.
 *
 * The key is the learner's own and lives only in their browser. We call the API
 * directly from the client (`dangerouslyAllowBrowser`) because this is a
 * personal, local-first tool with no backend — the learner is using their own
 * credentials, not a shared server key.
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
    ? obj.suggestions.map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return {
          note: String(o.note ?? "").trim(),
          example: o.example ? String(o.example) : undefined,
        };
      }).filter((s) => s.note)
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
  if (!ai.apiKey.trim()) {
    throw new Error("No API key set.");
  }
  const client = new Anthropic({
    apiKey: ai.apiKey.trim(),
    dangerouslyAllowBrowser: true,
  });

  const res = await client.messages.create({
    model: ai.model || "claude-opus-4-8",
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
