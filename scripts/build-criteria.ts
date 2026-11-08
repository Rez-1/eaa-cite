import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { CriteriaFile } from "../src/criteria/index.js";
import { buildCriteria, parseWcagCriteria, parseWebClauses } from "./lib/criteriaSource.js";

/**
 * Regenerates data/en-301-549-v3.2.1-clause9.json from the two primary sources:
 *
 *   npm run build:criteria
 *
 * Downloads the ETSI PDF and the WCAG 2.1 Recommendation, parses both, checks
 * they agree, and records each document's URL, size and SHA-256 so a reader can
 * tell exactly which bytes the table came from. pdfjs-dist is a dev dependency:
 * only this script reads the PDF.
 */

const EN_URL = "https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf";
const WCAG_URL = "https://www.w3.org/TR/WCAG21/";
const OUT = new URL("../data/en-301-549-v3.2.1-clause9.json", import.meta.url);

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { "user-agent": "eaa-cite build-criteria" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Lines per page, rebuilt from pdfjs text items by their baseline. */
async function pdfLines(data: Uint8Array): Promise<string[][]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  const pages: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const lines: string[] = [];
    let line = "";
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5] as number);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line);
        line = "";
      }
      line += item.str;
      lastY = y;
    }
    lines.push(line);
    pages.push(lines);
  }
  return pages;
}

async function main(): Promise<void> {
  const [pdf, html] = await Promise.all([download(EN_URL), download(WCAG_URL)]);
  // Hash before pdfjs runs: it takes ownership of the buffer it is given.
  const en = { url: EN_URL, bytes: pdf.byteLength, sha256: sha256(pdf) };
  const wcag = { url: WCAG_URL, bytes: html.byteLength, sha256: sha256(html) };

  const pages = await pdfLines(pdf);
  const criteria = buildCriteria(
    parseWebClauses(pages),
    parseWcagCriteria(new TextDecoder().decode(html)),
    WCAG_URL,
  );

  const file: CriteriaFile = {
    enVersion: "EN 301 549 v3.2.1",
    wcagVersion: "WCAG 2.1 AA",
    sources: { en: { ...en, pages: pages.length }, wcag },
    extractedAt: new Date().toISOString(),
    criteria,
  };
  await writeFile(OUT, JSON.stringify(file, null, 2) + "\n");

  const at = (level: string): number => criteria.filter((c) => c.level === level).length;
  console.log(`${criteria.length} criteria (A ${at("A")}, AA ${at("AA")}) from ${pages.length} PDF pages`);
  console.log(`EN sha256 ${en.sha256}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
