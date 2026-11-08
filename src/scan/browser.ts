/**
 * The `eaa-cite/scan/browser` entry: the scanner that owns Chromium. This is
 * the only package entry that loads Playwright.
 */
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
