import "server-only";
/**
 * Server-side trend ingestion. Runs only in route handlers / cron (never the
 * browser), so there is no CORS problem and source API keys stay in env.
 *
 * Adapters are pluggable: legitimate open sources today (Hacker News), plus a
 * `custom` slot where an operator-supplied feed — your own compliant social
 * crawler or a paid trends API for TikTok/IG/FB/Threads — plugs in. Keeping the
 * social-crawl behind one adapter isolates the ToS/compliance surface.
 */

export type TrendSource = "hn" | "custom";

export interface ServerTrend {
  id: string;
  title: string;
  source: TrendSource;
  platform: string;
  url?: string;
  blurb?: string;
  score?: number;
}

interface HnHit {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  points?: number;
}

/** Hacker News front page via the public Algolia API — real, current, no key. */
export async function fetchHackerNewsTrends(limit = 12): Promise<ServerTrend[]> {
  const res = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page", {
    // Cache at the edge for 30 min so we don't hammer the source.
    next: { revalidate: 1800 },
  });
  if (!res.ok) throw new Error(`Hacker News request failed: ${res.status}`);
  const data = (await res.json()) as { hits?: HnHit[] };
  return (data.hits ?? [])
    .map((h) => {
      const title = (h.title ?? h.story_title ?? "").trim();
      return {
        id: `hn-${h.objectID}`,
        title,
        source: "hn" as const,
        platform: "Hacker News",
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        score: h.points ?? 0,
      };
    })
    .filter((t) => t.title.length > 0)
    .slice(0, limit);
}

/**
 * Custom operator-supplied feed. Expects JSON: either an array of
 * `{ title, url?, platform?, blurb? }` or `{ trends: [...] }`. This is where a
 * compliant TikTok/IG/FB/Threads source is wired in.
 */
export async function fetchCustomTrends(endpoint: string): Promise<ServerTrend[]> {
  const res = await fetch(endpoint, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`Custom trends request failed: ${res.status}`);
  const data = await res.json();
  const rows: unknown[] = Array.isArray(data) ? data : (data?.trends ?? []);
  return rows
    .map((r, i) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const title = String(o.title ?? "").trim();
      return {
        id: `custom-${i}-${title.slice(0, 24)}`,
        title,
        source: "custom" as const,
        platform: o.platform ? String(o.platform) : "Custom",
        url: o.url ? String(o.url) : undefined,
        blurb: o.blurb ? String(o.blurb) : undefined,
      };
    })
    .filter((t) => t.title.length > 0);
}

/** Aggregate enabled sources, tolerating individual source failures. */
export async function fetchTrends(opts?: { customUrl?: string }): Promise<ServerTrend[]> {
  const tasks: Promise<ServerTrend[]>[] = [fetchHackerNewsTrends()];
  if (opts?.customUrl) tasks.push(fetchCustomTrends(opts.customUrl));

  const settled = await Promise.allSettled(tasks);
  const trends: ServerTrend[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") trends.push(...r.value);
  }
  return trends;
}
