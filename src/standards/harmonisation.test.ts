import { describe, expect, it } from "vitest";
import { conformanceStatement, HARMONISATION_STATUSES, parseHarmonisationStatus } from "./harmonisation.js";

const es = { enVersion: "EN 301 549 v3.2.1", wcagVersion: "WCAG 2.1 AA", memberState: "ES" };

describe("parseHarmonisationStatus", () => {
  it("accepts the three values", () => {
    for (const status of HARMONISATION_STATUSES) expect(parseHarmonisationStatus(status)).toBe(status);
  });

  it("rejects the word people actually reach for", () => {
    // "harmonised" is the WAD answer typed into an EAA field.
    expect(() => parseHarmonisationStatus("harmonised")).toThrow(/Unknown harmonisation status "harmonised"/);
    expect(() => parseHarmonisationStatus(undefined)).toThrow(/null/);
  });
});

describe("a version cited under the EAA", () => {
  it("claims the presumption of conformity", () => {
    const statement = conformanceStatement({ ...es, status: "cited" });
    expect(statement.mayClaimPresumptionOfConformity).toBe(true);
    expect(statement.sentence).toBe(
      "The site was assessed against EN 301 549 v3.2.1 (WCAG 2.1 AA), " +
        "the harmonised standard cited in the Official Journal of the European Union " +
        "under Directive (EU) 2019/882. Conformity with that standard carries a " +
        "presumption of conformity with the accessibility requirements it covers.",
    );
  });
});

describe("no version cited under the EAA", () => {
  it("treats the standard as a benchmark and claims nothing", () => {
    const statement = conformanceStatement({ ...es, status: "not_cited" });
    expect(statement.mayClaimPresumptionOfConformity).toBe(false);
    expect(statement.sentence).toBe(
      "The site was assessed against EN 301 549 v3.2.1 (WCAG 2.1 AA) as a " +
        "technical benchmark. No version of EN 301 549 is currently cited in the " +
        "Official Journal of the European Union under Directive (EU) 2019/882, so no " +
        "presumption of conformity is available through a harmonised standard, to this " +
        "site or to any other.",
    );
  });

  it("never calls the standard harmonised", () => {
    // v3.2.1 is cited under the Web Accessibility Directive. Carrying that
    // answer into an EAA statement is the mistake this guards against.
    expect(conformanceStatement({ ...es, status: "not_cited" }).sentence).not.toMatch(/harmonised standard cited/);
  });
});

describe("a version named in national law", () => {
  it("says the version governs without claiming the presumption", () => {
    const statement = conformanceStatement({ ...es, memberState: "DE", status: "national_only" });
    expect(statement.mayClaimPresumptionOfConformity).toBe(false);
    expect(statement.sentence).toContain("DE national law");
    expect(statement.sentence).not.toContain("ES");
  });
});

describe("every status", () => {
  it("names the standard actually assessed against", () => {
    for (const status of HARMONISATION_STATUSES) {
      expect(conformanceStatement({ ...es, status }).sentence).toContain("EN 301 549 v3.2.1 (WCAG 2.1 AA)");
    }
  });

  it("allows the presumption claim only when cited", () => {
    const claiming = HARMONISATION_STATUSES.filter(
      (status) => conformanceStatement({ ...es, status }).mayClaimPresumptionOfConformity,
    );
    expect(claiming).toEqual(["cited"]);
  });
});
