/**
 * Whether a version of EN 301 549 gives a presumption of conformity under the
 * European Accessibility Act, Directive (EU) 2019/882.
 *
 * Three answers, each one a fact somebody looked up at a source on a date:
 *
 * - `cited`: the Commission has published the standard's reference in the
 *   Official Journal under 2019/882 (Article 15(1)).
 * - `not_cited`: it has not. EN 301 549 can still be used as a technical
 *   benchmark, but conformity with it presumes nothing.
 * - `national_only`: no OJ citation, but the member state's own law names the
 *   version. The version governs there; the presumption is still the OJ
 *   mechanism, so it is not claimed.
 *
 * The trap these three values exist to block: EN 301 549 v3.2.1 is cited under
 * the Web Accessibility Directive, 2016/2102, which covers public sector
 * bodies. That citation says nothing about the EAA. See ADR 0003.
 */
export const HARMONISATION_STATUSES = ["cited", "not_cited", "national_only"] as const;

export type HarmonisationStatus = (typeof HARMONISATION_STATUSES)[number];

/**
 * The write boundary for the status. Someone typing "harmonised" is making
 * exactly the conflation this type exists to remove, so an unknown value is
 * rejected, never coerced.
 */
export function parseHarmonisationStatus(value: string | undefined): HarmonisationStatus {
  const match = HARMONISATION_STATUSES.find((status) => status === value);
  if (!match) {
    throw new Error(
      `Unknown harmonisation status ${JSON.stringify(value ?? null)}. ` +
        `Expected one of: ${HARMONISATION_STATUSES.join(", ")}`,
    );
  }
  return match;
}

export type ConformanceInput = {
  status: HarmonisationStatus;
  enVersion: string;
  wcagVersion: string;
  memberState: string;
};

export type ConformanceStatement = {
  /** True only for `cited`. Nothing but an OJ citation confers the presumption. */
  mayClaimPresumptionOfConformity: boolean;
  sentence: string;
};

/**
 * The sentence a report prints about the standard, chosen from the verified
 * status. Wording is fixed here rather than generated, so changing it is a diff
 * someone reviews; the tests compare whole strings for that reason.
 */
export function conformanceStatement(input: ConformanceInput): ConformanceStatement {
  const standard = `${input.enVersion} (${input.wcagVersion})`;

  switch (input.status) {
    case "cited":
      return {
        mayClaimPresumptionOfConformity: true,
        sentence:
          `The site was assessed against ${standard}, the harmonised standard ` +
          `cited in the Official Journal of the European Union under Directive (EU) ` +
          `2019/882. Conformity with that standard carries a presumption of conformity ` +
          `with the accessibility requirements it covers.`,
      };

    case "not_cited":
      return {
        mayClaimPresumptionOfConformity: false,
        sentence:
          `The site was assessed against ${standard} as a technical benchmark. ` +
          `No version of EN 301 549 is currently cited in the Official Journal of the ` +
          `European Union under Directive (EU) 2019/882, so no presumption of conformity ` +
          `is available through a harmonised standard, to this site or to any other.`,
      };

    case "national_only":
      return {
        mayClaimPresumptionOfConformity: false,
        sentence:
          `The site was assessed against ${standard}, the version named directly ` +
          `in ${input.memberState} national law transposing Directive (EU) 2019/882. ` +
          `That version governs in ${input.memberState} regardless of what is cited in ` +
          `the Official Journal of the European Union.`,
      };
  }
}
