/**
 * The `eaa-cite/scan` entry: the browser-owning scanner and the pure clause 9
 * mapping. Importing this loads Playwright; the package root does not, so a
 * caller that only wants the dataset never pays for it.
 */
export { wcagRefsFromTags } from "./axeTags.js";
export { mapToClauses, type AxeRun, type AxeRuleResult, type ClauseReport, type CriterionHits, type Impact, type RuleHit } from "./map.js";
export {
  createScanner,
  assertScannableUrl,
  SCAN_CAVEAT,
  SCAN_TAGS,
  WCAG21_AA_TAGS,
  BlockedNavigationError,
  UnsupportedUrlError,
  type BrowserScanner,
  type Scanner,
  type ScannerOptions,
  type ScanReport,
} from "./scanner.js";
export { DocumentFetchError, DocumentTooLargeError, MAX_DOCUMENT_BYTES } from "./fetchDocument.js";
