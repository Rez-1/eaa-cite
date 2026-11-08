import { readFile } from "node:fs/promises";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertScannableUrl, scanHtml } from "../src/scan/browser.js";
import { mapToClauses } from "../src/scan/map.js";

/**
 * Real Chromium, real axe, local fixtures with defects planted on purpose. No
 * network: the fixtures are loaded with setContent and the context is offline.
 */

const fixture = (name: string): Promise<string> =>
  readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

describe("scanning the fixture with planted defects", () => {
  it("reports each planted defect under its EN clause", async () => {
    const report = mapToClauses(await scanHtml(await fixture("shop-with-defects.html"), { browser }));
    const failing = Object.fromEntries(report.failing.map((c) => [c.enClause, c.rules.map((r) => r.ruleId)]));

    expect(failing["9.1.1.1"]).toContain("image-alt");
    expect(failing["9.1.4.3"]).toContain("color-contrast");
    expect(failing["9.3.1.1"]).toContain("html-has-lang");
    expect(failing["9.4.1.2"]).toEqual(expect.arrayContaining(["label", "button-name"]));
  });
});

describe("scanning the clean fixture", () => {
  it("finds nothing failing in clause 9", async () => {
    const report = mapToClauses(await scanHtml(await fixture("shop-clean.html"), { browser }));
    expect(report.failing).toEqual([]);
  });

  it("still lists the criteria axe could not check", async () => {
    const report = mapToClauses(await scanHtml(await fixture("shop-clean.html"), { browser }));
    // A clean axe run is not a clean audit: most criteria need a person.
    expect(report.notCheckedByAxe.length).toBeGreaterThan(20);
    expect(report.notCheckedByAxe.map((c) => c.wcagRef)).toContain("1.2.2");
  });
});

describe("assertScannableUrl", () => {
  it("allows http, https and localhost", () => {
    expect(assertScannableUrl("http://localhost:3000/cart").host).toBe("localhost:3000");
    expect(assertScannableUrl("https://shop.test/").protocol).toBe("https:");
  });

  it("refuses schemes that would read the disk or run script", () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,<p>", "not a url"]) {
      expect(() => assertScannableUrl(url)).toThrow(/Only http and https/);
    }
  });
});
