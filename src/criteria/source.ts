/**
 * Parsers that turn the two primary sources into the clause 9 table: the text
 * of EN 301 549 clause 9 (web) and the WCAG Recommendation's HTML. Pure, so the
 * extraction is testable without the PDF.
 *
 * The EN clause is the legally operative reference, so the clause numbers and
 * the pairing of each clause with a WCAG criterion come from the EN text. The
 * EN names the criterion but not its level or anchor, so those come from W3C.
 * Nothing comes from memory: any disagreement between the two sources throws
 * rather than being resolved.
 *
 * The published table carries clause numbers, WCAG names and links, and the
 * PDF page. It does not copy ETSI's requirement sentences: they are read here
 * to prove the pairing, then dropped (ADR 0005).
 */

import { z } from "zod";

/** One non-void clause 9 requirement, as printed in the EN. */
export type WebClause = {
  /** e.g. "9.1.1.1" */
  enClause: string;
  /** The EN's own heading, e.g. "Non-text content". */
  title: string;
  /** The WCAG success criterion the requirement names, e.g. "1.1.1". */
  wcagRef: string;
  /** The requirement sentence, verbatim with line wraps joined. */
  requirement: string;
  /** 1-based page of the PDF the clause heading is on. */
  page: number;
};

/** One success criterion from the WCAG Recommendation. */
export type WcagCriterion = {
  wcagRef: string;
  name: string;
  level: "A" | "AA" | "AAA";
  /** Section id, e.g. "non-text-content". */
  anchor: string;
};

/** One row of the published clause 9 table. */
export type Criterion = {
  enClause: string;
  wcagRef: string;
  level: "A" | "AA";
  /** The W3C name of the success criterion, e.g. "Non-text Content". */
  name: string;
  /** The criterion's section in the WCAG Recommendation. */
  wcagUrl: string;
  /** 1-based page of the EN PDF the clause heading is on. */
  enPage: number;
};

const CLAUSE_HEADING = /^(9\.\d+\.\d+\.\d+) (.+)$/;
/** Any clause 9 heading, including groupings like "9.1.2 Time-based media". */
const ANY_HEADING = /^9(\.\d+)+ \S/;
const REQUIREMENT = /shall satisfy WCAG 2\.1 Success Criterion (\d+\.\d+\.\d+) /;
/** The ETSI running header printed at the top of every page. */
const RUNNING_HEADER = [/^ETSI CEN CENELEC$/, /^\d+$/, /^EN 301 549 V\d+\.\d+\.\d+ \(\d{4}-\d{2}\)$/];

/**
 * Clauses 9.1 to 9.4 from the EN's text, one array of lines per page. Starts at
 * the "9 Web" heading (the table of contents entry has dot leaders, so it does
 * not match) and stops at "9.5", where the AAA table begins.
 */
export function parseWebClauses(pages: readonly (readonly string[])[]): WebClause[] {
  const lines: { text: string; page: number }[] = [];
  pages.forEach((pageLines, index) => {
    for (const raw of pageLines) {
      const text = raw.trim();
      if (text && !RUNNING_HEADER.some((re) => re.test(text))) lines.push({ text, page: index + 1 });
    }
  });

  const start = lines.findIndex((l) => l.text === "9 Web");
  if (start === -1) throw new Error('No "9 Web" heading found');
  const end = lines.findIndex((l, i) => i > start && /^9\.5 /.test(l.text));
  if (end === -1) throw new Error('No "9.5" heading found after "9 Web"');

  const clauses: WebClause[] = [];
  for (let i = start; i < end; i++) {
    const line = lines[i]!;
    const heading = CLAUSE_HEADING.exec(line.text);
    if (!heading) continue;
    const [, enClause, title] = heading as unknown as [string, string, string];
    if (title === "Void") continue;

    const body: string[] = [];
    for (let j = i + 1; j < end && !ANY_HEADING.test(lines[j]!.text); j++) body.push(lines[j]!.text);
    const requirement = body.join(" ");

    const named = REQUIREMENT.exec(requirement);
    if (!named) throw new Error(`Clause ${enClause} has no WCAG 2.1 requirement sentence: ${JSON.stringify(requirement)}`);
    const wcagRef = named[1]!;
    if (enClause !== `9.${wcagRef}`) {
      throw new Error(`Clause ${enClause} names WCAG ${wcagRef}; the numbering should correspond`);
    }

    clauses.push({ enClause, title, wcagRef, requirement, page: line.page });
  }
  return clauses;
}

