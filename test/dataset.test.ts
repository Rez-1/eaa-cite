import { describe, expect, it } from "vitest";
import {
  citationsOf,
  compareClaim,
  DatasetIntegrityError,
  conformanceFor,
  euHarmonisation,
  getJurisdiction,
  parseJurisdictionFile,
  PUBLISHED,
  rawJurisdictionFile,
  resolveConformance,
  VersionMismatchError,
  type CitedJurisdiction,
  type Published,
} from "../src/dataset/index.js";
import { wordCount } from "../src/dataset/quotes.js";

/**
 * Two kinds of rule. Structural rules (ADR 0001) are checked when a file loads,
 * so they are tested by breaking copies of real files and asking the loader.
 * Editorial rules depend on the date or on judgement, so they run here against
 * the shipped data and never at load.
 */

/** A deep copy of a shipped file, as checked in, for breaking on purpose. */
function copyOf(code: Published): any {
  return structuredClone(rawJurisdictionFile(code));
}

function problemsLoading(json: unknown, code: Published): readonly string[] {
  try {
    parseJurisdictionFile(json, code);
  } catch (error) {
    if (error instanceof DatasetIntegrityError) return error.problems;
    throw error;
  }
  return [];
}

describe("loading", () => {
  it("loads every shipped file with no problems", () => {
    for (const code of PUBLISHED) expect(problemsLoading(rawJurisdictionFile(code), code), code).toEqual([]);
  });

  it("gives every citation its full source", () => {
    const [first] = getJurisdiction("DE").claims.penalties.citations;
    expect(first!.source).toMatchObject({ id: "bfsg-37", url: "https://www.gesetze-im-internet.de/bfsg/__37.html", language: "de" });
  });

  it("rejects a citation naming a source that is not listed", () => {
    const de = copyOf("DE");
    de.claims.penalties.citations[0].source = "bfsg-99";
    expect(problemsLoading(de, "DE")).toContain('claims.penalties.citations[0]: names source "bfsg-99", which is not listed');
  });

  it("rejects a source nothing cites", () => {
    const se = copyOf("SE");
    se.sources.push({ ...se.sources[0], id: "orphan" });
    expect(problemsLoading(se, "SE")).toContain('sources: "orphan" is never cited');
  });

  it("rejects two sources with the same id", () => {
    const es = copyOf("ES");
    es.sources.push({ ...es.sources[0] });
    expect(problemsLoading(es, "ES")).toContain('sources: id "ley-11-2023" is listed twice');
  });

  it("rejects a non-English quote with no translation", () => {
    const se = copyOf("SE");
    delete se.claims.applicationDate.citations[0].translation;
    expect(problemsLoading(se, "SE")).toContain("claims.applicationDate.citations[0]: quote is in sv and has no translation");
  });

  it("rejects a file that declares a different jurisdiction from its name", () => {
    const se = copyOf("SE");
    se.jurisdiction = "DK";
    expect(problemsLoading(se, "SE")).toContain("jurisdiction: declares DK, but the file is for SE");
  });

  it("reports schema problems with their path", () => {
    const de = copyOf("DE");
    de.claims.penalties.citations = [];
    expect(problemsLoading(de, "DE")).toEqual([expect.stringMatching(/^claims\.penalties\.citations: /)]);
  });

  it("reports every problem at once, so a hand edit is fixed in one pass", () => {
    const de = copyOf("DE");
    de.claims.penalties.citations[0].source = "bfsg-99";
    delete de.claims.microenterpriseExemption.citations[0].translation;
    const problems = problemsLoading(de, "DE");
    expect(problems).toHaveLength(3); // the bad id, bfsg-37 now uncited, the missing translation
    expect(() => parseJurisdictionFile(de, "DE")).toThrow(/jurisdictions\/de\.json does not load/);
  });

  it("requires the EU file to record the harmonisation status", () => {
    const eu = copyOf("EU");
    delete eu.harmonisation;
    expect(problemsLoading(eu, "EU")).toContain("harmonisation: the EU file must record the harmonisation status");
  });

  it("refuses a harmonisation block in a member state's file", () => {
    const se = copyOf("SE");
    se.harmonisation = copyOf("EU").harmonisation;
    expect(problemsLoading(se, "SE")).toContain(
      "harmonisation: only the EU file records it; member states take the EU answer (ADR 0003)",
    );
  });

  it("keeps harmonisation off what callers read", () => {
    for (const code of PUBLISHED) expect(getJurisdiction(code), code).not.toHaveProperty("harmonisation");
  });
});

