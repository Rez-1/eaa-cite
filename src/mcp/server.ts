import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { criteria, criteriaFile, findCriterion } from "../criteria/index.js";
import {
  claimIdSchema,
  compareClaim,
  conformanceFor,
  getJurisdiction,
  PUBLISHED,
  rawJurisdictionFile,
  UnknownJurisdictionError,
  VersionMismatchError,
  type CitedJurisdiction,
} from "../dataset/index.js";
import type { Scanner, ScanReport } from "../scan/scanner.js";

/**
 * The MCP server. No model runs inside it: every answer is a lookup in the
 * checked-in dataset or an axe-core run, so two calls with the same input give
 * the same output.
 *
 * The rule the tools follow: a legal claim goes out with the citation it rests
 * on, or it does not go out. A tool never summarises the law in its own words
 * without the quote next to it.
 */

/** The scanner is injected: createScanner() in production, a fake in tests. */
export type ServerOptions = { scanner: Scanner; version?: string };

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

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Errors a caller can act on. Anything else is a bug and propagates to the SDK. */
const isCallerError = (error: unknown): error is Error =>
  error instanceof UnknownJurisdictionError || error instanceof VersionMismatchError;

/** A lookup tool's result: the answer as JSON, or a caller error as a tool error. */
async function lookup(answer: () => unknown): Promise<CallToolResult> {
  try {
    return json(answer());
  } catch (error) {
    if (isCallerError(error)) return failure(error.message);
    throw error;
  }
}

/** A scan tool's result. Any scan failure (bad URL, blocked redirect, unreachable page) is a tool error. */
async function scanned(scan: () => Promise<ScanReport>): Promise<CallToolResult> {
  try {
    return json(await scan());
  } catch (error) {
    return failure(`Scan failed: ${messageOf(error)}`);
  }
}

/**
 * get_obligations carries the same harmonisation fields as conformance_statement,
 * minus the sentence. A version named in law is already in the claims, under
 * presumptionOfConformity.
 */
export function obligations(file: CitedJurisdiction) {
  const { status, basis, checkedAt, citations } = conformanceFor(file.jurisdiction);
  return {
    jurisdiction: file.jurisdiction,
    name: file.name,
    instrument: file.instrument,
    claims: file.claims,
    harmonisation: { status, basis, checkedAt, citations },
    unverified: file.unverified,
  };
}

/** What get_obligations returns. */
export type Obligations = ReturnType<typeof obligations>;

/** What explain_criterion returns. */
export function explainCriterion(ref: string) {
  const criterion = findCriterion(ref);
  return criterion && { ...criterion, enVersion: criteriaFile.enVersion, enSource: criteriaFile.sources.en };
}
export type CriterionExplanation = NonNullable<ReturnType<typeof explainCriterion>>;

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
    async ({ country: code }) => lookup(() => obligations(getJurisdiction(code))),
  );

  server.registerTool(
    "compare_jurisdictions",
    {
      title: "Compare one EAA claim across jurisdictions",
      description:
        "One claim, such as penalties or the self-service terminal transition, side by side for every published " +
        "jurisdiction, each with its citations. Jurisdictions whose data has no value for the claim are listed under `absent`.",
      inputSchema: { claim: claimIdSchema.describe("Which claim to compare.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ claim }) => json(compareClaim(claim)),
  );

  server.registerTool(
    "conformance_statement",
    {
      title: "Conformance sentence for an accessibility report",
      description:
        "The sentence an audit report can print about the standard it assessed against, chosen from the verified " +
        "harmonisation status in that jurisdiction. Fixed wording; says whether a presumption of conformity may be claimed. " +
        "Where national law names an EN 301 549 version, that version is used, and a different enVersion is refused.",
      inputSchema: {
        country,
        enVersion: z.string().optional().describe('The EN 301 549 version assessed against. Default "EN 301 549 v3.2.1", or the version national law names.'),
        wcagVersion: z.string().optional().describe('The WCAG baseline assessed against. Default "WCAG 2.1 AA".'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ country: code, enVersion, wcagVersion }) => lookup(() => conformanceFor(code, { enVersion, wcagVersion })),
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
      const explanation = explainCriterion(ref);
      if (explanation) return json(explanation);
      return failure(
        `${JSON.stringify(ref)} is not a clause 9 criterion of ${criteriaFile.enVersion}. ` +
          "It covers WCAG 2.1 levels A and AA only; AAA criteria and WCAG 2.2 additions are outside it.",
      );
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
    async ({ url }) => scanned(() => options.scanner.scanUrl(url)),
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
    async ({ html }) => scanned(() => options.scanner.scanHtml(html)),
  );

  server.registerResource(
    "jurisdiction",
    new ResourceTemplate("eaa://jurisdictions/{code}", {
      list: async () => ({
        resources: PUBLISHED.map((code) => {
          const file = getJurisdiction(code);
          return { uri: `eaa://jurisdictions/${code.toLowerCase()}`, name: `${file.name}: ${file.instrument}`, mimeType: "application/json" };
        }),
      }),
    }),
    { title: "Jurisdiction data file", description: "The raw data file for one jurisdiction, as checked in.", mimeType: "application/json" },
    async (uri, { code }) => {
      let file: unknown;
      try {
        file = rawJurisdictionFile(String(code));
      } catch (error) {
        // Resources have no tool-style error result; an unknown code is invalid params, not a server fault.
        if (isCallerError(error)) throw new McpError(ErrorCode.InvalidParams, error.message);
        throw error;
      }
      return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(file, null, 2) }] };
    },
  );

  server.registerResource(
    "criteria",
    "eaa://criteria/en-301-549-v3.2.1",
    { title: "EN 301 549 v3.2.1 clause 9 table", description: `${criteria.length} criteria with the bytes they were extracted from.`, mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(criteriaFile, null, 2) }] }),
  );

  return server;
}
