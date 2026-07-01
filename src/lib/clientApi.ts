import type { Trend, Scenario, Phrase, ChatMessage, CoachTurn } from "../types";

/** Client calls to our own API routes (server does the crawling + AI). */

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
  return res.json() as Promise<CoachTurn>;
}
