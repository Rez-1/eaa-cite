import { describe, expect, it } from "vitest";
import { criteria } from "../criteria/index.js";
import { mapToClauses, type AxeRuleResult, type AxeRun } from "./map.js";

const rule = (id: string, tags: string[], nodes = 1, impact: AxeRuleResult["impact"] = "serious"): AxeRuleResult => ({
  id,
  impact,
  tags,
  help: `help for ${id}`,
  helpUrl: `https://dequeuniversity.com/rules/axe/4.14/${id}`,
  nodes: Array.from({ length: nodes }, (_, i) => ({ target: [`#n${i}`] })),
});

const run = (parts: Partial<AxeRun>): AxeRun => ({
  url: "https://shop.test/",
  testEngine: { name: "axe-core", version: "4.14.0" },
  violations: [],
  incomplete: [],
  passes: [],
  ...parts,
});

describe("mapToClauses", () => {
  it("files each violation under the EN clause for the WCAG criterion it names", () => {
    const report = mapToClauses(run({ violations: [rule("color-contrast", ["wcag2aa", "wcag143"], 3)] }));
    expect(report.failing).toEqual([
      expect.objectContaining({
        enClause: "9.1.4.3",
        wcagRef: "1.4.3",
        name: "Contrast (Minimum)",
        rules: [expect.objectContaining({ ruleId: "color-contrast", instances: 3, firstTarget: "#n0" })],
      }),
    ]);
  });

  it("lists a rule under every criterion it names", () => {
    const report = mapToClauses(run({ violations: [rule("label", ["wcag2a", "wcag131", "wcag412"])] }));
    expect(report.failing.map((c) => c.enClause)).toEqual(["9.1.3.1", "9.4.1.2"]);
  });

  it("keeps failures outside clause 9 instead of dropping them", () => {
    const report = mapToClauses(
      run({
        violations: [
          rule("region", ["best-practice"], 2, "moderate"),
          rule("target-size", ["wcag22aa", "wcag258"]), // WCAG 2.2, not in v3.2.1
        ],
      }),
    );
    expect(report.failing).toEqual([]);
    expect(report.outsideClause9.map((r) => r.ruleId)).toEqual(["target-size", "region"]);
  });

  it("puts undecided rules under needsReview, never under failing", () => {
    const report = mapToClauses(run({ incomplete: [rule("color-contrast", ["wcag2aa", "wcag143"])] }));
    expect(report.failing).toEqual([]);
    expect(report.needsReview.map((c) => c.wcagRef)).toEqual(["1.4.3"]);
  });

  it("counts a criterion no rule touched as not checked, and one with a passing rule as checked", () => {
    const report = mapToClauses(run({ passes: [rule("image-alt", ["wcag2a", "wcag111"])] }));
    const unchecked = report.notCheckedByAxe.map((c) => c.wcagRef);
    expect(unchecked).not.toContain("1.1.1");
    expect(unchecked).toContain("1.2.2"); // captions: axe cannot judge them
    expect(report.summary.notCheckedByAxe).toBe(criteria.length - 1);
  });

  it("orders rules within a criterion by impact, then instance count", () => {
    const report = mapToClauses(
      run({
        violations: [
          rule("a", ["wcag412"], 5, "minor"),
          rule("b", ["wcag412"], 1, "critical"),
          rule("c", ["wcag412"], 9, "critical"),
        ],
      }),
    );
    expect(report.failing[0]?.rules.map((r) => r.ruleId)).toEqual(["c", "b", "a"]);
  });

  it("ignores rule results with no nodes", () => {
    expect(mapToClauses(run({ violations: [rule("image-alt", ["wcag111"], 0)] })).failing).toEqual([]);
  });
});
