import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  claimIdSchema,
  compareClaim,
  conformanceFor,
  DatasetIntegrityError,
  getJurisdiction,
  JURISDICTIONS,
  parseJurisdictionFile,
  UnknownJurisdictionError,
  walkCitations,
  type ClaimId,
  type Jurisdiction,
  type ResolvedCitation,
} from "../dataset/index.js";
import type { BrowserScanner, ScanReport } from "../scan/scanner.js";

/**
 * The command-line interface. Each command calls one function the MCP tools
 * also use, and prints its result as text, or as JSON with --json. Nothing here
 * decides anything the library does not.
 *
 * Exit codes: 0 done; 1 the answer is bad news (clause 9 failures, a file that
 * does not load); 2 the command could not run (bad arguments, unknown code,
 * unreachable page).
 */

export type Io = {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Injected so tests can scan without a browser. */
  createScanner: () => BrowserScanner;
};

export const USAGE = `Usage: eaa-cite <command> [options]

Commands:
  scan <url | file.html>        Scan a page with axe-core and list failures by EN 301 549 clause
  obligations <code> [claim]    What the EAA requires in a jurisdiction, with citations
  compare <claim>               One claim across every published jurisdiction
  check-data <file> [--as XX]   Check a jurisdiction file against the load rules

Options:
  --json     Print the result as JSON
  --help     Show this help

Codes: EU, SE, DE, ES. Claims: ${claimIdSchema.options.join(", ")}.
Exit codes: 0 done, 1 failures found or file does not load, 2 could not run.`;

class UsageError extends Error {}

