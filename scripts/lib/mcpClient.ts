import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ClaimId, compareClaim, ConformanceAnswer } from "../../src/dataset/index.js";
import type { CriterionExplanation, Obligations } from "../../src/mcp/server.js";
import type { ScanReport } from "../../src/scan/scanner.js";

/**
 * Starts the MCP server over stdio, the way Claude Desktop does, and calls its
 * tools with typed results. Shared by the demo and the test-shop run.
 */

/** What each tool returns, as the server's own types describe it. */
export type ToolResults = {
  get_obligations: Obligations;
  conformance_statement: ConformanceAnswer;
  explain_criterion: CriterionExplanation;
  scan_url: ScanReport;
  scan_html: ScanReport;
};

export type StdioClient = {
  call<K extends keyof ToolResults>(tool: K, args: Record<string, unknown>): Promise<ToolResults[K]>;
  /** compare_jurisdictions, typed by the claim asked for. */
  compare<K extends ClaimId>(claim: K): Promise<ReturnType<typeof compareClaim<K>>>;
  close(): Promise<void>;
};

export async function connectStdio(name: string): Promise<StdioClient> {
  const client = new Client({ name, version: "0" });
  await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/mcp/bin.ts"], stderr: "inherit" }));

  async function callJson(tool: string, args: Record<string, unknown>): Promise<unknown> {
    const result = (await client.callTool({ name: tool, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const text = result.content[0]?.text ?? "";
    // A tool error is plain text, not JSON: report it as what it is.
    if (result.isError) throw new Error(`${tool}: ${text}`);
    return JSON.parse(text);
  }

  return {
    call: async (tool, args) => (await callJson(tool, args)) as never,
    compare: async (claim) => (await callJson("compare_jurisdictions", { claim })) as never,
    close: () => client.close(),
  };
}
