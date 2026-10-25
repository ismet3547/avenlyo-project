import { describe, expect, it } from "vitest";
import { canonicalJson, hashToolArguments } from "./arguments";

describe("tool argument canonicalization", () => {
  it("produces the same hash regardless of object key order", () => {
    const left = {
      name: "Ayşe",
      meta: { b: 2, a: 1 },
      tags: ["crm", "lead"],
    };
    const right = {
      tags: ["crm", "lead"],
      meta: { a: 1, b: 2 },
      name: "Ayşe",
    };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(hashToolArguments(left)).toBe(hashToolArguments(right));
  });

  it("changes the hash when approved arguments change", () => {
    expect(hashToolArguments({ order_id: "ORD-1" })).not.toBe(
      hashToolArguments({ order_id: "ORD-2" }),
    );
  });
});
