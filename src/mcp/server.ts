import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { criteria, criteriaFile, findCriterion } from "../criteria/index.js";
import {
  dataset,
  getJurisdiction,
  harmonisationFor,
  PUBLISHED,
  UnknownJurisdictionError,
  type ClaimId,
  type Citation,
  type JurisdictionFile,
} from "../dataset/index.js";
import { mapToClauses, type AxeRun, type ClauseReport } from "../scan/map.js";
import { conformanceStatement } from "../standards/harmonisation.js";

/**
 * The MCP server. No model runs inside it: every answer is a lookup in the
 * checked-in dataset or an axe-core run, so two calls with the same input give
 * the same output.
 *
 * The rule the tools follow: a legal claim goes out with the citation it rests
 * on, or it does not go out. A tool never summarises the law in its own words
 * without the quote next to it.
 */

/** What the scan tools need. Injected so tests can run without a browser. */
export type Scanner = {
  scanUrl(url: string): Promise<AxeRun>;
  scanHtml(html: string): Promise<AxeRun>;
};

export type ServerOptions = { scanner: Scanner; version?: string };

const CLAIM_IDS = [
  "applicationDate",
  "transpositionDeadline",
  "microenterpriseExemption",
  "microenterpriseDefinition",
  "presumptionOfConformity",
  "nationalStandardReference",
  "supervisoryAuthority",
  "penalties",
  "transitionalServiceContracts",
  "transitionalSelfServiceTerminals",
] as const satisfies readonly ClaimId[];

const country = z
  .string()
  .min(2)
  .describe(`ISO country code of an EU member state, or "EU" for the directive itself. Published: ${PUBLISHED.join(", ")}.`);

