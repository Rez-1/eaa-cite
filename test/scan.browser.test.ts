import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertScannableUrl, BlockedNavigationError, createScanner, SCAN_CAVEAT } from "../src/scan/scanner.js";

/**
 * Real Chromium, real axe. Fixtures with planted defects are loaded with
 * setContent; the redirect rule is tested against a local HTTP server.
 */

const fixture = (name: string): Promise<string> => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const scanner = createScanner();
afterAll(() => scanner.close());

describe("scanning the fixture with planted defects", () => {
  it("reports each planted defect under its EN clause, with the caveat", async () => {
    const report = await scanner.scanHtml(await fixture("shop-with-defects.html"));
    const failing = Object.fromEntries(report.failing.map((c) => [c.enClause, c.rules.map((r) => r.ruleId)]));

    expect(failing["9.1.1.1"]).toContain("image-alt");
    expect(failing["9.1.4.3"]).toContain("color-contrast");
    expect(failing["9.3.1.1"]).toContain("html-has-lang");
    expect(failing["9.4.1.2"]).toEqual(expect.arrayContaining(["label", "button-name"]));
    expect(report.caveat).toBe(SCAN_CAVEAT);
  });
});

describe("scanning the clean fixture", () => {
  it("finds nothing failing in clause 9, and still lists what axe could not check", async () => {
    const report = await scanner.scanHtml(await fixture("shop-clean.html"));
    expect(report.failing).toEqual([]);
    // A clean axe run is not a clean audit: most criteria need a person.
    expect(report.notCheckedByAxe.length).toBeGreaterThan(20);
    expect(report.notCheckedByAxe.map((c) => c.wcagRef)).toContain("1.2.2");
  });
});

describe("WCAG 2.2 rules", () => {
  it("run, and land outside clause 9 instead of as clause 9 failures", async () => {
    const report = await scanner.scanHtml(
      `<!doctype html><html lang="en"><title>t</title><main><h1>x</h1>` +
        `<button style="width:10px;height:10px;padding:0;border:0">a</button>` +
        `<button style="width:10px;height:10px;padding:0;border:0">b</button></main></html>`,
    );
    expect(report.outsideClause9.map((r) => r.ruleId)).toContain("target-size");
    expect(report.failing).toEqual([]);
  });
});

describe("the browser lifecycle", () => {
  it("launches again after a failed launch", async () => {
    let attempts = 0;
    const flaky = createScanner({
      launch: async () => {
        if (++attempts === 1) throw new Error("Chromium failed to start");
        return chromium.launch();
      },
    });
    try {
      await expect(flaky.scanHtml("<p>x</p>")).rejects.toThrow("Chromium failed to start");
      await expect(flaky.scanHtml("<html lang=en><title>t</title><p>x</p></html>")).resolves.toHaveProperty("caveat");
      expect(attempts).toBe(2);
    } finally {
      await flaky.close();
    }
  });

  it("closes a browser that was still launching when close() was called", async () => {
    let launched: import("playwright").Browser | null = null;
    const s = createScanner({ launch: async () => (launched = await chromium.launch()) });
    const scanning = s.scanHtml("<p>x</p>").catch(() => {});
    await s.close();
    await scanning;
    await s.close();
    expect(launched!.isConnected()).toBe(false);
  });

  it("launches again after the browser crashes, without close() being called", async () => {
    const launched: import("playwright").Browser[] = [];
    const s = createScanner({ launch: async () => { const b = await chromium.launch(); launched.push(b); return b; } });
    try {
      await s.scanHtml("<p>x</p>");
      await launched[0]!.close(); // the browser goes away behind the scanner's back
      await expect(s.scanHtml("<html lang=en><title>t</title><p>x</p></html>")).resolves.toHaveProperty("caveat");
      expect(launched).toHaveLength(2);
    } finally {
      await s.close();
    }
  });

  it("launches again after the browser goes away", async () => {
    let launches = 0;
    const s = createScanner({ launch: () => (launches++, chromium.launch()) });
    try {
      await s.scanHtml("<p>x</p>");
      await s.close();
      await s.scanHtml("<p>x</p>");
      expect(launches).toBe(2);
    } finally {
      await s.close();
    }
  });
});

describe("the redirect rule", () => {
  let server: Server;
  let port: number;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const go = (to: string) => res.writeHead(302, { location: to }).end();
      if (req.url === "/to-private") return go(`http://localhost:${port}/secret`);
      if (req.url === "/two-hops") return go(`http://127.0.0.1:${port}/hop`);
      if (req.url === "/hop") return go(`http://127.0.0.1:${port}/final`);
      if (req.url === "/loop") return go(`http://127.0.0.1:${port}/loop`);
      res.writeHead(200, { "content-type": "text/html" }).end(`<html lang="en"><title>${req.url}</title><p>${req.url}</p></html>`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // Pretend 127.0.0.1 is a public address and `localhost` a private one.
  const publicLoopback = createScanner({ isPrivateHost: async (host) => host === "localhost" });
  afterAll(() => publicLoopback.close());

  it("refuses a redirect from a public start to a private address, naming it", async () => {
    const attempt = publicLoopback.scanUrl(`http://127.0.0.1:${port}/to-private`);
    await expect(attempt).rejects.toBeInstanceOf(BlockedNavigationError);
    await expect(publicLoopback.scanUrl(`http://127.0.0.1:${port}/to-private`)).rejects.toThrow(`http://localhost:${port}/secret`);
  });

  it("follows redirects between public addresses, hop by hop, and reports the final URL", async () => {
    const report = await publicLoopback.scanUrl(`http://127.0.0.1:${port}/two-hops`);
    expect(report.url).toBe(`http://127.0.0.1:${port}/final`);
  });

  it("lets a scan that starts at a private address stay on private addresses", async () => {
    const report = await scanner.scanUrl(`http://localhost:${port}/two-hops`);
    expect(report.url).toBe(`http://127.0.0.1:${port}/final`);
  });

  it("fails the scan, not the process, when the server refuses the connection", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const closedPort = (closed.address() as { port: number }).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    await expect(scanner.scanUrl(`http://127.0.0.1:${closedPort}/`)).rejects.toThrow(/ECONNREFUSED/);
    await expect(publicLoopback.scanUrl(`http://127.0.0.1:${closedPort}/`)).rejects.toThrow(/ECONNREFUSED/);
    // The scanner still works afterwards.
    await expect(scanner.scanUrl(`http://127.0.0.1:${port}/final`)).resolves.toHaveProperty("caveat");
  });

  it("stops a redirect loop", async () => {
    await expect(publicLoopback.scanUrl(`http://127.0.0.1:${port}/loop`)).rejects.toThrow(/Stopped after 10 redirects/);
  });
});

