import { readData } from "../dataPath.js";
import { parseCriteriaFile, type Criterion } from "./source.js";

export type { Criterion } from "./source.js";

/** The EN 301 549 v3.2.1 clause 9 table, validated once on first import. */
export const criteriaFile = parseCriteriaFile(readData("en-301-549-v3.2.1-clause9.json"));
export const criteria: readonly Criterion[] = criteriaFile.criteria;

const byWcag = new Map(criteria.map((c) => [c.wcagRef, c]));
const byClause = new Map(criteria.map((c) => [c.enClause, c]));

/**
 * A criterion by WCAG number ("1.4.3") or EN clause ("9.1.4.3"). Undefined for
 * anything outside the WCAG 2.1 A and AA set, including AAA criteria and WCAG
 * 2.2 additions, which EN 301 549 v3.2.1 does not require.
 */
export function findCriterion(ref: string): Criterion | undefined {
  const trimmed = ref.trim();
  return byClause.get(trimmed) ?? byWcag.get(trimmed);
}

/** Numeric order, so 1.4.3 comes before 1.4.10. */
export function compareRefs(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
