import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createScanner } from "../src/scan/scanner.js";
import { readFile } from "node:fs/promises";
import { compare, loadExpected, plantedIn, serveShop, SHOP_DIR } from "./testShop.js";

/**
 * The test shop in examples/test-shop, served over real HTTP and scanned with
 * the scanner. Each page's planted defects are listed in expected.json; a scan must
 * find every one under the right EN clause, find nothing else, and never claim
 * a defect axe has no rule for.
 */

const pages = await loadExpected();
let shop: Awaited<ReturnType<typeof serveShop>>;
const scanner = createScanner();

beforeAll(async () => {
  shop = await serveShop();
});
afterAll(async () => {
  await Promise.all([shop?.close(), scanner.close()]);
});

describe.each(pages)("$path ($template)", (page) => {
  it("expected.json records exactly what the page's PLANTED comments declare", async () => {
    const planted = plantedIn(await readFile(new URL(page.path, SHOP_DIR), "utf8"));
    expect(page.failing).toEqual(planted.failing);
    expect([...page.needsReview].sort()).toEqual([...planted.needsReview].sort());
    expect(page.notDetectable.map((d) => d.wcagRef).sort()).toEqual([...planted.notDetectable].sort());
  });

  it("matches expected.json", async () => {
    const result = compare(page, await scanner.scanUrl(`${shop.origin}/${page.path}`));
    expect(result.expectedRules.filter((r) => !r.found), "planted defects not found").toEqual([]);
    expect(result.unexpected, "failures nobody planted").toEqual([]);
    expect(result.needsReview.filter((r) => !r.found), "expected needs-review missing").toEqual([]);
    expect([...result.extraNeedsReview].sort(), "needs-review nobody planted or recorded").toEqual([...page.needsReviewUnplanted].sort());
    expect(result.notDetectable.filter((d) => d.wronglyFailing), "undetectable defects reported as failing").toEqual([]);
    for (const d of result.notDetectable) expect(d.reportedAsNotChecked, `${d.wcagRef} should be listed as not checked by axe`).toBe(true);
  });
});