describe("hostile pages", () => {
  // Counts every request that reaches it, so a test can assert "nothing got out".
  let hits: string[] = [];
  let server: Server;
  let port: number;
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(`${req.method} ${req.url}`);
      if (req.url === "/popup-page") {
        return res.writeHead(200, { "content-type": "text/html" }).end(`<html lang="en"><title>p</title><script>window.open("http://127.0.0.1:${port}/opened")</script></html>`);
      }
      if (req.url === "/huge") {
        // An endless body with no content-length.
        res.writeHead(200, { "content-type": "text/html" });
        const chunk = Buffer.alloc(1024 * 1024, "a");
        const pump = (): void => {
          while (res.write(chunk)) {}
          res.once("drain", pump);
        };
        res.on("close", () => res.removeAllListeners("drain"));
        return pump();
      }
      if (req.url === "/declared-huge") {
        return res.writeHead(200, { "content-type": "text/html", "content-length": String(500 * 1024 * 1024) }).end();
      }
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    });
    server.on("upgrade", (req, socket) => {
      hits.push(`UPGRADE ${req.url}`);
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("refuses popups instead of crashing", async () => {
    hits = [];
    const report = await scanner.scanUrl(`http://127.0.0.1:${port}/popup-page`);
    expect(report.caveat).toBe(SCAN_CAVEAT);
    expect(hits).not.toContain("GET /opened");
  });

  it("lets pasted markup reach nothing on the network", async () => {
    hits = [];
    const base = `http://127.0.0.1:${port}`;
    await scanner.scanHtml(`<!doctype html><html lang="en"><head><title>t</title>
      <link rel="prefetch" href="${base}/prefetch"><link rel="preconnect" href="${base}">
      <link rel="stylesheet" href="${base}/style.css"><script src="${base}/script.js"></script></head>
      <body><img src="${base}/img.png" alt="x"><iframe src="${base}/frame" title="f"></iframe>
      <script>
        fetch("${base}/fetch").catch(() => {});
        navigator.sendBeacon("${base}/beacon", "x");
        try { new WebSocket("ws://127.0.0.1:${port}/ws"); } catch {}
        new Image().src = "${base}/pixel";
      </script></body></html>`);
    await new Promise((r) => setTimeout(r, 500)); // let anything in flight arrive
    expect(hits).toEqual([]);
  });

  it("refuses a document that never ends, without holding it in memory", async () => {
    const before = process.memoryUsage().rss;
    await expect(scanner.scanUrl(`http://127.0.0.1:${port}/huge`)).rejects.toThrow(/larger than 20 MB/);
    expect(process.memoryUsage().rss - before).toBeLessThan(200 * 1024 * 1024);
  });

  it("refuses a document that declares itself too large, before reading it", async () => {
    await expect(scanner.scanUrl(`http://127.0.0.1:${port}/declared-huge`)).rejects.toThrow(/larger than 20 MB/);
  });

  it("gives up on a page that keeps axe busy, within twice the timeout", async () => {
    const quick = createScanner({ timeoutMs: 1_500 });
    try {
      const started = Date.now();
      await expect(quick.scanHtml(`<html lang="en"><title>t</title><body onload="for(;;){}"><p>x</p></body></html>`)).rejects.toThrow();
      expect(Date.now() - started).toBeLessThan(6_000);
    } finally {
      await quick.close();
    }
  }, 20_000);

  it("reports a failure in one line, without Playwright's call log", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const closedPort = (closed.address() as { port: number }).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    const error = await scanner.scanUrl(`http://127.0.0.1:${closedPort}/`).catch((e: Error) => e);
    expect((error as Error).message).not.toContain("\n");
    expect((error as Error).message).toBe(`Could not load http://127.0.0.1:${closedPort}/: connect ECONNREFUSED 127.0.0.1:${closedPort}`);
  });
});

describe("assertScannableUrl", () => {
  it("allows http, https and localhost", () => {
    expect(assertScannableUrl("http://localhost:3000/cart").host).toBe("localhost:3000");
    expect(assertScannableUrl("https://shop.test/").protocol).toBe("https:");
  });

  it("refuses schemes that would read the disk or run script", () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,<p>", "not a url"]) {
      expect(() => assertScannableUrl(url)).toThrow(/Only http and https/);
    }
  });
});
