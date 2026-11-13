import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-side AI gateway. Keys live in environment variables (never the
 * browser). Defaults to free-tier providers (Groq, Google Gemini) and falls
 * back to Anthropic if configured. When the provider in front hits its quota
 * or is down, the request is retried once on each of the others in turn.
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

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Every provider with a key, in the order they should be tried. */
function resolveProviders(): Resolved[] {
  const candidates: { provider: Provider; key?: string; model: string }[] = [
    { provider: "groq", key: process.env.GROQ_API_KEY, model: process.env.GROQ_MODEL || "openai/gpt-oss-120b" },
    { provider: "gemini", key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite" },
    { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5" },
  ];
  const forced = process.env.AI_PROVIDER as Provider | undefined;
  const ordered = forced
    ? [...candidates].sort((a, b) => (a.provider === forced ? -1 : b.provider === forced ? 1 : 0))
    : candidates;
  return ordered
    .filter((c) => c.key && c.key.trim())
    .map((c) => ({ provider: c.provider, apiKey: c.key!.trim(), model: c.model }));
}

export function aiConfigured(): boolean {
  return resolveProviders().length > 0;
}

/**
 * Is this failure the provider's, rather than the request's?
 *
 * A quota wall (429), an outage (5xx), a dropped connection or a model the
 * provider has retired (404 — it has happened to two defaults already) says
 * nothing about the prompt, so the same request is worth one try elsewhere. A
 * 400 or a 401 would fail identically on a retry and is surfaced as it is.
 */
function isProviderTrouble(e: unknown): boolean {
  if (e instanceof TypeError) return true; // fetch failed: network, DNS, reset
  const status = (e as { status?: unknown })?.status;
  if (typeof status === "number") return status === 404 || status === 429 || status >= 500;
  const message = e instanceof Error ? e.message : "";
  return /^(404|429|5\d\d)\b/.test(message);
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return `${res.status} ${body}`.slice(0, 300);
}

async function openAIChat(
  baseUrl: string,
  cfg: Resolved,
  system: string,
  messages: ChatTurn[],
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature,
      max_tokens: maxTokens,
      // The gpt-oss models think before answering, and that thinking is paid
      // for out of max_tokens. These jobs are small and structured, so keep it
      // short or a tight cap is spent before the JSON starts.
      ...(cfg.model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function geminiChat(
  cfg: Resolved,
  system: string,
  messages: ChatTurn[],
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cfg.model,
  )}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { temperature, maxOutputTokens: maxTokens },
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

async function anthropicChat(
  cfg: Resolved,
  system: string,
  messages: ChatTurn[],
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const res = await client.messages.create({
    model: cfg.model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Multi-turn completion via the configured provider. */
export async function chatComplete(
  system: string,
  messages: ChatTurn[],
  maxTokens = 700,
  temperature = 0.8,
): Promise<string> {
  const providers = resolveProviders();
  if (providers.length === 0) throw new Error("No AI provider configured on the server.");

  // A word's conversation makes a model call per sentence, so one provider's
  // free-tier quota no longer covers a day on its own. When the provider in
  // front is the problem, the next configured one gets the same request.
  let lastError: unknown;
  for (const cfg of providers) {
    try {
      return await callProvider(cfg, system, messages, maxTokens, temperature);
    } catch (e) {
      lastError = e;
      if (!isProviderTrouble(e)) throw e;
      console.warn(`[ai] ${cfg.provider} unavailable, trying the next provider`);
    }
  }
  throw lastError;
}

function callProvider(
  cfg: Resolved,
  system: string,
  messages: ChatTurn[],
  maxTokens: number,
  temperature: number,
): Promise<string> {
  switch (cfg.provider) {
    case "groq":
      return openAIChat(
        "https://api.groq.com/openai/v1",
        cfg,
        system,
        messages,
        maxTokens,
        temperature,
      );
    case "gemini":
      return geminiChat(cfg, system, messages, maxTokens, temperature);
    case "anthropic":
      return anthropicChat(cfg, system, messages, maxTokens, temperature);
  }
}

/** Single-shot "system + one user message -> text". */
export async function rawComplete(
  system: string,
  user: string,
  maxTokens = 900,
  temperature = 0.8,
): Promise<string> {
  return chatComplete(system, [{ role: "user", content: user }], maxTokens, temperature);
}
