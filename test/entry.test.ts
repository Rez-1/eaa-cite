import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What each package entry pulls in, read from the import statements. The root
 * entry is for the dataset, so it must not reach the browser or the MCP SDK;
 * those load only through `eaa-cite/scan/browser` and the two bins.
 */
function packagesReachedFrom(entry: string): Set<string> {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      if (specifier!.startsWith(".")) visit(resolve(dirname(file), specifier!.replace(/\.js$/, ".ts")));
      else if (!specifier!.startsWith("node:")) packages.add(specifier!);
    }
  };
  visit(resolve(entry));
  return packages;
}

const HEAVY = /^(playwright|@axe-core\/playwright|axe-core|@modelcontextprotocol\/|@anthropic-ai\/)/;

describe("package entries", () => {
  it.each(["src/index.ts", "src/scan/index.ts", "src/criteria/index.ts"])("keeps the browser and the SDKs out of %s", (entry) => {
    expect([...packagesReachedFrom(entry)].filter((p) => HEAVY.test(p))).toEqual([]);
  });

  it("finds Playwright through eaa-cite/scan/browser, so the check above can fail", () => {
    expect([...packagesReachedFrom("src/scan/browser.ts")]).toContain("playwright");
  });
});
