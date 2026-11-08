import { datesInText, figuresInValue, numbersInText } from "./figures.js";
import { isOfficialSourceUrl } from "./officialHosts.js";
import {
  jurisdictionFileSchema,
  type Citation,
  type Claims,
  type ClaimId,
  type Jurisdiction,
  type JurisdictionFile,
  type Source,
} from "./schema.js";

/**
 * Reads one jurisdiction file and turns it into the form every caller uses:
 * each citation carries its full source instead of a source id.
 *
 * A file that breaks the structural rules of ADR 0001 does not load. Quote
 * length is a test, not a load check, because it is editorial judgement; source
 * age is checked by verify-sources, never here, because a check on the date
 * would stop a published copy working a year after release.
 */

/** A citation with its source filled in. */
export type ResolvedCitation = Omit<Citation, "source"> & { source: Source };

/**
 * Swaps a claim's citations for resolved ones; leaves everything else as it is.
 * It distributes over unions, so an optional claim (`X | undefined`) stays optional.
 */
type Cite<C> = C extends { citations: Citation[] } ? Omit<C, "citations"> & { citations: ResolvedCitation[] } : C;

export type CitedClaims = { [K in keyof Claims]: Cite<Claims[K]> };

/**
 * A jurisdiction file as callers see it: same content, citations resolved. It
 * has no harmonisation field: only the EU file records one, and a member
 * state's answer is worked out by conformanceFor, so a field that is undefined
 * for every member state would read like an answer when it isn't one.
 */
export type CitedJurisdiction = Omit<JurisdictionFile, "claims" | "harmonisation"> & { claims: CitedClaims };

/** The EU file's harmonisation block, citations resolved. */
export type CitedHarmonisation = Cite<NonNullable<JurisdictionFile["harmonisation"]>>;

/** What loading one file produces. `harmonisation` is set for the EU file only. */
export type LoadedJurisdiction = { cited: CitedJurisdiction; harmonisation: CitedHarmonisation | null };

/** Where a citation sits in a file: a claim id, or the EU harmonisation block. */
export type CitationPlace = ClaimId | "harmonisation";

