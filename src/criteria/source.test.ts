import { describe, expect, it } from "vitest";
import {
  buildCriteria,
  parseCriteriaFile,
  parseWcagCriteria,
  parseWebClauses,
  type WcagCriterion,
} from "./source.js";
import { readData } from "../dataPath.js";

const SENTENCE = "Where ICT is a web page, it shall satisfy WCAG 2.1 Success Criterion";

/** Pages shaped like the pdfjs output for EN 301 549 V3.2.1, running header included. */
const pages = [
  ["9 Web .......................................... 45"],
  [
    "ETSI CEN CENELEC",
    "45 ",
    "EN 301 549 V3.2.1 (2021-03)",
    "9 Web",
    "9.1 Perceivable",
    "9.1.2 Time-based media",
    "9.1.2.3 Audio description or media alternative (pre-recorded)",
    `${SENTENCE} 1.2.3 Audio Description or Media Alternative`,
  ],
  [
    "ETSI CEN CENELEC",
    "46 ",
    "EN 301 549 V3.2.1 (2021-03)",
    "(Prerecorded).",
    "9.1.4.6 Void",
    "9.4.1.3 Status messages",
    `${SENTENCE} 4.1.3 Status Messages.`,
    "9.5 WCAG 2.1 AAA Success Criteria",
    "1 Time-based media 1.2.6 Sign Language (Prerecorded)",
  ],
];

describe("parseWebClauses", () => {
  it("reads clause 9.1 to 9.4, skipping voids and joining lines across a page break", () => {
    expect(parseWebClauses(pages)).toEqual([
      {
        enClause: "9.1.2.3",
        title: "Audio description or media alternative (pre-recorded)",
        wcagRef: "1.2.3",
        requirement: `${SENTENCE} 1.2.3 Audio Description or Media Alternative (Prerecorded).`,
        page: 2,
      },
      {
        enClause: "9.4.1.3",
        title: "Status messages",
        wcagRef: "4.1.3",
        requirement: `${SENTENCE} 4.1.3 Status Messages.`,
        page: 3,
      },
    ]);
  });

  it("refuses a clause whose number does not correspond to the criterion it names", () => {
    const wrong = [["9 Web", "9.1.1.1 Non-text content", `${SENTENCE} 1.1.2 Something.`, "9.5 AAA"]];
    expect(() => parseWebClauses(wrong)).toThrow(/9\.1\.1\.1 names WCAG 1\.1\.2/);
  });

  it("refuses a clause with no requirement sentence", () => {
    expect(() => parseWebClauses([["9 Web", "9.1.1.1 Non-text content", "9.5 AAA"]])).toThrow(
      /no WCAG 2\.1 requirement sentence/,
    );
  });
});

describe("parseWcagCriteria", () => {
  const section = (id: string, ref: string, name: string, level: string): string =>
    `<section id="${id}" class="guideline"><div class="header-wrapper"><h4 id="x"><bdi class="secno">` +
    `Success Criterion ${ref} </bdi>${name}</h4></div>\n<div class="doclinks"></div>` +
    `<p class="conformance-level">(Level ${level})</p><p>text</p></section>`;

  it("takes each criterion's anchor and the level that follows its heading", () => {
    const html =
      section("non-text-content", "1.1.1", "Non-text Content", "A") +
      section("contrast-minimum", "1.4.3", "Contrast (Minimum)", "AA");
    expect([...parseWcagCriteria(html).values()]).toEqual([
      { wcagRef: "1.1.1", name: "Non-text Content", level: "A", anchor: "non-text-content" },
      { wcagRef: "1.4.3", name: "Contrast (Minimum)", level: "AA", anchor: "contrast-minimum" },
    ]);
  });

  it("does not borrow the next criterion's level", () => {
    const html =
      `<section id="a" class="guideline"><h4><bdi class="secno">Success Criterion 1.1.1 </bdi>A</h4></section>` +
      section("b", "1.1.2", "B", "AA");
    expect(() => parseWcagCriteria(html)).toThrow(/1\.1\.1 has no conformance level/);
  });
});

describe("buildCriteria", () => {
  const clause = { enClause: "9.1.4.3", title: "Contrast (minimum)", wcagRef: "1.4.3", requirement: "r", page: 46 };
  const wcag = (level: WcagCriterion["level"]): Map<string, WcagCriterion> =>
    new Map([["1.4.3", { wcagRef: "1.4.3", name: "Contrast (Minimum)", level, anchor: "contrast-minimum" }]]);

  it("takes the clause from the EN and the name, level and anchor from W3C", () => {
    expect(buildCriteria([clause], wcag("AA"), "https://www.w3.org/TR/WCAG21/")).toEqual([
      {
        enClause: "9.1.4.3",
        wcagRef: "1.4.3",
        level: "AA",
        name: "Contrast (Minimum)",
        wcagUrl: "https://www.w3.org/TR/WCAG21/#contrast-minimum",
        enPage: 46,
      },
    ]);
  });

  it("does not carry the EN requirement sentence into the published row", () => {
    const [row] = buildCriteria([clause], wcag("AA"), "https://www.w3.org/TR/WCAG21/");
    expect(Object.values(row!)).not.toContain(clause.requirement);
  });

  it("refuses a criterion W3C does not list, and one at level AAA", () => {
    expect(() => buildCriteria([clause], new Map(), "u")).toThrow(/not in u/);
    expect(() => buildCriteria([clause], wcag("AAA"), "u")).toThrow(/level AAA/);
  });
});

describe("the checked-in EN 301 549 v3.2.1 criteria", () => {
  const file = parseCriteriaFile(readData("en-301-549-v3.2.1-clause9.json"));

  it("is the WCAG 2.1 A and AA set: 30 at A, 20 at AA", () => {
    expect(file.criteria).toHaveLength(50);
    expect(file.criteria.filter((c) => c.level === "A")).toHaveLength(30);
    expect(file.criteria.filter((c) => c.level === "AA")).toHaveLength(20);
  });

  it("numbers every clause as 9 followed by its WCAG criterion, once each", () => {
    for (const c of file.criteria) expect(c.enClause).toBe(`9.${c.wcagRef}`);
    expect(new Set(file.criteria.map((c) => c.enClause)).size).toBe(file.criteria.length);
  });

  it("was extracted from the ETSI V3.2.1 PDF and the WCAG 2.1 Recommendation", () => {
    expect(file.enVersion).toBe("EN 301 549 v3.2.1");
    expect(file.wcagVersion).toBe("WCAG 2.1 AA");
    expect(file.sources.en.url).toMatch(/\/03\.02\.01_60\/en_301549v030201p\.pdf$/);
    expect(file.sources.en.bytes).toBe(2285361);
    for (const c of file.criteria) expect(c.wcagUrl.startsWith("https://www.w3.org/TR/WCAG21/#")).toBe(true);
  });
});
