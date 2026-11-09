import { describe, expect, it } from "vitest";
import { extractObject, normalizeGaps, resolveItemId, str, strList } from "../modelJson";

describe("extractObject", () => {
  it("reads plain JSON", () => {
    expect(extractObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("survives the preamble and markdown fence models keep adding", () => {
    const raw = 'Sure! Here you go:\n```json\n{"a":1,"b":"two"}\n```\nHope that helps.';
    expect(extractObject(raw)).toEqual({ a: 1, b: "two" });
  });

  it("keeps nested objects whole by taking the outermost braces", () => {
    expect(extractObject('noise {"a":{"b":[1,2]}} more')).toEqual({ a: { b: [1, 2] } });
  });

  it("returns null rather than throwing on anything unparseable", () => {
    expect(extractObject("no json here")).toBeNull();
    expect(extractObject('{"a": }')).toBeNull();
    expect(extractObject("")).toBeNull();
    expect(extractObject("} {")).toBeNull();
  });
});

describe("str and strList — coercion, never trust", () => {
  it("trims a string and turns anything else into empty", () => {
    expect(str("  hi  ")).toBe("hi");
    expect(str(42)).toBe("");
    expect(str(null)).toBe("");
    expect(str(undefined)).toBe("");
    expect(str({ text: "hi" })).toBe("");
  });

  it("keeps only the non-empty strings, up to the cap", () => {
    expect(strList(["a", "", "  ", "b", 3, null, "c"], 2)).toEqual(["a", "b"]);
  });

  it("gives an empty list for something that was never an array", () => {
    expect(strList("a,b", 3)).toEqual([]);
    expect(strList(undefined, 3)).toEqual([]);
  });
});

describe("normalizeGaps", () => {
  it("collapses any run of underscores to the canonical three", () => {
    expect(normalizeGaps("I think ______ because __________.")).toBe(
      "I think ___ because ___.",
    );
  });

  it("leaves a single underscore alone — it isn't a gap", () => {
    expect(normalizeGaps("snake_case stays")).toBe("snake_case stays");
  });
});


const items = [
  { id: "w-appreciate", word: "appreciate" },
  { id: "w-look-up", word: "look up" },
  { id: "w-use", word: "use" },
];

describe("resolveItemId — forgive decorated ids, nothing looser", () => {
  it("matches the exact id", () => {
    expect(resolveItemId("w-appreciate", items)?.id).toBe("w-appreciate");
  });

  it("forgives a trailing ordinal, a dropped prefix, and underscores", () => {
    for (const raw of ["w-appreciate-1", "appreciate-1", "appreciate_1", "W_Appreciate", "appreciate"]) {
      expect(resolveItemId(raw, items)?.id).toBe("w-appreciate");
    }
    expect(resolveItemId("look up", items)?.id).toBe("w-look-up");
    expect(resolveItemId("look_up_2", items)?.id).toBe("w-look-up");
  });

  it("returns nothing for empty input or no items", () => {
    expect(resolveItemId("", items)).toBeUndefined();
    expect(resolveItemId("   ", items)).toBeUndefined();
    expect(resolveItemId("w-appreciate", [])).toBeUndefined();
  });

  it("never substring-matches: 'user' is not 'use', 'appreciated' is not 'appreciate'", () => {
    expect(resolveItemId("user", items)).toBeUndefined();
    expect(resolveItemId("w-user", items)).toBeUndefined();
    expect(resolveItemId("appreciated", items)).toBeUndefined();
  });
});
