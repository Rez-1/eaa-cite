import { describe, expect, it } from "vitest";
import { compareRefs, criteria, findCriterion } from "./index.js";

describe("findCriterion", () => {
  it("finds the same row by WCAG number and by EN clause", () => {
    expect(findCriterion("1.4.3")).toBe(findCriterion("9.1.4.3"));
    expect(findCriterion("1.4.3")?.name).toBe("Contrast (Minimum)");
  });

  it("returns nothing for criteria EN 301 549 v3.2.1 does not require", () => {
    expect(findCriterion("1.4.6")).toBeUndefined(); // AAA
    expect(findCriterion("2.4.11")).toBeUndefined(); // added in WCAG 2.2
    expect(findCriterion("9.9.9.9")).toBeUndefined();
  });
});

describe("compareRefs", () => {
  it("orders numerically", () => {
    expect(["1.4.10", "1.4.3", "1.10.1", "1.4.2"].sort(compareRefs)).toEqual(["1.4.2", "1.4.3", "1.4.10", "1.10.1"]);
  });

  it("agrees with the order the table is published in", () => {
    const refs = criteria.map((c) => c.wcagRef);
    expect([...refs].sort(compareRefs)).toEqual(refs);
  });
});
