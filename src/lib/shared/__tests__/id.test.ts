import { describe, expect, it } from "vitest";
import { newId } from "../id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  it("returns something a Postgres uuid column will accept", () => {
    // The bug this replaced: three hand-rolled `Date.now().toString(36) + …`
    // helpers, each producing a unique string that a `uuid` column rejects.
    expect(newId()).toMatch(UUID_V4);
  });

  it("does not repeat itself", () => {
    const ids = new Set(Array.from({ length: 500 }, newId));
    expect(ids.size).toBe(500);
  });
});
