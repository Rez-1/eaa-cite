import { compareRefs, criteria as baseline, findCriterion, type Criterion } from "../criteria/index.js";
import { wcagRefsFromTags } from "./axeTags.js";

/**
 * Maps an axe-core result onto the EN 301 549 v3.2.1 clause 9 table. Pure, so it
 * is tested without a browser.
 *
 * The output keeps three things apart that are easy to blur:
 *
 * - `failing`: criteria where an axe rule found violations. These are findings.
 * - `needsReview`: criteria where axe could not decide. A person has to look.
 * - `notCheckedByAxe`: criteria no axe rule touched on this page. axe passing
 *   nothing and failing nothing is not evidence the criterion is met.
 *
 * There is no "passed" list on purpose: an axe pass on 1.3.1 means its rules
 * found nothing, not that the page's structure was evaluated (ADR 0004).
 */

export type Impact = "critical" | "serious" | "moderate" | "minor";

/** The parts of an axe result this module reads. */
export type AxeRuleResult = {
  id: string;
  impact?: Impact | null;
  tags: readonly string[];
  help: string;
  helpUrl: string;
  nodes: readonly { target: readonly unknown[] }[];
};

export type AxeRun = {
  url: string;
  testEngine?: { name: string; version: string };
  violations: readonly AxeRuleResult[];
  incomplete: readonly AxeRuleResult[];
  passes: readonly AxeRuleResult[];
};

export type RuleHit = {
  ruleId: string;
  help: string;
  helpUrl: string;
  impact: Impact;
  instances: number;
  /** Selector of the first instance, for finding it in devtools. */
  firstTarget: string;
};

export type CriterionHits = {
  enClause: string;
  wcagRef: string;
  level: "A" | "AA";
  name: string;
  wcagUrl: string;
  rules: RuleHit[];
};

export type ClauseReport = {
  url: string;
  axeVersion: string | null;
  failing: CriterionHits[];
  needsReview: CriterionHits[];
  notCheckedByAxe: Pick<Criterion, "enClause" | "wcagRef" | "name">[];
  /**
   * axe rules that failed but name no clause 9 criterion: best-practice rules,
   * AAA, or WCAG 2.2 additions. Reported so nothing axe said disappears.
   */
  outsideClause9: RuleHit[];
  summary: { failing: number; needsReview: number; notCheckedByAxe: number; ofCriteria: number };
};

/**
 * A selector is built from the page's own ids and classes, so a hostile page
 * controls its text. Long enough to find the element, short enough that it
 * cannot carry a paragraph of instructions to an assistant reading the report.
 */
const MAX_TARGET_CHARS = 120;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const IMPACT_ORDER: Record<Impact, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function hitOf(rule: AxeRuleResult): RuleHit {
  const first = rule.nodes[0]?.target ?? [];
  return {
    ruleId: rule.id,
    help: rule.help,
    helpUrl: rule.helpUrl,
    impact: rule.impact ?? "minor",
    instances: rule.nodes.length,
    firstTarget: truncate(first.map((part) => (Array.isArray(part) ? part.join(" >>> ") : String(part))).join(" "), MAX_TARGET_CHARS),
  };
}

const byImpact = (a: RuleHit, b: RuleHit): number =>
  IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || b.instances - a.instances || a.ruleId.localeCompare(b.ruleId);

function group(rules: readonly AxeRuleResult[], outside: RuleHit[] | null): CriterionHits[] {
  const out = new Map<string, CriterionHits>();
  for (const rule of rules) {
    if (rule.nodes.length === 0) continue;
    const hit = hitOf(rule);
    const matched = wcagRefsFromTags(rule.tags)
      .map((ref) => findCriterion(ref))
      .filter((c): c is Criterion => c !== undefined);
    if (matched.length === 0) {
      outside?.push(hit);
      continue;
    }
    for (const c of matched) {
      const entry = out.get(c.wcagRef) ?? {
        enClause: c.enClause,
        wcagRef: c.wcagRef,
        level: c.level,
        name: c.name,
        wcagUrl: c.wcagUrl,
        rules: [],
      };
      entry.rules.push(hit);
      out.set(c.wcagRef, entry);
    }
  }
  return [...out.values()]
    .map((entry) => ({ ...entry, rules: entry.rules.sort(byImpact) }))
    .sort((a, b) => compareRefs(a.wcagRef, b.wcagRef));
}

export function mapToClauses(run: AxeRun): ClauseReport {
  const outsideClause9: RuleHit[] = [];
  const failing = group(run.violations, outsideClause9);
  const needsReview = group(run.incomplete, null);

  const touched = new Set(
    [...run.violations, ...run.incomplete, ...run.passes].flatMap((rule) => wcagRefsFromTags(rule.tags)),
  );
  const notCheckedByAxe = baseline
    .filter((c) => !touched.has(c.wcagRef))
    .map(({ enClause, wcagRef, name }) => ({ enClause, wcagRef, name }));

  return {
    url: run.url,
    axeVersion: run.testEngine?.version ?? null,
    failing,
    needsReview,
    notCheckedByAxe,
    outsideClause9: outsideClause9.sort(byImpact),
    summary: {
      failing: failing.length,
      needsReview: needsReview.length,
      notCheckedByAxe: notCheckedByAxe.length,
      ofCriteria: baseline.length,
    },
  };
}
