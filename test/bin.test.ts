import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * The stdio server must exit when its client closes stdin. If it does not, every
 * MCP session leaves a server and a Chromium running, and CI hangs on the step
 * that starts it.
 */

function startServer() {
  const child = spawn(process.execPath, ["--import", "tsx", "src/mcp/bin.ts"], { stdio: ["pipe", "pipe", "inherit"] });
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  const replies: string[] = [];
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => replies.push(chunk));
  const send = (message: object) => child.stdin.write(JSON.stringify(message) + "\n");
  const reply = async (id: number): Promise<unknown> => {
    for (let i = 0; i < 300; i++) {
      const line = replies.join("").split("\n").find((l) => l.includes(`"id":${id}`));
      if (line) return JSON.parse(line);
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no reply to ${id}`);
  };
  return { child, exited, send, reply };
}

const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } };

describe("the stdio server", () => {
  it("exits when the client closes stdin, after a scan has started Chromium", async () => {
    const server = startServer();
    server.send(initialize);
    await server.reply(1);
    server.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    server.send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "scan_html", arguments: { html: "<p>x</p>" } } });
    await server.reply(2);

    const started = Date.now();
    server.child.stdin.end();
    const code = await server.exited;
    expect(code).toBe(0);
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 60_000);

  it("exits when stdin closes before any scan", async () => {
    const server = startServer();
    server.send(initialize);
    await server.reply(1);
    server.child.stdin.end();
    expect(await server.exited).toBe(0);
  }, 30_000);
});
