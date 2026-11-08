import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scanUrl } from "../src/scan/browser.js";
import { mapToClauses } from "../src/scan/map.js";
import { compare, loadExpected, serveShop } from "./testShop.js";

/**
 * The test shop in examples/test-shop, served over real HTTP and scanned with
 * scanUrl. Each page's planted defects are listed in expected.json; a scan must
 * find every one under the right EN clause, find nothing else, and never claim
 * a defect axe has no rule for.
 */

const pages = await loadExpected();
let shop: Awaited<ReturnType<typeof serveShop>>;
let browser: Browser;

beforeAll(async () => {
  [shop, browser] = await Promise.all([serveShop(), chromium.launch()]);
});
afterAll(async () => {
  await Promise.all([shop?.close(), browser?.close()]);
});

describe.each(pages)("$path ($template)", (page) => {
  it("matches expected.json", async () => {
    const result = compare(page, mapToClauses(await scanUrl(`${shop.origin}/${page.path}`, { browser })));
    expect(result.expectedRules.filter((r) => !r.found), "planted defects not found").toEqual([]);
    expect(result.unexpected, "failures nobody planted").toEqual([]);
    expect(result.needsReview.filter((r) => !r.found), "expected needs-review missing").toEqual([]);
    expect(result.notDetectable.filter((d) => d.wronglyFailing), "undetectable defects reported as failing").toEqual([]);
    for (const d of result.notDetectable) expect(d.reportedAsNotChecked, `${d.wcagRef} should be listed as not checked by axe`).toBe(true);
  });
});
