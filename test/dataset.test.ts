import { describe, expect, it } from "vitest";
import { dataset, harmonisationFor, resolveHarmonisation, PUBLISHED, getJurisdiction, type Citation, type JurisdictionFile } from "../src/dataset/index.js";
import { wordCount } from "../src/dataset/quotes.js";

/**
 * Rules on the data itself. A schema can say a citation has a quote; these say
 * the quote is short, points at a real source, is translated, and is recent
 * enough to trust.
 */

/** Every citation in a file, with the claim it supports. */
function citations(file: JurisdictionFile): { where: string; citation: Citation }[] {
  const out: { where: string; citation: Citation }[] = [];
  for (const [id, claim] of Object.entries(file.claims)) {
    for (const citation of claim?.citations ?? []) out.push({ where: `${file.jurisdiction}.${id}`, citation });
  }
  for (const citation of file.harmonisation?.citations ?? []) out.push({ where: `${file.jurisdiction}.harmonisation`, citation });
  return out;
}

const files = PUBLISHED.map((code) => dataset[code]);
const all = files.flatMap((file) => citations(file).map((c) => ({ ...c, file })));

/** Re-verify at least yearly. Statutes get amended; this makes the data say so. */
const MAX_AGE_DAYS = 365;
/** Short quotes: enough to check, not a reproduction of the text. */
const MAX_QUOTE_WORDS = 30;

describe("citations", () => {
  it("each points at a source listed in the same file", () => {
    for (const { where, citation, file } of all) {
      expect(file.sources.map((s) => s.id), where).toContain(citation.source);
    }
  });

  it("each listed source is cited at least once", () => {
    for (const file of files) {
      const cited = new Set(citations(file).map((c) => c.citation.source));
      for (const source of file.sources) expect(cited.has(source.id), `${file.jurisdiction} ${source.id}`).toBe(true);
    }
  });

  it("carries an English translation whenever the source is not in English", () => {
    for (const { where, citation, file } of all) {
      const source = file.sources.find((s) => s.id === citation.source)!;
      if (source.language !== "en") expect(citation.translation, where).toBeTruthy();
    }
  });

  it(`quotes at most ${MAX_QUOTE_WORDS} words`, () => {
    for (const { where, citation } of all) expect(wordCount(citation.quote), where).toBeLessThanOrEqual(MAX_QUOTE_WORDS);
  });
});

describe("sources", () => {
  it("have unique ids within a file", () => {
    for (const file of files) {
      const ids = file.sources.map((s) => s.id);
      expect(new Set(ids).size, file.jurisdiction).toBe(ids.length);
    }
  });

  it(`were retrieved within the last ${MAX_AGE_DAYS} days and not in the future`, () => {
    const now = Date.now();
    for (const file of files) {
      for (const source of file.sources) {
        const age = (now - Date.parse(source.retrievedAt)) / 86_400_000;
        expect(age, `${file.jurisdiction} ${source.id}`).toBeGreaterThanOrEqual(-1);
        expect(age, `${file.jurisdiction} ${source.id} is stale: run npm run verify-sources and update retrievedAt`).toBeLessThanOrEqual(MAX_AGE_DAYS);
      }
    }
  });

  it("are official: EUR-Lex, the Commission, national gazettes and statute sites, or the authority itself", () => {
    const official = /^https:\/\/(eur-lex\.europa\.eu|single-market-economy\.ec\.europa\.eu|www\.riksdagen\.se|www\.gesetze-im-internet\.de|www\.bgbl\.de|www\.boe\.es|www\.mlbf-barrierefrei\.de)\//;
    for (const file of files) for (const s of file.sources) expect(s.url, `${file.jurisdiction} ${s.id}`).toMatch(official);
  });
});

describe("jurisdictions", () => {
  it("are the EU and EU member states only", () => {
    // The EAA is an EU directive. A UK or Norwegian law filed under it would be
    // a category error, however similar the obligations look.
    for (const file of files) expect(file.jurisdiction).toMatch(/^(EU|[A-Z]{2})$/);
    expect(PUBLISHED).not.toContain("GB");
    expect(PUBLISHED).not.toContain("NO");
  });

  it("each file is named for the jurisdiction it declares", () => {
    for (const code of PUBLISHED) expect(getJurisdiction(code.toLowerCase()).jurisdiction).toBe(code);
  });

  it("all apply the directive from 28 June 2025", () => {
    for (const file of files) expect(file.claims.applicationDate.value.date, file.jurisdiction).toBe("2025-06-28");
  });
});

describe("harmonisation", () => {
  it("is recorded once, at EU level", () => {
    expect(dataset.EU.harmonisation).toBeDefined();
    for (const file of files.filter((f) => f.jurisdiction !== "EU")) expect(file.harmonisation, file.jurisdiction).toBeUndefined();
  });

  it("is cited only with evidence from the Official Journal mechanism", () => {
    // If someone flips the status to "cited", they must also add the
    // Commission implementing decision as a legislation source.
    const eu = dataset.EU;
    if (eu.harmonisation?.status === "cited") {
      const kinds = eu.harmonisation.citations.map((c) => eu.sources.find((s) => s.id === c.source)?.kind);
      expect(kinds).toContain("legislation");
    }
  });

  it("is never supported by a Web Accessibility Directive citation alone", () => {
    const eu = dataset.EU;
    const quotes = eu.harmonisation!.citations.map((c) => c.quote).join(" ");
    if (/2016\/2102/.test(quotes)) expect(eu.harmonisation!.status).not.toBe("cited");
  });

  it("member states with no version in their own law take the EU answer, with EU citations", () => {
    for (const code of ["SE", "DE", "ES"]) {
      const resolved = harmonisationFor(code);
      expect(resolved.basis, code).toBe("eu");
      expect(resolved.status, code).toBe(dataset.EU.harmonisation!.status);
      for (const c of resolved.citations) expect(c.jurisdiction).toBe("EU");
    }
  });

  it("a member state whose law names a version becomes national_only, citing its own law", () => {
    const se = structuredClone(dataset.SE);
    se.claims.presumptionOfConformity.value.namesEn301549Version = "EN 301 549 v3.2.1";
    const resolved = resolveHarmonisation(se, dataset.EU);
    expect(resolved).toMatchObject({ status: "national_only", basis: "national-law", enVersion: "EN 301 549 v3.2.1" });
    for (const c of resolved.citations) expect(c.jurisdiction).toBe("SE");
  });

  it("the EU file never resolves to national_only", () => {
    const eu = structuredClone(dataset.EU);
    eu.claims.presumptionOfConformity.value.namesEn301549Version = "EN 301 549 v3.2.1";
    expect(resolveHarmonisation(eu, eu).status).not.toBe("national_only");
  });
});
