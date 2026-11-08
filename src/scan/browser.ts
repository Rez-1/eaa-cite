import { AxeBuilder } from "@axe-core/playwright";
import { chromium, type Browser } from "playwright";
import type { AxeRun } from "./map.js";

/** axe tags for WCAG 2.1 A and AA, the level EN 301 549 v3.2.1 clause 9 requires. */
export const WCAG21_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

export class UnsupportedUrlError extends Error {
  constructor(url: string) {
    super(`Only http and https URLs can be scanned, got ${JSON.stringify(url)}`);
    this.name = "UnsupportedUrlError";
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

export type ScanOptions = {
  /** Milliseconds to wait for the page to load. */
  timeoutMs?: number;
  /** Reuse a running browser instead of launching one per scan. */
  browser?: Browser;
};

async function withBrowser<T>(options: ScanOptions, run: (browser: Browser) => Promise<T>): Promise<T> {
  if (options.browser) return run(options.browser);
  const browser = await chromium.launch();
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

/** Loads a URL in headless Chromium and runs axe with the WCAG 2.1 AA tags. */
export async function scanUrl(raw: string, options: ScanOptions = {}): Promise<AxeRun> {
  const url = assertScannableUrl(raw);
  return withBrowser(options, async (browser) => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(url.href, { waitUntil: "load", timeout: options.timeoutMs ?? 30_000 });
      return await new AxeBuilder({ page }).withTags([...WCAG21_AA_TAGS]).analyze();
    } finally {
      await context.close();
    }
  });
}

/**
 * Runs axe against an HTML string. Every network request the markup makes is
 * aborted, so a pasted page cannot call out, and the fixture tests need no
 * network. Script stays enabled because axe itself runs as page script.
 */
export async function scanHtml(html: string, options: ScanOptions = {}): Promise<AxeRun> {
  return withBrowser(options, async (browser) => {
    const context = await browser.newContext();
    await context.route("**/*", (route) => route.abort());
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: options.timeoutMs ?? 30_000 });
      const result = await new AxeBuilder({ page }).withTags([...WCAG21_AA_TAGS]).analyze();
      return { ...result, url: "about:blank (inline HTML)" };
    } finally {
      await context.close();
    }
  });
}
