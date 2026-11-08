import { z } from "zod";

/**
 * The shape of every file in data/jurisdictions/. One file per jurisdiction:
 * the EU directive itself, and each member state's transposition.
 *
 * The rule the schema enforces: a claim is a value plus at least one citation,
 * and a citation is a verbatim quote at a named place in a named source. There
 * is no way to write a value without saying where it came from (ADR 0001).
 *
 * Every object is strict: an unknown key is a load error, so a misspelt claim
 * id or field fails loudly instead of being dropped.
 */

const isoDate = z.iso.date();

/** EU-27 plus "EU" for the directive. Anything else is not under the EAA. */
export const JURISDICTIONS = [
  "EU",
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
] as const;
export type Jurisdiction = (typeof JURISDICTIONS)[number];

export const sourceSchema = z.strictObject({
  /** Referenced by citations in the same file. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  /** Official identifier: CELEX, SFS number, BGBl reference, BOE id. */
  identifier: z.string().min(1).optional(),
  kind: z.enum(["legislation", "consolidated-text", "official-gazette", "authority-page", "commission-page", "search"]),
  url: z.url(),
  language: z.enum(["en", "sv", "de", "es"]),
  retrievedAt: isoDate,
  /**
   * `quote`: scripts/verify-sources.ts fetches the URL and checks every quote
   * citing it is still in the text. `manual`: the URL is a JavaScript viewer or
   * otherwise cannot be fetched by a script; a person re-checks it.
   */
  verify: z.enum(["quote", "manual"]),
  note: z.string().min(1).optional(),
});
export type Source = z.infer<typeof sourceSchema>;

export const citationSchema = z.strictObject({
  source: z.string().min(1),
  /** Article, paragraph, point: as precise as the text allows. */
  pinpoint: z.string().min(1),
  /**
   * Verbatim from the source, in its language. An omission is marked "…" or
   * "[…]" and each piece must appear in the source, in order.
   */
  quote: z.string().min(1),
  /** Required when the source is not in English; checked in the tests. */
  translation: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});
export type Citation = z.infer<typeof citationSchema>;

const claim = <V extends z.ZodType>(value: V) =>
  z.strictObject({
    value,
    citations: z.array(citationSchema).min(1),
    note: z.string().min(1).optional(),
  });

const amount = z.number().int().nonnegative();

export const claimsSchema = z.strictObject({
  applicationDate: claim(z.strictObject({ date: isoDate })),
  transpositionDeadline: claim(z.strictObject({ date: isoDate })).optional(),
  microenterpriseExemption: claim(z.strictObject({ appliesTo: z.literal("services") })),
  microenterpriseDefinition: claim(
    z.strictObject({
      employeesFewerThan: z.number().int().positive(),
      maxAnnualTurnoverEur: amount,
      maxAnnualBalanceSheetTotalEur: amount,
      /** How the thresholds combine, in words. */
      test: z.string().min(1),
    }),
  ),
  presumptionOfConformity: claim(
    z.strictObject({
      basis: z.literal("harmonised standards whose references are published in the Official Journal"),
      /** A version the law itself names, e.g. "EN 301 549 v3.2.1". Null when it names none. */
      namesEn301549Version: z.string().min(1).nullable(),
    }),
  ),
  /** A national standard the law points to separately, as Spain does for websites. */
  nationalStandardReference: claim(
    z.strictObject({ standard: z.string().min(1), edition: z.string().min(1).nullable(), appliesTo: z.string().min(1) }),
  ).optional(),
  supervisoryAuthority: claim(
    z.strictObject({
      summary: z.string().min(1),
      bodies: z.array(
        z.strictObject({ name: z.string().min(1), role: z.string().min(1), website: z.url().optional() }),
      ),
    }),
  ).optional(),
  penalties: claim(
    z.strictObject({
      summary: z.string().min(1),
      currency: z.enum(["EUR", "SEK"]).nullable(),
      /** Highest fine the law states. Null when it states none. */
      maxFine: amount.nullable(),
      tiers: z
        .array(z.strictObject({ label: z.string().min(1), min: amount, max: amount }))
        .optional(),
    }),
  ),
  transitionalServiceContracts: claim(
    z.strictObject({
      rule: z.string().min(1),
      /** The last day stated in the text. Null when the text states a period, not a date. */
      until: isoDate.nullable(),
    }),
  ),
  transitionalSelfServiceTerminals: claim(
    z.strictObject({ rule: z.string().min(1), maxYearsAfterFirstUse: z.number().int().positive() }),
  ).optional(),
});
export type Claims = z.infer<typeof claimsSchema>;
export type ClaimId = keyof Claims;

/**
 * The EU file's answer. Only `cited` or `not_cited`: `national_only` describes a
 * member state's own law and is worked out from its file. It carries no date of
 * its own; the answer is dated by its oldest citation (ADR 0003).
 */
export const harmonisationSchema = z.strictObject({
  status: z.enum(["cited", "not_cited"]),
  citations: z.array(citationSchema).min(1),
  note: z.string().min(1).optional(),
});

export const jurisdictionFileSchema = z.strictObject({
  jurisdiction: z.enum(JURISDICTIONS),
  name: z.string().min(1),
  /** The instrument the claims are about, e.g. "Lag (2023:254)". */
  instrument: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
  claims: claimsSchema,
  /**
   * EU file only: whether any version of EN 301 549 is cited under 2019/882.
   * Member states inherit it unless their own law names a version.
   */
  harmonisation: harmonisationSchema.optional(),
  /** What was looked for and could not be confirmed from a permitted source. */
  unverified: z.array(z.string().min(1)),
});
export type JurisdictionFile = z.infer<typeof jurisdictionFileSchema>;
