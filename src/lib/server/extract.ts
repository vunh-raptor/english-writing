import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SourceRef } from "@/types";
import { countWords } from "@/lib/shared/stats";

/**
 * Fetch a page the learner pasted a link to and pull the readable text out of
 * it (docs/RESPOND.md).
 *
 * This is the one place in the app that fetches a URL chosen by the *user*
 * rather than by us, so it is the one place that needs real request-forgery
 * guards. The rules, all enforced below:
 *
 *   - http/https only — no file:, no data:, no gopher:.
 *   - The resolved IP must be public. A hostname that resolves to loopback,
 *     a private range, link-local (including the cloud metadata address), or
 *     a unique-local IPv6 address is refused.
 *   - Redirects are followed MANUALLY, revalidating every hop, because a
 *     public URL redirecting to 169.254.169.254 is the whole attack.
 *   - Hard caps on time and bytes, and only HTML is read.
 *
 * Extraction is deliberately simple — strip the furniture, keep the prose. A
 * page it can't read fails honestly so the learner can paste the text instead,
 * which is always the reliable path.
 */

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
/** Enough article for a session; the learner reads it, so it must stay finite. */
export const MAX_SOURCE_CHARS = 12_000;

const UA =
  "Mozilla/5.0 (compatible; FlowriteReader/1.0; +https://github.com/vunh-raptor/english-writing)";

/**
 * Expand any IPv6 spelling to its eight 16-bit groups. Needed because the
 * textual forms are not comparable: `new URL()` rewrites `::ffff:127.0.0.1`
 * as `::ffff:7f00:1`, so a check that pattern-matches the dotted form never
 * fires on the value we actually hold. Returns null for anything unparseable,
 * which callers treat as "refuse".
 */
function expandIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0]; // drop any zone id (fe80::1%eth0)
  // A trailing dotted quad is two groups written in decimal.
  const dotted = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const p = dotted[2].split(".").map(Number);
    if (p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = `${dotted[1]}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const parts = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (parts.length !== 8) return null;
  const groups = parts.map((p) => (p === "" ? 0 : parseInt(p, 16)));
  return groups.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff) ? null : groups;
}

/** Private, loopback, link-local and other non-routable space. */
function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
    const [a, b] = p;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (v === 6) {
    const h = expandIPv6(ip);
    if (!h) return true;
    if (h.every((x) => x === 0)) return true; // ::
    if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return true; // ::1
    if ((h[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((h[0] & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
    if ((h[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
    if (h[0] === 0x0064 && h[1] === 0xff9b) return true; // NAT64 64:ff9b::/96
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) both carry a
    // v4 address in the low 32 bits — judge them by that address.
    if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
      const v4 = [h[6] >> 8, h[6] & 0xff, h[7] >> 8, h[7] & 0xff].join(".");
      return isPrivateAddress(v4);
    }
    return false;
  }
  return true;
}

/** Throw unless this URL is http(s) and resolves to a public address. */
async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https links can be read.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("That address isn't reachable from here.");
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error("That site couldn't be found.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error("That address isn't reachable from here.");
  }
}

/** Fetch with manual redirects, revalidating each hop. */
async function safeFetch(input: string): Promise<{ html: string; finalUrl: URL }> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("That doesn't look like a link.");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      });
    } catch {
      throw new Error("That page couldn't be reached.");
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("That page couldn't be reached.");
      url = new URL(location, url); // relative redirects are legal
      continue;
    }
    if (!res.ok) throw new Error(`That page returned ${res.status}.`);

    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text/plain")) {
      throw new Error("That link isn't a readable page — paste the text instead.");
    }
    const size = Number(res.headers.get("content-length") ?? 0);
    if (size > MAX_BYTES) throw new Error("That page is too big to read.");

    const html = (await res.text()).slice(0, MAX_BYTES);
    return { html, finalUrl: url };
  }
  throw new Error("That link redirects too many times.");
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", "#39": "'", "#8217": "’", "#8216": "‘",
  "#8220": "“", "#8221": "”", "#8212": "—", "#8230": "…",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
    const key = code.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    if (key.startsWith("#x")) {
      const n = parseInt(key.slice(2), 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    if (key.startsWith("#")) {
      const n = Number(key.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}

function metaContent(html: string, pattern: RegExp): string {
  const m = html.match(pattern);
  return m ? decodeEntities(m[1]).trim() : "";
}

/**
 * Strip a page down to its prose. Not a full readability port — it drops the
 * furniture, keeps block structure as blank lines, and trusts that a learner
 * can paste the text when a page defeats it.
 */
export function htmlToText(html: string): string {
  let s = html;
  // Furniture first, with their contents.
  s = s.replace(
    /<(script|style|noscript|svg|iframe|form|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,
    " ",
  );
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // Block boundaries become paragraph breaks so the text stays readable.
  s = s.replace(/<\/(p|div|section|article|h[1-6]|li|blockquote|tr)>/gi, "\n\n");
  s = s.replace(/<br\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Title, in preference order: og:title, <title>, first <h1>. */
function extractTitle(html: string): string {
  return (
    metaContent(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    metaContent(html, /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
    metaContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ||
    htmlToText(html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? "").slice(0, 160) ||
    ""
  );
}

export interface ExtractedSource {
  source: SourceRef;
  text: string;
}

/** A page with less prose than this isn't an article we can think against. */
const MIN_ARTICLE_WORDS = 60;

/** Fetch a link and return the readable article behind it. */
export async function fetchArticle(rawUrl: string): Promise<ExtractedSource> {
  const { html, finalUrl } = await safeFetch(rawUrl);

  // Prefer the <article>/<main> body when the page marks one.
  const body =
    html.match(/<article\b[^>]*>[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)?.[0] ??
    html;

  const text = htmlToText(body).slice(0, MAX_SOURCE_CHARS);
  if (countWords(text) < MIN_ARTICLE_WORDS) {
    throw new Error("There wasn't much readable text there — paste the text instead.");
  }

  const site =
    metaContent(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
    finalUrl.hostname.replace(/^www\./, "");

  return {
    source: {
      title: extractTitle(html).slice(0, 160) || finalUrl.hostname,
      site: site.slice(0, 60),
      url: finalUrl.toString(),
      words: countWords(text),
    },
    text,
  };
}

/** The paste path: normalize, bound, and take the first line as a title. */
export function fromPastedText(raw: string): ExtractedSource {
  const text = raw.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_SOURCE_CHARS);
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const title =
    firstLine.length > 0 && firstLine.length <= 120
      ? firstLine
      : firstLine.slice(0, 100).replace(/\s+\S*$/, "") || "Your source";
  return { source: { title, words: countWords(text) }, text };
}
