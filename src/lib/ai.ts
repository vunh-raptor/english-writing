import type { Entry, Feedback, Prompt, Theme, Difficulty } from "../types";

/**
 * Client-side AI helpers. These no longer talk to providers directly — the
 * browser holds no keys. They call our own server route handlers, which run the
 * AI gateway (free-tier providers) with keys kept in server env vars.
 *
 * Callers treat failures (incl. "AI not configured", 503) as a signal to fall
 * back to on-device feedback / the curated syllabus.
 */

async function postJson<TReq, TRes>(url: string, body: TReq): Promise<TRes> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = String(res.status);
    try {
      const j = await res.json();
      if (j?.error) msg = `${res.status} ${j.error}`;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<TRes>;
}

export async function aiFeedback(entry: Entry): Promise<Feedback> {
  return postJson<{ entry: Entry }, Feedback>("/api/feedback", { entry });
}

export interface GenerateOptions {
  theme: Theme;
  level: Difficulty;
  count: number;
  name?: string;
  avoid?: string[];
}

export async function aiGeneratePrompts(opts: GenerateOptions): Promise<Prompt[]> {
  const data = await postJson<GenerateOptions, { prompts: Prompt[] }>(
    "/api/prompts/generate",
    opts,
  );
  return data.prompts;
}

/** Contextual anti-stuck sparks from the learner's own text. Fails soft. */
export async function aiSparks(
  subject: string,
  text: string,
  level: Difficulty,
): Promise<{ question: string; starter: string }[]> {
  try {
    const data = await postJson<
      { subject: string; text: string; level: Difficulty },
      { sparks: { question: string; starter: string }[] }
    >("/api/sparks", { subject, text, level });
    return Array.isArray(data.sparks) ? data.sparks : [];
  } catch {
    return [];
  }
}
