import { createHash } from "node:crypto";
import { citationsOf, getJurisdiction, isOfficialSourceUrl, PUBLISHED, type CitationEntry, type Source } from "../src/dataset/index.js";
import { findQuote, readableText } from "../src/dataset/quotes.js";

/**
 * Re-reads every source and checks that each quote citing it is still there.
 *
 *   npm run verify-sources            # human-readable report
 *   npm run verify-sources -- --json  # machine-readable, for the scheduled CI job
 *   npm run verify-sources -- --skip-host www.example.de   # leave one host out (repeatable)
 *
 * A missing quote means the law was amended, the page moved, or the quote was
 * wrong to begin with. A citation can also list `absent` phrases; one turning
 * up means a claim of absence, such as "not cited", may no longer hold. Any of the three needs a person, so the script exits 1
 * and says which claim is affected. It never edits the data.
 *
 * It also flags any source retrieved more than a year ago as stale: statutes
 * get amended, so a quote that is still on the page still needs a person to
 * re-read the provision and update `retrievedAt`. That check lives here, in the
 * monthly job, and not in the unit tests, so a clone does not start failing its
 * tests a year after the data was checked.
 *
 * The SHA-256 of each page is printed for the record, not compared: consolidated
 * statute pages change their markup often, and a hash mismatch on a page whose
 * quotes are all still present is noise.
 *
 * Every URL fetched, redirects included, must be on an official host
 * (src/dataset/officialHosts.ts), and a download is capped, so a data change
 * cannot aim this script at an internal address or an endless response.
 */

/** Re-verify at least yearly. */
const MAX_AGE_DAYS = 365;
const MAX_REDIRECTS = 5;
const MAX_BYTES = 30 * 1024 * 1024;

type Result = {
  jurisdiction: string;
  source: string;
  url: string;
  status: "ok" | "quote-missing" | "phrase-found" | "fetch-failed" | "manual" | "skipped";
  /** Retrieved more than MAX_AGE_DAYS ago: re-read the provision and update retrievedAt. */
  stale?: true;
  sha256?: string;
  missing?: { claim: string; pinpoint: string; segment: string }[];
  /** `absent` phrases that are now on the page. */
  found?: { claim: string; pinpoint: string; phrase: string }[];
  error?: string;
};

/** Decodes with the charset the server declares; gesetze-im-internet.de is ISO-8859-1. */
async function fetchText(url: string): Promise<{ text: string; sha256: string }> {
  const response = await fetchOfficial(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = await readCapped(response);
  const declared = /charset=([^;]+)/i.exec(response.headers.get("content-type") ?? "")?.[1]?.trim().toLowerCase();
  const sniffed = /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder("latin1").decode(bytes.slice(0, 2048)))?.[1]?.toLowerCase();
  const charset = declared ?? sniffed ?? "utf-8";
  return {
    text: readableText(new TextDecoder(charset === "iso-8859-1" ? "latin1" : charset).decode(bytes)),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

/** Follows redirects by hand, refusing any hop off the official hosts. */
async function fetchOfficial(start: string): Promise<Response> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isOfficialSourceUrl(url)) throw new Error(`refused ${url}: not an official source host`);
    const response = await fetch(url, {
      headers: { "user-agent": "eaa-cite verify-sources (+https://github.com/Rez-1/eaa-cite)", accept: "text/html,*/*" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) return response;
    await response.body?.cancel();
    url = new URL(location, url).href;
  }
  throw new Error(`more than ${MAX_REDIRECTS} redirects from ${start}`);
}

async function readCapped(response: Response): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body?.getReader();
  for (;;) {
    const next = await reader?.read();
    if (!next || next.done) break;
    received += next.value.byteLength;
    if (received > MAX_BYTES) {
      await reader?.cancel();
      throw new Error(`larger than ${MAX_BYTES / 1024 / 1024} MB`);
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}

/** Node reports a network failure as "fetch failed" and puts the useful part in `cause`. */
function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  return cause ? `${error.message}: ${cause.code ? `${cause.code} ` : ""}${cause.message ?? ""}`.trim() : error.message;
}

function isStale(source: Source, now = Date.now()): boolean {
  return (now - Date.parse(source.retrievedAt)) / 86_400_000 > MAX_AGE_DAYS;
}

/** Fetches one source and looks for every quote that cites it, and for every phrase that must be absent. */
async function verifySource(
  jurisdiction: string,
  source: Source,
  citing: readonly CitationEntry[],
  skippedHosts: ReadonlySet<string>,
): Promise<Result> {
  const base = { jurisdiction, source: source.id, url: source.url, ...(isStale(source) ? { stale: true as const } : {}) };
  if (source.verify === "manual") return { ...base, status: "manual" };
  if (skippedHosts.has(new URL(source.url).hostname)) return { ...base, status: "skipped" };
  try {
    const { text, sha256 } = await fetchText(source.url);
    const missing = citing.flatMap(({ place, citation }) => {
      const check = findQuote(text, citation.quote);
      return check.found ? [] : [{ claim: place, pinpoint: citation.pinpoint, segment: check.missing }];
    });
    const found = citing.flatMap(({ place, citation }) =>
      (citation.absent ?? []).filter((phrase) => findQuote(text, phrase).found).map((phrase) => ({ claim: place, pinpoint: citation.pinpoint, phrase })),
    );
    const status = missing.length ? "quote-missing" : found.length ? "phrase-found" : "ok";
    return { ...base, status, sha256, ...(missing.length ? { missing } : {}), ...(found.length ? { found } : {}) };
  } catch (error) {
    return { ...base, status: "fetch-failed", error: reasonOf(error) };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const skippedHosts = new Set(args.flatMap((arg, i) => (arg === "--skip-host" && args[i + 1] ? [args[i + 1]!] : [])));
  const jobs = PUBLISHED.flatMap((code) => {
    const entries = citationsOf(code);
    return getJurisdiction(code).sources.map((source) => {
      const citing = entries.filter((e) => e.citation.source.id === source.id);
      return () => verifySource(code, source, citing, skippedHosts);
    });
  });

  // One request at a time per run: these are public-service sites.
  const results: Result[] = [];
  for (const job of jobs) results.push(await job());

  if (json) {
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
  } else {
    for (const r of results) {
      const mark = { ok: "ok     ", "quote-missing": "MISSING", "phrase-found": "FOUND  ", "fetch-failed": "FAILED ", manual: "manual ", skipped: "skipped" }[r.status];
      console.log(`${mark} ${r.jurisdiction} ${r.source}${r.stale ? "  STALE" : ""}${r.error ? `  ${r.error}` : ""}`);
      for (const m of r.missing ?? []) console.log(`          ${m.claim} (${m.pinpoint}): not found: "${m.segment}"`);
      for (const f of r.found ?? []) console.log(`          ${f.claim} (${f.pinpoint}): must be absent, now on the page: "${f.phrase}"`);
    }
    const manual = results.filter((r) => r.status === "manual");
    if (manual.length) console.log(`\n${manual.length} source(s) need a person to re-check: ${manual.map((r) => r.url).join(", ")}`);
    const skipped = results.filter((r) => r.status === "skipped");
    if (skipped.length) console.log(`\n${skipped.length} source(s) skipped with --skip-host; check them from another network.`);
    const stale = results.filter((r) => r.stale);
    if (stale.length) console.log(`\n${stale.length} source(s) were retrieved more than ${MAX_AGE_DAYS} days ago: re-read the provision and update retrievedAt.`);
  }

  if (results.some((r) => r.status === "quote-missing" || r.status === "phrase-found" || r.status === "fetch-failed" || r.stale)) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
