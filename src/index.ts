export { criteria, criteriaFile, findCriterion, type Criterion } from "./criteria/index.js";
export {
  getJurisdiction,
  citationsOf,
  compareClaim,
  conformanceFor,
  VersionMismatchError,
  DEFAULT_EN_VERSION,
  DEFAULT_WCAG_VERSION,
  parseJurisdictionFile,
  isPublished,
  PUBLISHED,
  DatasetIntegrityError,
  UnknownJurisdictionError,
  type Published,
  type CitedJurisdiction,
  type CitedClaims,
  type CitationEntry,
  type CitationPlace,
  type ResolvedCitation,
  type ConformanceAnswer,
  type Assessed,
  type ClaimComparison,
  type JurisdictionFile,
  type Claims,
  type ClaimId,
  type Source,
} from "./dataset/index.js";
export { mapToClauses, type AxeRun, type ClauseReport } from "./scan/index.js";
export {
  createScanner,
  assertScannableUrl,
  SCAN_CAVEAT,
  BlockedNavigationError,
  UnsupportedUrlError,
  type BrowserScanner,
  type Scanner,
  type ScannerOptions,
  type ScanReport,
} from "./scan/scanner.js";
// The fixed sentences are reached through conformanceFor, which applies the
// version and EU/national rules first (ADR 0003); they are not exported here.
export { HARMONISATION_STATUSES, type HarmonisationStatus } from "./standards/harmonisation.js";
export { createServer } from "./mcp/server.js";
