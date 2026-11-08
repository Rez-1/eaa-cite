import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";
import type { ClauseReport } from "../src/scan/map.js";

/**
 * Shared by test/test-shop.test.ts and scripts/try-test-shop.ts: serves
 * examples/test-shop over real HTTP on 127.0.0.1, and compares a scan against
 * the page's entry in expected.json.
 */

export const SHOP_DIR = new URL("../examples/test-shop/", import.meta.url);

export type Expected = {
  path: string;
  template: string;
  failing: Record<string, string[]>;
  needsReview: string[];
  notDetectable: { wcagRef: string; what: string }[];
};

export async function loadExpected(): Promise<Expected[]> {
  return (JSON.parse(await readFile(new URL("expected.json", SHOP_DIR), "utf8")) as { pages: Expected[] }).pages;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".vtt": "text/vtt",
};

/** A static file server for the shop. Unknown files are 404s, which is what promo.mp4 should be. */
export async function serveShop(): Promise<{ origin: string; close: () => Promise<void> }> {
  const root = SHOP_DIR.pathname;
  const server: Server = createServer(async (req, res) => {
    const name = path.normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^\/+/, "") || "index.html";
    const file = path.join(root, name);
    if (!file.startsWith(root)) return void res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export type Comparison = {
  page: Expected;
  /** Expected rule, and whether it was found under every expected clause. */
  expectedRules: { ruleId: string; clauses: string[]; found: boolean; foundUnder: string[] }[];
  /** Failing rules nobody planted. */
  unexpected: { ruleId: string; clauses: string[] }[];
  needsReview: { clause: string; found: boolean }[];
  extraNeedsReview: string[];
  /** Planted defects axe has no rule for: `failing` must not claim them. */
  notDetectable: { wcagRef: string; what: string; reportedAsNotChecked: boolean; wronglyFailing: boolean }[];
  ok: boolean;
};

export function compare(page: Expected, report: ClauseReport): Comparison {
  const actual = new Map<string, string[]>();
  for (const criterion of report.failing) {
    for (const rule of criterion.rules) actual.set(rule.ruleId, [...(actual.get(rule.ruleId) ?? []), criterion.enClause]);
  }

  const expectedRules = Object.entries(page.failing).map(([ruleId, clauses]) => {
    const foundUnder = actual.get(ruleId) ?? [];
    return { ruleId, clauses, foundUnder, found: clauses.every((c) => foundUnder.includes(c)) };
  });
  const unexpected = [...actual.entries()]
    .filter(([ruleId]) => !(ruleId in page.failing))
    .map(([ruleId, clauses]) => ({ ruleId, clauses }));

  const reviewed = new Set(report.needsReview.map((c) => c.enClause));
  const needsReview = page.needsReview.map((clause) => ({ clause, found: reviewed.has(clause) }));
  const extraNeedsReview = [...reviewed].filter((c) => !page.needsReview.includes(c));

  const failingRefs = new Set(report.failing.map((c) => c.wcagRef));
  const notChecked = new Set(report.notCheckedByAxe.map((c) => c.wcagRef));
  const notDetectable = page.notDetectable.map((d) => ({
    ...d,
    reportedAsNotChecked: notChecked.has(d.wcagRef),
    wronglyFailing: failingRefs.has(d.wcagRef),
  }));

  return {
    page,
    expectedRules,
    unexpected,
    needsReview,
    extraNeedsReview,
    notDetectable,
    ok:
      expectedRules.every((r) => r.found) &&
      unexpected.length === 0 &&
      needsReview.every((r) => r.found) &&
      notDetectable.every((d) => !d.wronglyFailing),
  };
}
