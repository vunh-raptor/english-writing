import "server-only";

/**
 * Server-side news ingestion for News Chat. Runs only in route handlers / cron
 * (never the browser), so there's no CORS problem and any source keys stay in
 * env. Every source is free and needs no key.
 *
 * Adapters sit behind one interface (`fetchNewsHeadlines`) and tolerate
 * individual failures — if one source is down, the others still return. We never
 * fabricate a headline: if everything fails, the caller gets an empty list and
 * says so honestly (this mode is inherently online).
 */

export interface NewsHeadline {
  title: string;
  /** Display label for attribution, e.g. "Google News" or "reddit r/worldnews". */
  source: string;
  url?: string;
}

/** A browser-like UA — some sources (Reddit, Google) reject empty/agentless UAs. */
const UA =
  "Mozilla/5.0 (compatible; FlowriteNewsChat/1.0; +https://github.com/flowrite)";

/** Cache each source at the edge so we don't hammer them (a cron warms this too). */
const REVALIDATE = 1800; // 30 min

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

/**
 * Google News top-stories RSS. No key, genuinely current. Titles arrive as
 * "Headline - Source"; we split off the trailing source for a clean subject.
 */
export async function fetchGoogleNews(limit = 15): Promise<NewsHeadline[]> {
  const res = await fetch(
    "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
    { headers: { "User-Agent": UA }, next: { revalidate: REVALIDATE } },
  );
  if (!res.ok) throw new Error(`Google News request failed: ${res.status}`);
  const xml = await res.text();

  const items: NewsHeadline[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[1];
    const rawTitle = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const link = decodeEntities(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
    const feedSource = decodeEntities(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? "");
    if (!rawTitle) continue;
    // Google appends " - Publisher"; keep the headline, use the publisher as source.
    const dash = rawTitle.lastIndexOf(" - ");
    const title = dash > 20 ? rawTitle.slice(0, dash).trim() : rawTitle;
    const publisher = feedSource || (dash > 20 ? rawTitle.slice(dash + 3).trim() : "");
    items.push({
      title,
      source: publisher ? `${publisher} (Google News)` : "Google News",
      url: link || undefined,
    });
  }
  return items;
}

interface GdeltArticle {
  title?: string;
  url?: string;
  domain?: string;
}

/** GDELT free news API — global coverage, JSON, no key. */
export async function fetchGdelt(limit = 15): Promise<NewsHeadline[]> {
  const url =
    "https://api.gdeltproject.org/api/v2/doc/doc?query=sourcelang:english&mode=artlist&maxrecords=" +
    limit +
    "&sort=datedesc&format=json&timespan=1d";
  const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: REVALIDATE } });
  if (!res.ok) throw new Error(`GDELT request failed: ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { articles?: GdeltArticle[] };
  return (data.articles ?? [])
    .map((a) => ({
      title: (a.title ?? "").trim(),
      source: a.domain ? `${a.domain} (GDELT)` : "GDELT",
      url: a.url,
    }))
    .filter((h) => h.title.length > 0)
    .slice(0, limit);
}

interface RedditChild {
  data?: { title?: string; permalink?: string; url?: string; stickied?: boolean };
}

/** Reddit top posts from a news-ish subreddit — free JSON, needs a real UA. */
export async function fetchReddit(
  subreddit = "worldnews",
  limit = 12,
): Promise<NewsHeadline[]> {
  const res = await fetch(
    `https://www.reddit.com/r/${subreddit}/top.json?t=day&limit=${limit}`,
    { headers: { "User-Agent": UA }, next: { revalidate: REVALIDATE } },
  );
  if (!res.ok) throw new Error(`Reddit request failed: ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as {
    data?: { children?: RedditChild[] };
  };
  return (data.data?.children ?? [])
    .map((c) => c.data ?? {})
    .filter((d) => !d.stickied && (d.title ?? "").trim().length > 0)
    .map((d) => ({
      title: (d.title ?? "").trim(),
      source: `reddit r/${subreddit}`,
      url: d.permalink ? `https://www.reddit.com${d.permalink}` : d.url,
    }))
    .slice(0, limit);
}

/** Collapse near-duplicate headlines (same lowercased, punctuation-stripped title). */
function dedupe(headlines: NewsHeadline[]): NewsHeadline[] {
  const seen = new Set<string>();
  const out: NewsHeadline[] = [];
  for (const h of headlines) {
    const key = h.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

/**
 * Aggregate every source, tolerating individual failures. Interleaves sources so
 * one loud feed doesn't dominate the curation input. Returns [] if all fail —
 * the caller reports that honestly rather than faking a subject.
 */
export async function fetchNewsHeadlines(): Promise<NewsHeadline[]> {
  const settled = await Promise.allSettled([
    fetchGoogleNews(),
    fetchGdelt(),
    fetchReddit(),
  ]);
  const buckets = settled
    .filter((r): r is PromiseFulfilledResult<NewsHeadline[]> => r.status === "fulfilled")
    .map((r) => r.value);

  // Round-robin interleave so curation sees a mix, not one source first.
  const merged: NewsHeadline[] = [];
  const max = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < max; i++) {
    for (const b of buckets) if (b[i]) merged.push(b[i]);
  }
  return dedupe(merged).slice(0, 20);
}
