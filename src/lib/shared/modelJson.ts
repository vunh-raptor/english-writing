/**
 * Reading a model's answer back.
 *
 * Every structured job in the app asks for JSON and then has to survive not
 * getting quite that: a preamble, a markdown fence, a trailing apology, a field
 * that arrived as a number. These four helpers were copy-pasted into five
 * server modules, which meant five places to fix when a provider developed a
 * new habit. They live here now — pure, isomorphic, and covered by tests.
 *
 * The stance is deliberate and stays the same everywhere: **parse fail-soft,
 * coerce per field, never trust a shape.** A malformed response degrades to a
 * missing field, which the caller's own guards then handle, rather than
 * throwing somewhere the learner can see.
 */

/**
 * The first plausible `{…}` object in a chatty response.
 *
 * Widest-span rather than balanced-brace matching: models wrap JSON in prose
 * far more often than they emit two objects, so the outermost pair is the right
 * guess. Returns null when there is nothing parseable.
 */
export function extractObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A trimmed string, or "" for anything that wasn't one. */
export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Up to `max` non-empty strings from something that should have been an array. */
export function strList(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : [];
}

/**
 * Gap widths arrive wild ("_____________"). The client's gap detection and
 * caret placement expect exactly "___", so every frame is normalized on the way
 * in rather than defended against everywhere it is rendered.
 */
export function normalizeGaps(text: string): string {
  return text.replace(/_{2,}/g, "___");
}

/** Lowercase, separators unified, so "W_Look Up" and "w-look-up" compare equal. */
function idKey(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/**
 * Which of `items` a model meant by the id it echoed back.
 *
 * Small models decorate ids rather than copying them — "appreciate-1",
 * "appreciate_1", "w-appreciate-1" for `w-appreciate` — and an exact-match
 * lookup then throws away a perfectly good round, sometimes all of them. This
 * forgives exactly those habits and nothing looser: exact id first, then the id
 * with a trailing ordinal stripped, then the bare word itself. No substring
 * matching, so "use" can never claim a round meant for "user".
 */
export function resolveItemId<T extends { id: string; word: string }>(
  raw: string,
  items: T[],
): T | undefined {
  const key = idKey(raw);
  if (!key) return undefined;
  const exact = items.find((w) => idKey(w.id) === key);
  if (exact) return exact;

  const bare = key.replace(/-\d+$/, "");
  return items.find(
    (w) =>
      idKey(w.id) === bare ||
      idKey(w.id).replace(/^w-/, "") === bare ||
      idKey(w.word) === bare,
  );
}
