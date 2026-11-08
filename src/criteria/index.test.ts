import { describe, expect, it } from "vitest";
import { readData } from "../dataPath.js";
import { compareRefs, criteria, findCriterion, parseCriteriaFile } from "./index.js";

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

describe("the checked-in EN 301 549 v3.2.1 criteria", () => {
  const file = parseCriteriaFile(readData("en-301-549-v3.2.1-clause9.json"));

  it("is the WCAG 2.1 A and AA set: 30 at A, 20 at AA", () => {
    expect(file.criteria).toHaveLength(50);
    expect(file.criteria.filter((c) => c.level === "A")).toHaveLength(30);
    expect(file.criteria.filter((c) => c.level === "AA")).toHaveLength(20);
  });

  it("numbers every clause as 9 followed by its WCAG criterion, once each", () => {
    for (const c of file.criteria) expect(c.enClause).toBe(`9.${c.wcagRef}`);
    expect(new Set(file.criteria.map((c) => c.enClause)).size).toBe(file.criteria.length);
  });

  it("was extracted from the ETSI V3.2.1 PDF and the WCAG 2.1 Recommendation", () => {
    expect(file.enVersion).toBe("EN 301 549 v3.2.1");
    expect(file.wcagVersion).toBe("WCAG 2.1 AA");
    expect(file.sources.en.url).toMatch(/\/03\.02\.01_60\/en_301549v030201p\.pdf$/);
    expect(file.sources.en.bytes).toBe(2285361);
    for (const c of file.criteria) expect(c.wcagUrl.startsWith("https://www.w3.org/TR/WCAG21/#")).toBe(true);
  });
});
