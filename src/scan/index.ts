/**
 * The `eaa-cite/scan` entry: reading axe tags and mapping an axe result onto
 * clause 9. Pure, no Playwright. The browser-owning scanner is
 * `eaa-cite/scan/browser` (./browser.ts).
 */
export { wcagRefsFromTags } from "./axeTags.js";
export { mapToClauses, type AxeRun, type AxeRuleResult, type ClauseReport, type CriterionHits, type Impact, type RuleHit } from "./map.js";
