import { z } from "zod";
import { readData } from "../dataPath.js";

/**
 * The EN 301 549 v3.2.1 clause 9 table. `scripts/build-criteria.ts` builds it
 * from the ETSI PDF and the WCAG Recommendation; this module only reads it.
 */

/** One row of the published clause 9 table. */
export type Criterion = {
  enClause: string;
  wcagRef: string;
  level: "A" | "AA";
  /** The W3C name of the success criterion, e.g. "Non-text Content". */
  name: string;
  /** The criterion's section in the WCAG Recommendation. */
  wcagUrl: string;
  /** 1-based page of the EN PDF the clause heading is on. */
  enPage: number;
};

const documentSchema = z.object({
  url: z.url(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * The checked-in clause 9 table plus the exact bytes it was extracted from.
 * Written by `scripts/build-criteria.ts` and validated on load, because a hand
 * edit is the way a wrong clause would get in.
 */
const criteriaFileSchema = z.object({
  enVersion: z.string().min(1),
  wcagVersion: z.string().min(1),
  sources: z.object({
    en: documentSchema.extend({ pages: z.number().int().positive() }),
    wcag: documentSchema,
  }),
  extractedAt: z.iso.datetime(),
  criteria: z
    .array(
      z.object({
        enClause: z.string().regex(/^9\.\d+\.\d+\.\d+$/),
        wcagRef: z.string().regex(/^\d+\.\d+\.\d+$/),
        level: z.enum(["A", "AA"]),
        name: z.string().min(1),
        wcagUrl: z.url(),
        enPage: z.number().int().positive(),
      }),
    )
    .min(1),
});

export type CriteriaFile = z.infer<typeof criteriaFileSchema>;

export function parseCriteriaFile(json: unknown): CriteriaFile {
  return criteriaFileSchema.parse(json);
}


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
