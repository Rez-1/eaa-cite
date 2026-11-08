import { readData } from "../dataPath.js";
import type { HarmonisationStatus } from "../standards/harmonisation.js";
import { jurisdictionFileSchema, type Citation, type Jurisdiction, type JurisdictionFile } from "./schema.js";

export * from "./schema.js";

/** The files shipped in data/jurisdictions/. Adding a member state means adding it here. */
export const PUBLISHED = ["EU", "SE", "DE", "ES"] as const satisfies readonly Jurisdiction[];
export type Published = (typeof PUBLISHED)[number];

function load(code: Published): JurisdictionFile {
  const file = jurisdictionFileSchema.parse(readData(`jurisdictions/${code.toLowerCase()}.json`));
  if (file.jurisdiction !== code) throw new Error(`jurisdictions/${code.toLowerCase()}.json declares ${file.jurisdiction}`);
  return file;
}

export const dataset: Readonly<Record<Published, JurisdictionFile>> = Object.fromEntries(
  PUBLISHED.map((code) => [code, load(code)]),
) as Record<Published, JurisdictionFile>;

export function isPublished(code: string): code is Published {
  return (PUBLISHED as readonly string[]).includes(code);
}

export class UnknownJurisdictionError extends Error {
  constructor(code: string) {
    super(`No data for ${JSON.stringify(code)}. Published: ${PUBLISHED.join(", ")}`);
    this.name = "UnknownJurisdictionError";
  }
}

export function getJurisdiction(code: string): JurisdictionFile {
  const upper = code.trim().toUpperCase();
  if (!isPublished(upper)) throw new UnknownJurisdictionError(code);
  return dataset[upper];
}

export type ResolvedHarmonisation = {
  status: HarmonisationStatus;
  /** Where the answer comes from: the EU-level check, or the member state's own law. */
  basis: "eu" | "national-law";
  enVersion: string | null;
  checkedAt: string;
  citations: (Citation & { jurisdiction: Published })[];
};

/**
 * The harmonisation status that applies in a member state. A member state whose
 * law names an EN 301 549 version is `national_only`; otherwise it takes the
 * EU-level answer. The citations say which file each one came from, because an
 * EU citation quoted from a Swedish answer must still point at EUR-Lex.
 */
export function harmonisationFor(code: string): ResolvedHarmonisation {
  return resolveHarmonisation(getJurisdiction(code), dataset.EU);
}

/** The rule behind harmonisationFor, taking both files so it can be tested on edited copies. */
export function resolveHarmonisation(file: JurisdictionFile, eu: JurisdictionFile): ResolvedHarmonisation {
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
