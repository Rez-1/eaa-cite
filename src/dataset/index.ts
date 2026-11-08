import { readData } from "../dataPath.js";
import type { HarmonisationStatus } from "../standards/harmonisation.js";
import { parseJurisdictionFile, walkCitations, type CitationEntry, type CitedClaims, type CitedJurisdiction, type ResolvedCitation } from "./load.js";
import { claimsSchema, type ClaimId, type Jurisdiction } from "./schema.js";

export * from "./schema.js";
export * from "./load.js";

/**
 * Questions about the shipped dataset. Every answer carries resolved
 * citations; callers never see a bare source id.
 */

/** The files shipped in data/jurisdictions/. Adding a member state means adding it here. */
export const PUBLISHED = ["EU", "SE", "DE", "ES"] as const satisfies readonly Jurisdiction[];
export type Published = (typeof PUBLISHED)[number];

/** Every claim id the schema defines, as a schema, so tool inputs can validate against it. */
export const claimIdSchema = claimsSchema.keyof();

const raw = new Map<Published, unknown>();
const cited = new Map<Published, CitedJurisdiction>();
for (const code of PUBLISHED) {
  const json = readData(`jurisdictions/${code.toLowerCase()}.json`);
  raw.set(code, json);
  cited.set(code, parseJurisdictionFile(json, code));
}

export function isPublished(code: string): code is Published {
  return (PUBLISHED as readonly string[]).includes(code);
}

export class UnknownJurisdictionError extends Error {
  constructor(code: string) {
    super(`No data for ${JSON.stringify(code)}. Published: ${PUBLISHED.join(", ")}`);
    this.name = "UnknownJurisdictionError";
  }
}

function published(code: string): Published {
  const upper = code.trim().toUpperCase();
  if (!isPublished(upper)) throw new UnknownJurisdictionError(code);
  return upper;
}

/** One jurisdiction, by code in any case. */
export function getJurisdiction(code: string): CitedJurisdiction {
  return cited.get(published(code))!;
}

/** The file exactly as checked in. For showing the source data, not for reading values. */
export function rawJurisdictionFile(code: string): unknown {
  return raw.get(published(code));
}

/** Every citation in a jurisdiction: its claims, and for the EU the harmonisation block. */
export function citationsOf(code: string): CitationEntry[] {
  return walkCitations(getJurisdiction(code));
}

/** One claim across every published jurisdiction, and the ones with no value for it. */
export function compareClaim<K extends ClaimId>(claim: K) {
  const rows = PUBLISHED.flatMap((code) => {
    const entry: CitedClaims[K] = getJurisdiction(code).claims[claim];
    return entry ? [{ jurisdiction: code, ...(entry as NonNullable<CitedClaims[K]>) }] : [];
  });
  return { claim, rows, absent: PUBLISHED.filter((code) => !getJurisdiction(code).claims[claim]) };
}

export type ResolvedHarmonisation = {
  status: HarmonisationStatus;
  /** Where the answer comes from: the EU-level check, or the member state's own law. */
  basis: "eu" | "national-law";
  enVersion: string | null;
  checkedAt: string;
  citations: (ResolvedCitation & { jurisdiction: Published })[];
};

/**
 * The harmonisation status that applies in a member state. A member state whose
 * law names an EN 301 549 version is `national_only`; otherwise it takes the
 * EU-level answer. Each citation says which jurisdiction it came from, because
 * an EU citation in a Swedish answer still points at EUR-Lex.
 */
export function harmonisationFor(code: string): ResolvedHarmonisation {
  return resolveHarmonisation(getJurisdiction(code), getJurisdiction("EU"));
}

/** The rule behind harmonisationFor, taking both files so it can be tested on edited copies. */
export function resolveHarmonisation(file: CitedJurisdiction, eu: CitedJurisdiction): ResolvedHarmonisation {
  if (!eu.harmonisation) throw new Error("The EU file has no harmonisation block");
  const named = file.claims.presumptionOfConformity.value.namesEn301549Version;

  if (file.jurisdiction !== "EU" && named) {
    return {
      status: "national_only",
      basis: "national-law",
      enVersion: named,
      checkedAt: file.sources[0]!.retrievedAt,
      citations: file.claims.presumptionOfConformity.citations.map((c) => ({ ...c, jurisdiction: file.jurisdiction as Published })),
    };
  }
  return {
    status: eu.harmonisation.status,
    basis: "eu",
    enVersion: null,
    checkedAt: eu.harmonisation.checkedAt,
    citations: eu.harmonisation.citations.map((c) => ({ ...c, jurisdiction: "EU" as const })),
  };
}