export class DatasetIntegrityError extends Error {
  constructor(
    readonly file: string,
    readonly problems: readonly string[],
  ) {
    super(`${file} does not load:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "DatasetIntegrityError";
  }
}

/** One citation and where it sits, with the path an editor would look for. */
export type CitationEntry<C = ResolvedCitation> = { place: CitationPlace; path: string; citation: C };

type HasCitations<C> = { citations: readonly C[] } | undefined;

/**
 * Every citation in a file, raw or cited: its claims, then the EU harmonisation
 * block. The one place that knows where citations live, so a new
 * citation-bearing field is added here and nowhere else.
 */
export function walkCitations<C>(file: { claims: Record<string, HasCitations<C>>; harmonisation?: HasCitations<C> }): CitationEntry<C>[] {
  const entries: CitationEntry<C>[] = [];
  for (const [id, claim] of Object.entries(file.claims)) {
    claim?.citations.forEach((citation, i) =>
      entries.push({ place: id as ClaimId, path: `claims.${id}.citations[${i}]`, citation }),
    );
  }
  file.harmonisation?.citations.forEach((citation, i) =>
    entries.push({ place: "harmonisation", path: `harmonisation.citations[${i}]`, citation }),
  );
  return entries;
}

type RawEntry = CitationEntry<Citation>;

/**
 * The structural rules. Each returns the problems it found; an empty list
 * means the rule holds. Adding a rule is adding an entry here.
 */
/** A structural rule: the problems it finds in one file, or none. */
type Rule = (file: JurisdictionFile, citations: readonly RawEntry[], expected?: Jurisdiction) => string[];

const RULES: readonly Rule[] = [
  // data/jurisdictions/se.json must be Sweden's file, not a copy of another.
  function fileIsForItsJurisdiction(file, _citations, expected) {
    return expected && file.jurisdiction !== expected
      ? [`jurisdiction: declares ${file.jurisdiction}, but the file is for ${expected}`]
      : [];
  },

  // The status is recorded once, at EU level (ADR 0003).
  function harmonisationIsRecordedAtEuLevelOnly(file) {
    if (file.jurisdiction === "EU" && !file.harmonisation) return ["harmonisation: the EU file must record the harmonisation status"];
    if (file.jurisdiction !== "EU" && file.harmonisation) return ["harmonisation: only the EU file records it; member states take the EU answer (ADR 0003)"];
    return [];
  },

  // Only official publishers count, and the source checker fetches these URLs.
  function sourcesAreOnOfficialHosts(file) {
    return file.sources
      .filter((s) => !isOfficialSourceUrl(s.url))
      .map((s) => `sources: "${s.id}" is not on an official host (${s.url}); see src/dataset/officialHosts.ts`);
  },

  // Two sources with one id would make every citation of that id ambiguous.
  function sourceIdsAreUnique(file) {
    const seen = new Set<string>();
    return file.sources.flatMap((s) => {
      if (seen.has(s.id)) return [`sources: id "${s.id}" is listed twice`];
      seen.add(s.id);
      return [];
    });
  },

  // A citation must say where its quote can be checked (ADR 0001).
  function citationsNameListedSources(file, citations) {
    const ids = new Set(file.sources.map((s) => s.id));
    return citations
      .filter((e) => !ids.has(e.citation.source))
      .map((e) => `${e.path}: names source "${e.citation.source}", which is not listed`);
  },

  // A source nothing cites is either dead weight or a citation that was lost.
  function everySourceIsCited(file, citations) {
    const cited = new Set(citations.map((e) => e.citation.source));
    return file.sources.filter((s) => !cited.has(s.id)).map((s) => `sources: "${s.id}" is never cited`);
  },

  // A reader must be able to check a Swedish quote without reading Swedish.
  function foreignQuotesAreTranslated(file, citations) {
    const language = new Map(file.sources.map((s) => [s.id, s.language]));
    return citations
      .filter((e) => (language.get(e.citation.source) ?? "en") !== "en" && !e.citation.translation)
      .map((e) => `${e.path}: quote is in ${language.get(e.citation.source)} and has no translation`);
  },

  // A fine in the wrong currency is wrong by its whole amount.
  function penaltiesAreInTheNationalCurrency(file) {
    const currency = file.claims.penalties.value.currency;
    const expected = NATIONAL_CURRENCY[file.jurisdiction];
    return currency !== null && expected && currency !== expected
      ? [`claims.penalties.value.currency: is ${currency}, but ${file.jurisdiction} fines are in ${expected}`]
      : [];
  },

  // A value must say what its quote says: every number and date in it has to
  // appear in the English text of one of its citations (src/dataset/figures.ts).
  function figuresComeFromTheirQuotes(file, citations) {
    const english = new Set(file.sources.filter((s) => s.language === "en").map((s) => s.id));
    return Object.entries(file.claims).flatMap(([id, claim]) => {
      if (!claim) return [];
      const text = citations
        .filter((e) => e.place === id)
        .map((e) => e.citation.translation ?? (english.has(e.citation.source) ? e.citation.quote : ""))
        .join("\n");
      const numbers = numbersInText(text);
      const dates = datesInText(text);
      const { numbers: stated, dates: statedDates } = figuresInValue(claim.value);
      return [
        ...stated.filter((n) => !numbers.has(n)).map((n) => `claims.${id}.value: ${n} is not in any of its citations`),
        ...statedDates.filter((d) => !dates.has(d)).map((d) => `claims.${id}.value: ${d} is not in any of its citations`),
      ];
    });
  },
];

/** The currency fines are stated in. Only currencies the schema allows are listed. */
const NATIONAL_CURRENCY: Partial<Record<Jurisdiction, "EUR" | "SEK">> = {
  SE: "SEK",
  ...Object.fromEntries(
    ["EU", "AT", "BE", "BG", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"].map((j) => [j, "EUR"]),
  ),
};

/**
 * Parses and checks one file. `expected` is the jurisdiction the file is
 * named for; a file declaring another one is rejected. Throws one
 * DatasetIntegrityError listing every problem found, so a hand edit can be
 * fixed in one pass.
 */
export function parseJurisdictionFile(json: unknown, expected?: Jurisdiction): LoadedJurisdiction {
  const label = expected ? `jurisdictions/${expected.toLowerCase()}.json` : "jurisdiction file";

  const parsed = jurisdictionFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new DatasetIntegrityError(
      label,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  const file = parsed.data;

  const citations = walkCitations(file);
  const problems = RULES.flatMap((rule) => rule(file, citations, expected));
  if (problems.length > 0) throw new DatasetIntegrityError(label, problems);

  // citationsNameListedSources has passed, so every lookup below finds its source.
  const sources = new Map(file.sources.map((s) => [s.id, s]));
  const resolve = (citation: Citation): ResolvedCitation => ({ ...citation, source: sources.get(citation.source)! });

  // TypeScript cannot follow a per-key rewrite through Object.entries, hence the cast.
  const claims = Object.fromEntries(
    Object.entries(file.claims).map(([id, claim]) => [id, claim && { ...claim, citations: claim.citations.map(resolve) }]),
  ) as CitedClaims;

  const { harmonisation, ...rest } = file;
  return {
    cited: { ...rest, claims },
    harmonisation: harmonisation ? { ...harmonisation, citations: harmonisation.citations.map(resolve) } : null,
  };
}