/** Re-verify at least yearly. Statutes get amended; this makes the data say so. */
const MAX_AGE_DAYS = 365;
/** Short quotes: enough to check, not a reproduction of the text. */
const MAX_QUOTE_WORDS = 30;

describe("editorial rules on the shipped data", () => {
  const all = PUBLISHED.flatMap((code) => citationsOf(code).map((entry) => ({ code, ...entry })));

  it(`quotes at most ${MAX_QUOTE_WORDS} words`, () => {
    for (const { code, path, citation } of all) expect(wordCount(citation.quote), `${code} ${path}`).toBeLessThanOrEqual(MAX_QUOTE_WORDS);
  });

  it(`retrieved every source within the last ${MAX_AGE_DAYS} days and not in the future`, () => {
    const now = Date.now();
    for (const code of PUBLISHED) {
      for (const source of getJurisdiction(code).sources) {
        const age = (now - Date.parse(source.retrievedAt)) / 86_400_000;
        expect(age, `${code} ${source.id}`).toBeGreaterThanOrEqual(-1);
        expect(age, `${code} ${source.id} is stale: run npm run verify-sources and update retrievedAt`).toBeLessThanOrEqual(MAX_AGE_DAYS);
      }
    }
  });

  it("uses official sources only: EUR-Lex, the Commission, national gazettes and statute sites, or the authority itself", () => {
    const official = /^https:\/\/(eur-lex\.europa\.eu|single-market-economy\.ec\.europa\.eu|www\.riksdagen\.se|www\.gesetze-im-internet\.de|www\.bgbl\.de|www\.boe\.es|www\.mlbf-barrierefrei\.de)\//;
    for (const code of PUBLISHED) for (const s of getJurisdiction(code).sources) expect(s.url, `${code} ${s.id}`).toMatch(official);
  });

  it("files nothing outside the EU under the EAA", () => {
    // The EAA is an EU directive. A UK or Norwegian law filed under it would be
    // a category error, however similar the obligations look.
    expect(PUBLISHED).not.toContain("GB");
    expect(PUBLISHED).not.toContain("NO");
  });

  it("applies the directive from 28 June 2025 everywhere", () => {
    for (const code of PUBLISHED) expect(getJurisdiction(code).claims.applicationDate.value.date, code).toBe("2025-06-28");
  });
});