/**
 * Success criteria from the WCAG Recommendation's HTML. Each is a section whose
 * heading reads "Success Criterion 1.1.1 Name", followed by its conformance
 * level. Relies on the published markup, so a count check in the caller is what
 * catches a markup change.
 */
export function parseWcagCriteria(html: string): Map<string, WcagCriterion> {
  const section =
    /<section id="([^"]+)" class="guideline">.*?Success Criterion (\d+\.\d+\.\d+) <\/bdi>(.*?)<\/h4>/gs;
  const levelPattern = /<p class="conformance-level">\(Level (A|AA|AAA)\)<\/p>/;

  const found = new Map<string, WcagCriterion>();
  for (const match of html.matchAll(section)) {
    const [, anchor, wcagRef, name] = match as unknown as [string, string, string, string];
    const rest = html.slice(match.index! + match[0].length);
    const next = rest.search(/<section id="[^"]+" class="guideline">/);
    const level = levelPattern.exec(next === -1 ? rest : rest.slice(0, next));
    if (!level) throw new Error(`WCAG ${wcagRef} has no conformance level`);
    found.set(wcagRef, { wcagRef, name: name.trim(), level: level[1] as WcagCriterion["level"], anchor });
  }
  return found;
}

/**
 * Join the EN clauses to the WCAG criteria they name. Throws if a clause names a
 * criterion W3C does not have, or one that is not level A or AA. Clause 9.1 to
 * 9.4 is exactly the A and AA set, so either would mean a parse went wrong.
 */
export function buildCriteria(
  clauses: readonly WebClause[],
  wcag: ReadonlyMap<string, WcagCriterion>,
  wcagUrl: string,
): Criterion[] {
  return clauses.map((clause) => {
    const criterion = wcag.get(clause.wcagRef);
    if (!criterion) throw new Error(`Clause ${clause.enClause} names WCAG ${clause.wcagRef}, not in ${wcagUrl}`);
    if (criterion.level === "AAA") {
      throw new Error(`Clause ${clause.enClause} names WCAG ${clause.wcagRef}, which is level AAA`);
    }
    return {
      enClause: clause.enClause,
      wcagRef: clause.wcagRef,
      level: criterion.level,
      name: criterion.name,
      wcagUrl: `${wcagUrl}#${criterion.anchor}`,
      enPage: clause.page,
    };
  });
}

const documentSchema = z.object({
  url: z.url(),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * The checked-in clause 9 table plus the exact bytes it was extracted from.
 * Written by `scripts/build-criteria.ts` and validated on load, because a hand
 * edit is the way a wrong clause would get in.
 */
const criteriaFileSchema = z.object({
  enVersion: z.string().min(1),
  wcagVersion: z.string().min(1),
  sources: z.object({
    en: documentSchema.extend({ pages: z.number().int().positive() }),
    wcag: documentSchema,
  }),
  extractedAt: z.iso.datetime(),
  criteria: z
    .array(
      z.object({
        enClause: z.string().regex(/^9\.\d+\.\d+\.\d+$/),
        wcagRef: z.string().regex(/^\d+\.\d+\.\d+$/),
        level: z.enum(["A", "AA"]),
        name: z.string().min(1),
        wcagUrl: z.url(),
        enPage: z.number().int().positive(),
      }),
    )
    .min(1),
});

export type CriteriaFile = z.infer<typeof criteriaFileSchema>;

export function parseCriteriaFile(json: unknown): CriteriaFile {
  return criteriaFileSchema.parse(json);
}