function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function failure(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Joins each citation to its source, so the caller gets a URL and a date with every quote. */
function withSources(file: JurisdictionFile, citations: readonly Citation[]) {
  return citations.map((citation) => {
    const source = file.sources.find((s) => s.id === citation.source);
    if (!source) throw new Error(`${file.jurisdiction}: citation names unknown source ${citation.source}`);
    return {
      ...citation,
      source: { title: source.title, identifier: source.identifier, url: source.url, language: source.language, retrievedAt: source.retrievedAt },
    };
  });
}

function obligations(file: JurisdictionFile) {
  const claims = Object.fromEntries(
    Object.entries(file.claims).map(([id, claim]) => [
      id,
      claim && { value: claim.value, ...(claim.note ? { note: claim.note } : {}), citations: withSources(file, claim.citations) },
    ]),
  );
  const harmonisation = harmonisationFor(file.jurisdiction);
  return {
    jurisdiction: file.jurisdiction,
    name: file.name,
    instrument: file.instrument,
    claims,
    harmonisation: {
      status: harmonisation.status,
      basis: harmonisation.basis,
      checkedAt: harmonisation.checkedAt,
      citations: harmonisation.citations.map((c) => withSources(dataset[c.jurisdiction], [c])[0]),
    },
    unverified: file.unverified,
  };
}

/** What a scan result means and does not mean, sent with every scan. */
const SCAN_CAVEAT =
  "axe-core checks a subset of WCAG automatically. `failing` lists defects it found. " +
  "`notCheckedByAxe` lists clause 9 criteria no axe rule touched: they need a person. " +
  "There is deliberately no `passed` list, because an axe pass is not an evaluation of the criterion.";

function scanResult(report: ClauseReport): CallToolResult {
  return json({ ...report, caveat: SCAN_CAVEAT });
}

export function createServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: "eaa-cite", version: options.version ?? "0.1.0" });

  server.registerTool(
    "get_obligations",
    {
      title: "EAA obligations for a jurisdiction",
      description:
        "What the European Accessibility Act requires in one jurisdiction, for services such as e-commerce: " +
        "when it applies, the microenterprise exemption, the supervisory authority, penalties, transitional periods " +
        "and whether a harmonised standard gives a presumption of conformity. Every value comes with the article it " +
        "rests on, a verbatim quote, an English translation and the source URL. `unverified` lists what could not be confirmed.",
      inputSchema: { country },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ country: code }) => {
      try {
        return json(obligations(getJurisdiction(code)));
      } catch (error) {
        if (error instanceof UnknownJurisdictionError) return failure(error.message);
        throw error;
      }
    },
  );

  server.registerTool(
    "compare_jurisdictions",
    {
      title: "Compare one EAA rule across jurisdictions",
      description:
        "One claim, such as penalties or the self-service terminal transition, side by side for every published " +
        "jurisdiction, each with its citations. Jurisdictions whose data has no value for the claim are listed under `absent`.",
      inputSchema: { claim: z.enum(CLAIM_IDS).describe("Which rule to compare.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ claim }) => {
      const rows = PUBLISHED.flatMap((code) => {
        const file = dataset[code];
        const entry = file.claims[claim];
        return entry ? [{ jurisdiction: code, value: entry.value, citations: withSources(file, entry.citations) }] : [];
      });
      return json({ claim, rows, absent: PUBLISHED.filter((code) => !dataset[code].claims[claim]) });
    },
  );

  server.registerTool(
    "conformance_statement",
    {
      title: "Conformance sentence for an accessibility report",
      description:
        "The sentence an audit report can print about the standard it assessed against, chosen from the verified " +
        "harmonisation status in that jurisdiction. Fixed wording; says whether a presumption of conformity may be claimed.",
      inputSchema: {
        country,
        enVersion: z.string().default("EN 301 549 v3.2.1").describe("The EN 301 549 version assessed against."),
        wcagVersion: z.string().default("WCAG 2.1 AA").describe("The WCAG baseline assessed against."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ country: code, enVersion, wcagVersion }) => {
      try {
        const file = getJurisdiction(code);
        const harmonisation = harmonisationFor(file.jurisdiction);
        const statement = conformanceStatement({ status: harmonisation.status, enVersion, wcagVersion, memberState: file.jurisdiction });
        return json({
          ...statement,
          status: harmonisation.status,
          checkedAt: harmonisation.checkedAt,
          citations: harmonisation.citations.map((c) => withSources(dataset[c.jurisdiction], [c])[0]),
        });
      } catch (error) {
        if (error instanceof UnknownJurisdictionError) return failure(error.message);
        throw error;
      }
    },
  );

  server.registerTool(
    "explain_criterion",
    {
      title: "Look up an EN 301 549 clause 9 criterion",
      description:
        'One WCAG 2.1 A or AA criterion by WCAG number ("1.4.3") or EN clause ("9.1.4.3"): its name, level, WCAG link, ' +
        "and the page of the EN PDF where the clause appears, with that PDF's SHA-256.",
      inputSchema: { ref: z.string().min(5).describe('WCAG number such as "1.4.3" or EN clause such as "9.1.4.3".') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ ref }) => {
      const criterion = findCriterion(ref);
      if (!criterion) {
        return failure(
          `${JSON.stringify(ref)} is not a clause 9 criterion of ${criteriaFile.enVersion}. ` +
            "It covers WCAG 2.1 levels A and AA only; AAA criteria and WCAG 2.2 additions are outside it.",
        );
      }
      return json({ ...criterion, enVersion: criteriaFile.enVersion, enSource: criteriaFile.sources.en });
    },
  );

  server.registerTool(
    "scan_url",
    {
      title: "Scan a page with axe-core and map results to EN 301 549",
      description:
        "Loads an http(s) URL in headless Chromium, runs axe-core with the WCAG 2.1 A and AA rules, and files each " +
        "violation under its EN 301 549 clause 9 criterion. Also lists the criteria axe could not check, which need a person.",
      inputSchema: { url: z.string().describe("An http or https URL. localhost is allowed.") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url }) => {
      try {
        return scanResult(mapToClauses(await options.scanner.scanUrl(url)));
      } catch (error) {
        return failure(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  server.registerTool(
    "scan_html",
    {
      title: "Scan an HTML string with axe-core",
      description:
        "Like scan_url, for markup you already have, such as a component's rendered output. Network requests from the markup are blocked.",
      inputSchema: { html: z.string().min(1).max(2_000_000).describe("A full HTML document or a fragment.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ html }) => {
      try {
        return scanResult(mapToClauses(await options.scanner.scanHtml(html)));
      } catch (error) {
        return failure(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  );

  server.registerResource(
    "jurisdiction",
    new ResourceTemplate("eaa://jurisdictions/{code}", {
      list: async () => ({
        resources: PUBLISHED.map((code) => ({
          uri: `eaa://jurisdictions/${code.toLowerCase()}`,
          name: `${dataset[code].name}: ${dataset[code].instrument}`,
          mimeType: "application/json",
        })),
      }),
    }),
    { title: "Jurisdiction data file", description: "The raw data file for one jurisdiction, as checked in.", mimeType: "application/json" },
    async (uri, { code }) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(getJurisdiction(String(code)), null, 2) }],
    }),
  );

  server.registerResource(
    "criteria",
    "eaa://criteria/en-301-549-v3.2.1",
    { title: "EN 301 549 v3.2.1 clause 9 table", description: `${criteria.length} criteria with the bytes they were extracted from.`, mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(criteriaFile, null, 2) }] }),
  );

  return server;
}