export async function run(argv: readonly string[], io: Io): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: { json: { type: "boolean" }, help: { type: "boolean", short: "h" }, as: { type: "string" } },
    });
  } catch (error) {
    io.err(`${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { positionals, values } = parsed;
  const [command, ...args] = positionals;
  const json = values.json === true;

  if (values.help || !command) {
    (command || values.help ? io.out : io.err)(USAGE);
    return values.help ? 0 : 2;
  }

  try {
    switch (command) {
      case "scan":
        return await scan(args, json, io);
      case "obligations":
        return obligations(args, json, io);
      case "compare":
        return compare(args, json, io);
      case "check-data":
        return await checkData(args, values.as, json, io);
      default:
        throw new UsageError(`Unknown command ${JSON.stringify(command)}.`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(`${error.message}\n\n${USAGE}`);
      return 2;
    }
    if (error instanceof UnknownJurisdictionError) {
      io.err(error.message);
      return 2;
    }
    throw error;
  }
}

function only(args: readonly string[], name: string): string {
  if (args.length !== 1) throw new UsageError(`Expected one ${name}.`);
  return args[0]!;
}

// ---- scan ------------------------------------------------------------------

async function scan(args: readonly string[], json: boolean, io: Io): Promise<number> {
  const target = only(args, "URL or HTML file");
  const scanner = io.createScanner();
  let report: ScanReport;
  try {
    // A local file is scanned as markup, with network requests blocked; anything
    // else must be an http(s) URL, which the scanner checks.
    report = (await isFile(target)) ? await scanner.scanHtml(await readFile(target, "utf8")) : await scanner.scanUrl(target);
  } catch (error) {
    io.err(`Scan failed: ${(error as Error).message}`);
    return 2;
  } finally {
    await scanner.close();
  }

  if (json) io.out(JSON.stringify(report, null, 2));
  else io.out(formatScan(report));
  return report.failing.length > 0 ? 1 : 0;
}

async function isFile(target: string): Promise<boolean> {
  if (/^https?:\/\//i.test(target)) return false;
  return stat(target).then((s) => s.isFile(), () => false);
}

function formatScan(report: ScanReport): string {
  const lines = [`${report.url}  (axe-core ${report.axeVersion ?? "unknown"})`, ""];
  const { summary } = report;
  lines.push(`Failing: ${summary.failing} of ${summary.ofCriteria} clause 9 criteria`);
  for (const c of report.failing) {
    const rules = c.rules.map((r) => `${r.ruleId} (${r.instances})`).join(", ");
    lines.push(`  ${c.enClause.padEnd(9)} ${c.name.padEnd(36)} ${rules}`);
  }
  if (report.needsReview.length > 0) {
    lines.push("", `Needs review: ${summary.needsReview}`);
    for (const c of report.needsReview) lines.push(`  ${c.enClause.padEnd(9)} ${c.name.padEnd(36)} ${c.rules.map((r) => r.ruleId).join(", ")}`);
  }
  lines.push("", `Not checked by axe: ${summary.notCheckedByAxe} criteria need a person.`);
  if (report.outsideClause9.length > 0) lines.push(`Outside clause 9: ${report.outsideClause9.map((r) => r.ruleId).join(", ")}`);
  lines.push("", report.caveat);
  return lines.join("\n");
}

// ---- obligations -----------------------------------------------------------

function claimId(raw: string): ClaimId {
  const parsed = claimIdSchema.safeParse(raw);
  if (!parsed.success) throw new UsageError(`Unknown claim ${JSON.stringify(raw)}.`);
  return parsed.data;
}

function obligations(args: readonly string[], json: boolean, io: Io): number {
  if (args.length < 1 || args.length > 2) throw new UsageError("Expected a jurisdiction code and, optionally, one claim.");
  const file = getJurisdiction(args[0]!);
  const wanted = args[1] === undefined ? claimIdSchema.options : [claimId(args[1])];
  const { status, basis, checkedAt, citations } = conformanceFor(file.jurisdiction);

  if (json) {
    const claims = Object.fromEntries(wanted.flatMap((id) => (file.claims[id] ? [[id, file.claims[id]]] : [])));
    io.out(JSON.stringify({ jurisdiction: file.jurisdiction, name: file.name, instrument: file.instrument, claims, harmonisation: { status, basis, checkedAt, citations }, unverified: file.unverified }, null, 2));
    return 0;
  }

  const lines = [`${file.name}: ${file.instrument}`, `Harmonisation status: ${status} (from the ${basis === "eu" ? "EU-level check" : "national law"}, oldest source ${checkedAt})`];
  for (const id of wanted) {
    const claim = file.claims[id];
    lines.push("", `${id}: ${claim ? describe(claim.value) : "no value in the data"}`);
    if (claim?.note) lines.push(`  Note: ${claim.note}`);
    for (const c of claim?.citations ?? []) lines.push(...formatCitation(c));
  }
  if (args[1] === undefined && file.unverified.length > 0) {
    lines.push("", "Could not be confirmed:", ...file.unverified.map((u) => `  - ${u}`));
  }
  io.out(lines.join("\n"));
  return 0;
}

function formatCitation(c: ResolvedCitation): string[] {
  return [
    `  ${c.pinpoint}`,
    `    "${c.quote}"`,
    ...(c.translation ? [`    = ${c.translation}`] : []),
    `    ${c.source.url} (retrieved ${c.source.retrievedAt})`,
  ];
}

/** A claim value on one line: its summary or rule if it has one, else its fields. */
function describe(value: object): string {
  const v = value as Record<string, unknown>;
  const lead = typeof v.summary === "string" ? v.summary : typeof v.rule === "string" ? v.rule : null;
  const rest = Object.entries(v)
    .filter(([k, x]) => k !== "summary" && k !== "rule" && x !== null && typeof x !== "object")
    .map(([k, x]) => `${k} ${x}`)
    .join(", ");
  return [lead, rest].filter(Boolean).join(" | ") || JSON.stringify(value);
}

// ---- compare ---------------------------------------------------------------

function compare(args: readonly string[], json: boolean, io: Io): number {
  const comparison = compareClaim(claimId(only(args, "claim")));
  if (json) {
    io.out(JSON.stringify(comparison, null, 2));
    return 0;
  }

  const lines = [comparison.claim, ""];
  for (const row of comparison.rows) {
    lines.push(`${row.jurisdiction.padEnd(3)} ${describe(row.value)}`);
    const first = row.citations[0]!;
    lines.push(`    ${first.pinpoint}: ${first.source.url}`);
  }
  if (comparison.absent.length > 0) lines.push("", `No value: ${comparison.absent.join(", ")}`);
  io.out(lines.join("\n"));
  return 0;
}

// ---- check-data ------------------------------------------------------------

async function checkData(args: readonly string[], as: string | undefined, json: boolean, io: Io): Promise<number> {
  const file = only(args, "file");
  // se.json is checked as Sweden's file unless --as says otherwise.
  const guess = (as ?? path.basename(file, path.extname(file))).toUpperCase();
  const expected = (JURISDICTIONS as readonly string[]).includes(guess) ? (guess as Jurisdiction) : undefined;
  if (as !== undefined && !expected) throw new UsageError(`--as ${as} is not the EU or an EU member state code.`);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    const problem = `${file} is not readable JSON: ${(error as Error).message}`;
    if (json) io.out(JSON.stringify({ file, loads: false, problems: [problem] }, null, 2));
    else io.err(problem);
    return 1;
  }

  try {
    const { cited, harmonisation } = parseJurisdictionFile(parsedJson, expected);
    const citations = walkCitations({ claims: cited.claims, ...(harmonisation ? { harmonisation } : {}) }).length;
    const claims = Object.values(cited.claims).filter(Boolean).length;
    if (json) io.out(JSON.stringify({ file, loads: true, jurisdiction: cited.jurisdiction, claims, citations, sources: cited.sources.length }, null, 2));
    else io.out(`${file} loads: ${cited.jurisdiction}, ${claims} claims, ${citations} citations, ${cited.sources.length} sources.`);
    return 0;
  } catch (error) {
    if (!(error instanceof DatasetIntegrityError)) throw error;
    if (json) io.out(JSON.stringify({ file, loads: false, problems: error.problems }, null, 2));
    else io.err([`${file} does not load (${error.problems.length} problem${error.problems.length === 1 ? "" : "s"}):`, ...error.problems.map((p) => `  - ${p}`)].join("\n"));
    return 1;
  }
}
