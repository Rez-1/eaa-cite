/**
 * The scan module's pure parts: axe tag parsing and the clause 9 mapping. No
 * Playwright here, so importing this costs nothing; the browser-owning
 * scanner is in ./scanner.ts.
 */
export { wcagRefsFromTags } from "./axeTags.js";
export { mapToClauses, type AxeRun, type AxeRuleResult, type ClauseReport, type CriterionHits, type Impact, type RuleHit } from "./map.js";