describe("queries", () => {
  it("finds a jurisdiction by code in any case, and names the published ones when it cannot", () => {
    expect(getJurisdiction(" se ").jurisdiction).toBe("SE");
    expect(() => getJurisdiction("GB")).toThrow(/No data for "GB"\. Published: EU, SE, DE, ES/);
  });

  it("walks the harmonisation citations as well as the claims", () => {
    const places = new Set(citationsOf("EU").map((e) => e.place));
    expect(places).toContain("harmonisation");
    expect(places).toContain("penalties");
    expect(citationsOf("SE").some((e) => e.place === "harmonisation")).toBe(false);
  });

  it("compares one claim across jurisdictions and names where it is absent", () => {
    const { rows, absent } = compareClaim("transitionalSelfServiceTerminals");
    expect(rows.map((r) => [r.jurisdiction, r.value.maxYearsAfterFirstUse])).toEqual([["EU", 20], ["DE", 15], ["ES", 10]]);
    expect(absent).toEqual(["SE"]);
    for (const row of rows) expect(row.citations[0]!.source.url).toMatch(/^https:\/\//);
  });
});

/** A copy of a member state whose law names an EN 301 549 version, which none does today. */
function namingVersion(code: Published, version: string): CitedJurisdiction {
  const file = structuredClone(getJurisdiction(code));
  file.claims.presumptionOfConformity.value.namesEn301549Version = version;
  return file;
}

describe("conformance", () => {
  it("is cited only with evidence from the Official Journal mechanism", () => {
    // If someone flips the status to "cited", they must also add the
    // Commission implementing decision as a legislation source.
    if (euHarmonisation.status === "cited") {
      expect(euHarmonisation.citations.map((c) => c.source.kind)).toContain("legislation");
    }
  });

  it("is never supported by a Web Accessibility Directive citation alone", () => {
    const quotes = euHarmonisation.citations.map((c) => c.quote).join(" ");
    if (/2016\/2102/.test(quotes)) expect(euHarmonisation.status).not.toBe("cited");
  });

  it("gives member states with no version in their own law the EU answer, with EU citations", () => {
    for (const code of ["SE", "DE", "ES"]) {
      const answer = conformanceFor(code);
      expect(answer, code).toMatchObject({ status: euHarmonisation.status, basis: "eu", enVersion: "EN 301 549 v3.2.1" });
      for (const c of answer.citations) expect(c.jurisdiction).toBe("EU");
    }
  });

  it("uses the caller's version and baseline when the law names none", () => {
    const answer = conformanceFor("ES", { enVersion: "EN 301 549 v3.2.1", wcagVersion: "WCAG 2.1 AA" });
    expect(answer.sentence).toContain("EN 301 549 v3.2.1 (WCAG 2.1 AA) as a technical benchmark");
    expect(answer.mayClaimPresumptionOfConformity).toBe(false);
  });

  it("makes a member state whose law names a version national_only, citing its own law", () => {
    const answer = resolveConformance(namingVersion("SE", "EN 301 549 v3.1.1"), euHarmonisation);
    expect(answer).toMatchObject({ status: "national_only", basis: "national-law", enVersion: "EN 301 549 v3.1.1" });
    expect(answer.sentence).toContain("EN 301 549 v3.1.1 (WCAG 2.1 AA), the version named directly in SE national law");
    for (const c of answer.citations) expect(c.jurisdiction).toBe("SE");
  });

  it("names the law's version even when the caller passes none", () => {
    // The old server passed "EN 301 549 v3.2.1" by default here, whatever the law said.
    const answer = resolveConformance(namingVersion("DE", "EN 301 549 v3.1.1"), euHarmonisation, {});
    expect(answer.enVersion).toBe("EN 301 549 v3.1.1");
  });

  it("refuses an assessment against a version the law does not name", () => {
    const de = namingVersion("DE", "EN 301 549 v3.1.1");
    expect(() => resolveConformance(de, euHarmonisation, { enVersion: "EN 301 549 v3.2.1" })).toThrow(VersionMismatchError);
    expect(() => resolveConformance(de, euHarmonisation, { enVersion: "EN 301 549 v3.2.1" })).toThrow(
      /DE law names EN 301 549 v3\.1\.1, but the assessment used EN 301 549 v3\.2\.1/,
    );
    expect(() => resolveConformance(de, euHarmonisation, { enVersion: "EN 301 549 v3.1.1" })).not.toThrow();
  });

  it("dates the answer by the oldest cited source, not the file's first source", () => {
    const de = namingVersion("DE", "EN 301 549 v3.1.1");
    // bfsg-2 is listed first; the presumption claim cites bfsg-4. Age bfsg-2 only.
    const first = de.sources[0]!;
    expect(first.id).toBe("bfsg-2");
    first.retrievedAt = "2020-01-01";
    for (const c of de.claims.presumptionOfConformity.citations) c.source = { ...c.source, retrievedAt: "2026-10-01" };
    expect(resolveConformance(de, euHarmonisation).checkedAt).toBe("2026-10-01");
  });

  it("never makes the EU file national_only", () => {
    const eu = structuredClone(getJurisdiction("EU"));
    eu.claims.presumptionOfConformity.value.namesEn301549Version = "EN 301 549 v3.2.1";
    expect(resolveConformance(eu, euHarmonisation).basis).toBe("eu");
  });
});
