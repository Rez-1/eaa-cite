import { createHash } from "node:crypto";
import { dataset, PUBLISHED, type Citation, type JurisdictionFile, type Source } from "../src/dataset/index.js";
import { findQuote, readableText } from "../src/dataset/quotes.js";

/**
 * Re-reads every source and checks that each quote citing it is still there.
 *
 *   npm run verify-sources            # human-readable report
 *   npm run verify-sources -- --json  # machine-readable, for the scheduled CI job
 *
 * A missing quote means the law was amended, the page moved, or the quote was
 * wrong to begin with. Any of the three needs a person, so the script exits 1
 * and says which claim is affected. It never edits the data.
 *
 * The SHA-256 of each page is printed for the record, not compared: consolidated
 * statute pages change their markup often, and a hash mismatch on a page whose
 * quotes are all still present is noise.
 */

type Result = {
  jurisdiction: string;
  source: string;
  url: string;
  status: "ok" | "quote-missing" | "fetch-failed" | "manual";
  sha256?: string;
  missing?: { claim: string; pinpoint: string; segment: string }[];
  error?: string;
};

function citationsBySource(file: JurisdictionFile): Map<string, { claim: string; citation: Citation }[]> {
  const out = new Map<string, { claim: string; citation: Citation }[]>();
  const add = (claim: string, citation: Citation): void => {
    out.set(citation.source, [...(out.get(citation.source) ?? []), { claim, citation }]);
  };
  for (const [id, claim] of Object.entries(file.claims)) for (const c of claim?.citations ?? []) add(id, c);
  for (const c of file.harmonisation?.citations ?? []) add("harmonisation", c);
  return out;
}

/** Decodes with the charset the server declares; gesetze-im-internet.de is ISO-8859-1. */
async function fetchText(url: string): Promise<{ text: string; sha256: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": "eaa-cite verify-sources (+https://github.com/)", accept: "text/html,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const declared = /charset=([^;]+)/i.exec(response.headers.get("content-type") ?? "")?.[1]?.trim().toLowerCase();
  const sniffed = /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder("latin1").decode(bytes.slice(0, 2048)))?.[1]?.toLowerCase();
  const charset = declared ?? sniffed ?? "utf-8";
  return {
    text: readableText(new TextDecoder(charset === "iso-8859-1" ? "latin1" : charset).decode(bytes)),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function verifySource(file: JurisdictionFile, source: Source, cited: { claim: string; citation: Citation }[]): Promise<Result> {
  const base = { jurisdiction: file.jurisdiction, source: source.id, url: source.url };
  if (source.verify === "manual") return { ...base, status: "manual" };
  try {
    const { text, sha256 } = await fetchText(source.url);
    const missing = cited.flatMap(({ claim, citation }) => {
      const check = findQuote(text, citation.quote);
      return check.found ? [] : [{ claim, pinpoint: citation.pinpoint, segment: check.missing }];
    });
    return { ...base, status: missing.length ? "quote-missing" : "ok", sha256, ...(missing.length ? { missing } : {}) };
  } catch (error) {
    return { ...base, status: "fetch-failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const jobs = PUBLISHED.flatMap((code) => {
    const file = dataset[code];
    const bySource = citationsBySource(file);
    return file.sources.map((source) => () => verifySource(file, source, bySource.get(source.id) ?? []));
  });

  // One request at a time per run: these are public-service sites.
  const results: Result[] = [];
  for (const job of jobs) results.push(await job());

  if (json) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
  } else {
    for (const r of results) {
      const mark = { ok: "ok     ", "quote-missing": "MISSING", "fetch-failed": "FAILED ", manual: "manual " }[r.status];
      console.log(`${mark} ${r.jurisdiction} ${r.source}${r.sha256 ? `  sha256 ${r.sha256.slice(0, 12)}` : ""}${r.error ? `  ${r.error}` : ""}`);
      for (const m of r.missing ?? []) console.log(`          ${m.claim} (${m.pinpoint}): not found: "${m.segment}"`);
    }
    const manual = results.filter((r) => r.status === "manual");
    if (manual.length) console.log(`\n${manual.length} source(s) need a person to re-check: ${manual.map((r) => r.url).join(", ")}`);
  }

  if (results.some((r) => r.status === "quote-missing" || r.status === "fetch-failed")) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
