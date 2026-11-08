#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createScanner } from "../scan/scanner.js";
import { createServer } from "./server.js";

/**
 * stdio entry point: `node dist/mcp/bin.js`. The scanner starts Chromium on the
 * first scan and reuses it; lookups never start a browser.
 *
 * The process exits when its client goes away. An MCP client signals that by
 * closing our stdin, and the SDK's stdio transport does not watch for it, so a
 * server that only waited for a signal would outlive every session, Chromium
 * included.
 */
const scanner = createScanner();
const server = createServer({ scanner });

/** If closing hangs (a stuck browser), exit anyway. */
const SHUTDOWN_GRACE_MS = 5_000;

let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
  await Promise.allSettled([server.close(), scanner.close()]);
  process.exit(0);
}

process.stdin.on("end", () => void shutdown());
process.stdin.on("close", () => void shutdown());
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await server.connect(new StdioServerTransport());
