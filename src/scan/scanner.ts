import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mapToClauses, type ClauseReport } from "./map.js";
import { isPrivateHost } from "./privateHost.js";

/**
 * Scans a page with axe-core and returns the EN 301 549 clause 9 report. The
 * module owns the browser: it launches Chromium on first use, launches again
 * after a failed launch or a crash, and closes it on `close()`. Callers never
 * see Playwright.
 */

/** axe tags for WCAG 2.1 A and AA, the level EN 301 549 v3.2.1 clause 9 requires. */
export const WCAG21_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

/** What a scan result means and does not mean; carried on every report (ADR 0004). */
export const SCAN_CAVEAT =
  "axe-core checks a subset of WCAG automatically. `failing` lists defects it found. " +
  "`notCheckedByAxe` lists clause 9 criteria no axe rule touched: they need a person. " +
  "There is deliberately no `passed` list, because an axe pass is not an evaluation of the criterion.";

export type ScanReport = ClauseReport & { caveat: string };

/** The seam the MCP server depends on. Tests pass a fake that returns a fixed report. */
export interface Scanner {
  scanUrl(url: string): Promise<ScanReport>;
  scanHtml(html: string): Promise<ScanReport>;
}

export interface BrowserScanner extends Scanner {
  close(): Promise<void>;
}

export type ScannerOptions = {
  /** Milliseconds to wait for each navigation. Default 30 s. */
  timeoutMs?: number;
  /** How to start Chromium. Injected in tests. */
  launch?: () => Promise<Browser>;
  /** The private-address check behind the redirect rule. Injected in tests. */
  isPrivateHost?: (hostname: string) => Promise<boolean>;
};

/** What the route handler decided about one main-frame navigation. */
type Navigation =
  | { kind: "loaded" }
  | { kind: "redirect"; to: URL }
  | { kind: "blocked"; url: string }
  | { kind: "failed"; error: unknown };

/** Most redirect chains are one or two hops; more than this is a loop or a trap. */
const MAX_REDIRECTS = 10;

export class UnsupportedUrlError extends Error {
  constructor(url: string) {
    super(`Only http and https URLs can be scanned, got ${JSON.stringify(url)}`);
    this.name = "UnsupportedUrlError";
  }
}

export class BlockedNavigationError extends Error {
  constructor(readonly url: string) {
    super(
      `Refused to load ${url}: it is a private network address, and the scan started at a public one. ` +
        `Start the scan at a private address (such as localhost) to scan private pages.`,
    );
    this.name = "BlockedNavigationError";
  }
}

/**
 * Parses and checks a URL before a browser goes near it. `file:`, `javascript:`
 * and `data:` would let a caller read the local disk or run script through the
 * scanner, so only http and https are allowed. Localhost is allowed: scanning a
 * dev server is the main use.
 */
export function assertScannableUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsupportedUrlError(raw);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UnsupportedUrlError(raw);
  return url;
}

export function createScanner(options: ScannerOptions = {}): BrowserScanner {
  const launch = options.launch ?? (() => chromium.launch());
  const privateHost = options.isPrivateHost ?? isPrivateHost;
  const timeout = options.timeoutMs ?? 30_000;

  let browser: Browser | null = null;
  let launching: Promise<Browser> | null = null;

  /** A connected browser. A failed launch is not remembered, so the next scan tries again. */
  async function connected(): Promise<Browser> {
    if (browser?.isConnected()) return browser;
    if (launching) return launching; // another scan is already starting one
    launching = launch();
    try {
      browser = await launching;
      return browser;
    } finally {
      launching = null;
    }
  }

  /** Opens a fresh context, lets `open` put a document in the page, runs axe, maps the result. */
  async function scan(open: (context: BrowserContext, page: Page) => Promise<string>): Promise<ScanReport> {
    const context = await (await connected()).newContext();
    try {
      const page = await context.newPage();
      const url = await open(context, page);
      const run = await new AxeBuilder({ page }).withTags([...WCAG21_AA_TAGS]).analyze();
      return { ...mapToClauses({ ...run, url }), caveat: SCAN_CAVEAT };
    } finally {
      await context.close();
    }
  }

  return {
    async scanUrl(raw) {
      const start = assertScannableUrl(raw);
      const startIsPrivate = await privateHost(start.hostname);
      const allowed = async (url: URL): Promise<boolean> => startIsPrivate || !(await privateHost(url.hostname));
      return scan((context, page) => openWithRedirectRule(context, page, start, allowed, timeout));
    },

    async scanHtml(html) {
      return scan(async (context, page) => {
        // Every request the markup makes is aborted, so pasted markup cannot
        // call out. Script stays enabled because axe itself runs as page script.
        await context.route("**/*", (route) => route.abort());
        await page.setContent(html, { waitUntil: "load", timeout });
        return "about:blank (inline HTML)";
      });
    },

    async close() {
      await launching?.catch(() => {}); // let a launch in progress finish, so its browser is closed too
      const open = browser;
      browser = null;
      await open?.close();
    },
  };
}

/**
 * Loads `start` in the page, following redirects hop by hop and refusing any
 * main-frame navigation `allowed` rejects. Returns the final URL.
 *
 * Playwright does not route the hops of a redirect the browser follows
 * itself. So the route handler fetches each main-frame navigation without
 * following redirects and records what happened; on a redirect it aborts, and
 * the loop below navigates to the next hop as a new, routed request.
 */
async function openWithRedirectRule(
  context: BrowserContext,
  page: Page,
  start: URL,
  allowed: (url: URL) => Promise<boolean>,
  timeout: number,
): Promise<string> {
  // Set by the route handler during page.goto; read through outcome() so
  // TypeScript does not narrow it to the value assigned before the await.
  let navigation: Navigation = { kind: "loaded" };
  const outcome = (): Navigation => navigation;

  await context.route("**/*", async (route) => {
    const request = route.request();
    if (!request.isNavigationRequest() || request.frame().parentFrame() !== null) return route.continue();
    const url = new URL(request.url());
    try {
      if (!(await allowed(url))) {
        navigation = { kind: "blocked", url: url.href };
        return await route.abort("blockedbyclient");
      }
      const response = await route.fetch({ maxRedirects: 0 });
      const location = response.status() >= 300 && response.status() < 400 ? response.headers()["location"] : undefined;
      if (location) {
        navigation = { kind: "redirect", to: new URL(location, url) };
        return await route.abort("aborted");
      }
      return await route.fulfill({ response });
    } catch (error) {
      // A refused connection, DNS failure or timeout. It must fail this scan,
      // not escape the handler and take the process down.
      navigation = { kind: "failed", error };
      await route.abort("failed").catch(() => {});
    }
  });

  let target = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    navigation = { kind: "loaded" };
    await page.goto(target.href, { waitUntil: "load", timeout }).catch((error: unknown) => {
      if (outcome().kind === "loaded") throw error;
    });
    const result = outcome();
    switch (result.kind) {
      case "loaded":
        return page.url();
      case "blocked":
        throw new BlockedNavigationError(result.url);
      case "failed":
        throw result.error;
      case "redirect":
        target = assertScannableUrl(result.to.href);
    }
  }
  throw new Error(`Stopped after ${MAX_REDIRECTS} redirects from ${start.href}`);
}
