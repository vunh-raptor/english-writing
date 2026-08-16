/**
 * Ids for the rows a client creates.
 *
 * Sessions are minted in the browser, because a learner starts writing before
 * the first save lands and the id has to be stable from that moment. What the
 * browser mints has to be something Postgres will accept, though — every
 * session table keys on `uuid` — and for a while it wasn't: the three modes
 * each had their own `Date.now().toString(36) + Math.random()…` helper, which
 * produces a perfectly unique string that a `uuid` column rejects outright.
 *
 * That went unnoticed because the migrations had never been applied. It is one
 * function now, so there is one place to be right.
 */

/** A v4 UUID, suitable for any of the session tables' primary keys. */
export function newId(): string {
  // Available in every browser the app supports and in Node 19+; the manual
  // path is for a non-secure context, where `crypto.randomUUID` is undefined.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}
