import { describe, expect, it } from "vitest";
import {
  citationsOf,
  compareClaim,
  DatasetIntegrityError,
  getJurisdiction,
  harmonisationFor,
  parseJurisdictionFile,
  PUBLISHED,
  rawJurisdictionFile,
  resolveHarmonisation,
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

describe("harmonisation", () => {
  it("is recorded once, at EU level", () => {
    expect(getJurisdiction("EU").harmonisation).toBeDefined();
    for (const code of ["SE", "DE", "ES"]) expect(getJurisdiction(code).harmonisation, code).toBeUndefined();
  });

  it("is cited only with evidence from the Official Journal mechanism", () => {
    // If someone flips the status to "cited", they must also add the
    // Commission implementing decision as a legislation source.
    const eu = getJurisdiction("EU");
    if (eu.harmonisation?.status === "cited") {
      expect(eu.harmonisation.citations.map((c) => c.source.kind)).toContain("legislation");
    }
  });

  it("is never supported by a Web Accessibility Directive citation alone", () => {
    const eu = getJurisdiction("EU");
    const quotes = eu.harmonisation!.citations.map((c) => c.quote).join(" ");
    if (/2016\/2102/.test(quotes)) expect(eu.harmonisation!.status).not.toBe("cited");
  });

  it("gives member states with no version in their own law the EU answer, with EU citations", () => {
    for (const code of ["SE", "DE", "ES"]) {
      const resolved = harmonisationFor(code);
      expect(resolved.basis, code).toBe("eu");
      expect(resolved.status, code).toBe(getJurisdiction("EU").harmonisation!.status);
      for (const c of resolved.citations) expect(c.jurisdiction).toBe("EU");
    }
  });

  it("makes a member state whose law names a version national_only, citing its own law", () => {
    const se = structuredClone(getJurisdiction("SE"));
    se.claims.presumptionOfConformity.value.namesEn301549Version = "EN 301 549 v3.2.1";
    const resolved = resolveHarmonisation(se, getJurisdiction("EU"));
    expect(resolved).toMatchObject({ status: "national_only", basis: "national-law", enVersion: "EN 301 549 v3.2.1" });
    for (const c of resolved.citations) expect(c.jurisdiction).toBe("SE");
  });

  it("never resolves the EU file to national_only", () => {
    const eu = structuredClone(getJurisdiction("EU"));
    eu.claims.presumptionOfConformity.value.namesEn301549Version = "EN 301 549 v3.2.1";
    expect(resolveHarmonisation(eu, eu).status).not.toBe("national_only");
  });
});
