import { createHash } from "node:crypto";
import { citationsOf, getJurisdiction, PUBLISHED, type CitationEntry, type Source } from "../src/dataset/index.js";
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

/** Decodes with the charset the server declares; gesetze-im-internet.de is ISO-8859-1. */
async function fetchText(url: string): Promise<{ text: string; sha256: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": "eaa-cite verify-sources (+https://github.com/Rez-1/eaa-cite)", accept: "text/html,*/*" },
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

/** Fetches one source and looks for every quote that cites it. */
async function verifySource(jurisdiction: string, source: Source, citing: readonly CitationEntry[]): Promise<Result> {
  const base = { jurisdiction, source: source.id, url: source.url };
  if (source.verify === "manual") return { ...base, status: "manual" };
  try {
    const { text, sha256 } = await fetchText(source.url);
    const missing = citing.flatMap(({ place, citation }) => {
      const check = findQuote(text, citation.quote);
      return check.found ? [] : [{ claim: place, pinpoint: citation.pinpoint, segment: check.missing }];
    });
    return { ...base, status: missing.length ? "quote-missing" : "ok", sha256, ...(missing.length ? { missing } : {}) };
  } catch (error) {
    return { ...base, status: "fetch-failed", error: error instanceof Error ? error.message : String(error) };
  }
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const jobs = PUBLISHED.flatMap((code) => {
    const entries = citationsOf(code);
    return getJurisdiction(code).sources.map((source) => {
      const citing = entries.filter((e) => e.citation.source.id === source.id);
      return () => verifySource(code, source, citing);
    });
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
