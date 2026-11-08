#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium, type Browser } from "playwright";
import { scanHtml, scanUrl } from "../scan/browser.js";
import { createServer } from "./server.js";

/**
 * stdio entry point: `npx eaa-cite-mcp`. One Chromium is launched on the first
 * scan and reused; lookups never start a browser.
 */
let browser: Promise<Browser> | null = null;
const shared = (): Promise<Browser> => (browser ??= chromium.launch());

const server = createServer({
  scanner: {
    scanUrl: async (url) => scanUrl(url, { browser: await shared() }),
    scanHtml: async (html) => scanHtml(html, { browser: await shared() }),
  },
});

async function shutdown(): Promise<void> {
  await server.close();
  if (browser) await (await browser).close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await server.connect(new StdioServerTransport());
