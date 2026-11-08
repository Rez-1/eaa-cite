#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createScanner } from "../scan/scanner.js";
import { createServer } from "./server.js";

/**
 * stdio entry point: `node dist/mcp/bin.js`. The scanner starts Chromium on the
 * first scan and reuses it; lookups never start a browser.
 */
const scanner = createScanner();
const server = createServer({ scanner });

async function shutdown(): Promise<void> {
  await server.close();
  await scanner.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await server.connect(new StdioServerTransport());
