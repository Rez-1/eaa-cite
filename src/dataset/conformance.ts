import { conformanceStatement, type HarmonisationStatus } from "../standards/harmonisation.js";
import type { CitedHarmonisation, CitedJurisdiction, ResolvedCitation } from "./load.js";
import type { Jurisdiction } from "./schema.js";

/**
 * What an accessibility report may say about the standard it assessed against,
 * in one jurisdiction: the harmonisation status, the version that governs, the
 * fixed sentence, and the citations the answer rests on (ADR 0003).
 */

export const DEFAULT_EN_VERSION = "EN 301 549 v3.2.1";
export const DEFAULT_WCAG_VERSION = "WCAG 2.1 AA";

export type Conformance = {
  status: HarmonisationStatus;
  /** Where the status comes from: the EU-level check, or the member state's own law. */
  basis: "eu" | "national-law";
  /** The version the sentence names. For national_only, the one the law names. */
  enVersion: string;
  wcagVersion: string;
  sentence: string;
  mayClaimPresumptionOfConformity: boolean;
  /** The oldest retrieval date among the cited sources: the answer is only as fresh as that. */
  checkedAt: string;
  /** Each tagged with its jurisdiction, because an EU citation in a Swedish answer still points at EUR-Lex. */
  citations: (ResolvedCitation & { jurisdiction: Jurisdiction })[];
};

export class VersionMismatchError extends Error {
  constructor(
    readonly jurisdiction: string,
    readonly namedInLaw: string,
    readonly assessed: string,
  ) {
    super(
      `${jurisdiction} law names ${namedInLaw}, but the assessment used ${assessed}. ` +
        `The conformance sentence cannot name a version the law does not.`,
    );
    this.name = "VersionMismatchError";
  }
}

/**
 * The answer for one jurisdiction file, given the EU harmonisation block. Pure,
 * so it can be tested on edited copies of the files.
 *
 * A member state whose law names an EN 301 549 version is national_only, and
 * that version is the one the sentence names; an assessment against any other
 * version is refused. Every other jurisdiction takes the EU answer.
 */
export function resolveConformance(
  file: CitedJurisdiction,
  eu: CitedHarmonisation,
  assessed: { enVersion?: string | undefined; wcagVersion?: string | undefined } = {},
): Conformance {
  const named = file.jurisdiction === "EU" ? null : file.claims.presumptionOfConformity.value.namesEn301549Version;

  if (named && assessed.enVersion && assessed.enVersion !== named) {
    throw new VersionMismatchError(file.jurisdiction, named, assessed.enVersion);
  }

  const status: HarmonisationStatus = named ? "national_only" : eu.status;
  const citations = named
    ? file.claims.presumptionOfConformity.citations.map((c) => ({ ...c, jurisdiction: file.jurisdiction }))
    : eu.citations.map((c) => ({ ...c, jurisdiction: "EU" as const }));
  const enVersion = named ?? assessed.enVersion ?? DEFAULT_EN_VERSION;
  const wcagVersion = assessed.wcagVersion ?? DEFAULT_WCAG_VERSION;

  return {
    status,
    basis: named ? "national-law" : "eu",
    enVersion,
    wcagVersion,
    ...conformanceStatement({ status, enVersion, wcagVersion, memberState: file.jurisdiction }),
    // ISO dates sort as strings.
    checkedAt: citations.map((c) => c.source.retrievedAt).sort()[0]!,
    citations,
  };
}
