import { readData } from "../dataPath.js";
import { resolveConformance, type Assessed, type ConformanceAnswer } from "./conformance.js";
import { parseJurisdictionFile, walkCitations, type CitationEntry, type CitedClaims, type CitedHarmonisation, type CitedJurisdiction, type LoadedJurisdiction } from "./load.js";
import { claimsSchema, type ClaimId, type Jurisdiction } from "./schema.js";

export * from "./schema.js";
export * from "./load.js";
export * from "./conformance.js";
export * from "./officialHosts.js";

/**
 * Questions about the shipped dataset. Every answer carries resolved
 * citations; callers never see a bare source id.
 */

/** The files shipped in data/jurisdictions/. Adding a member state means adding it here. */
export const PUBLISHED = ["EU", "SE", "DE", "ES"] as const satisfies readonly Jurisdiction[];
export type Published = (typeof PUBLISHED)[number];

/** Every claim id the schema defines, as a schema, so tool inputs can validate against it. */
export const claimIdSchema = claimsSchema.keyof();

/** One shipped file: as checked in, and as loaded. Loading throws if any file breaks a rule. */
type Shipped = LoadedJurisdiction & { raw: unknown };

const shipped = Object.fromEntries(
  PUBLISHED.map((code) => {
    const raw = readData(`jurisdictions/${code.toLowerCase()}.json`);
    return [code, { raw, ...parseJurisdictionFile(raw, code) }];
  }),
) as Record<Published, Shipped>;

/** The EU file's harmonisation block. A load rule refuses an EU file without one. */
export const euHarmonisation: CitedHarmonisation = shipped.EU.harmonisation!;

export function isPublished(code: string): code is Published {
  return (PUBLISHED as readonly string[]).includes(code);
}

export class UnknownJurisdictionError extends Error {
  constructor(code: string) {
    super(`No data for ${JSON.stringify(code)}. Published: ${PUBLISHED.join(", ")}`);
    this.name = "UnknownJurisdictionError";
  }
}

/** A shipped file by code in any case, or UnknownJurisdictionError. */
function shippedFile(code: string): Shipped {
  const upper = code.trim().toUpperCase();
  if (!isPublished(upper)) throw new UnknownJurisdictionError(code);
  return shipped[upper];
}

/** One jurisdiction, by code in any case. */
export function getJurisdiction(code: string): CitedJurisdiction {
  return shippedFile(code).cited;
}

/** The file exactly as checked in. For showing the source data, not for reading values. */
export function rawJurisdictionFile(code: string): unknown {
  return shippedFile(code).raw;
}

/** Every citation in a jurisdiction: its claims, and for the EU the harmonisation block. */
export function citationsOf(code: string): CitationEntry[] {
  const { cited, harmonisation } = shippedFile(code);
  return walkCitations({ claims: cited.claims, ...(harmonisation ? { harmonisation } : {}) });
}

/** One claim across every published jurisdiction, and the ones with no value for it. */
export function compareClaim<K extends ClaimId>(claim: K) {
  const rows = PUBLISHED.flatMap((code) => {
    const entry: CitedClaims[K] = getJurisdiction(code).claims[claim];
    return entry ? [{ jurisdiction: code, ...(entry as NonNullable<CitedClaims[K]>) }] : [];
  });
  return { claim, rows, absent: PUBLISHED.filter((code) => !rows.some((row) => row.jurisdiction === code)) };
}

/** What compare_jurisdictions returns. */
export type ClaimComparison = ReturnType<typeof compareClaim<ClaimId>>;

/**
 * What a report may say about the standard in one jurisdiction: status, the
 * version that governs, the fixed sentence and its citations. Throws
 * VersionMismatchError if the law names a version other than `assessed.enVersion`.
 */
export function conformanceFor(
  code: string,
  assessed: Assessed = {},
): ConformanceAnswer {
  return resolveConformance(getJurisdiction(code), euHarmonisation, assessed);
}
