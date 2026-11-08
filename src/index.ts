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
// The pure clause 9 mapping only. The scanner, which loads Playwright, is the
// `eaa-cite/scan/browser` entry, so importing the dataset never loads a browser library.
export { mapToClauses, type AxeRun, type ClauseReport } from "./scan/map.js";
