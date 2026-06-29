import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-side AI gateway. Keys live in environment variables (never the
 * browser). Defaults to free-tier providers (Groq, Google Gemini) and falls
 * back to Anthropic if configured. Used by the feedback / scenario / word-help
 * route handlers.
 *
 * Configure with env vars (any one provider is enough):
 *   GROQ_API_KEY        (+ optional GROQ_MODEL)
 *   GEMINI_API_KEY      (+ optional GEMINI_MODEL)
 *   ANTHROPIC_API_KEY   (+ optional ANTHROPIC_MODEL)
 *   AI_PROVIDER         optional: force "groq" | "gemini" | "anthropic"
 */

type Provider = "groq" | "gemini" | "anthropic";

interface Resolved {
  provider: Provider;
  apiKey: string;
  model: string;
}

function resolveProvider(): Resolved | null {
  const candidates: { provider: Provider; key?: string; model: string }[] = [
    { provider: "groq", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" },
    { provider: "gemini", key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-2.0-flash" },
    { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5" },
  ];
  const forced = process.env.AI_PROVIDER as Provider | undefined;
  const ordered = forced
    ? [...candidates].sort((a, b) => (a.provider === forced ? -1 : b.provider === forced ? 1 : 0))
    : candidates;
  const found = ordered.find((c) => c.key && c.key.trim());
  return found ? { provider: found.provider, apiKey: found.key!.trim(), model: found.model } : null;
}

export function aiConfigured(): boolean {
  return resolveProvider() !== null;
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return `${res.status} ${body}`.slice(0, 300);
}

async function groqOrOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.8,
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

async function gemini(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: maxTokens },
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

async function anthropic(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** One raw "system + user -> text" completion via the configured provider. */
export async function rawComplete(system: string, user: string, maxTokens = 900): Promise<string> {
  const cfg = resolveProvider();
  if (!cfg) throw new Error("No AI provider configured on the server.");
  switch (cfg.provider) {
    case "groq":
      return groqOrOpenAI("https://api.groq.com/openai/v1", cfg.apiKey, cfg.model, system, user, maxTokens);
    case "gemini":
      return gemini(cfg.apiKey, cfg.model, system, user, maxTokens);
    case "anthropic":
      return anthropic(cfg.apiKey, cfg.model, system, user, maxTokens);
  }
}
