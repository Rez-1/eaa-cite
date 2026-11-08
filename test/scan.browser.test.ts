import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPrivateAddress, isPrivateHost } from "../src/scan/privateHost.js";
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

describe("private addresses", () => {
  it("knows the private IPv4 ranges", () => {
    for (const ip of ["0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.255", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "100.128.0.1", "172.32.0.1", "192.169.0.1", "203.0.113.7"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("knows the private IPv6 ranges, including IPv4 written inside IPv6", () => {
    for (const ip of ["::", "::1", "fd12::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:a00:1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1", "::7f00:1", "64:ff9b::a00:1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["2001:4860::8888", "::ffff:8.8.8.8", "::ffff:808:808", "64:ff9b::808:808"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("checks hostnames exactly as URL.hostname writes them", async () => {
    // Each of these reaches this machine or a private network in Chromium.
    for (const url of ["http://localhost/", "http://shop.localhost/", "http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[::]/", "http://0.0.0.0/", "http://0x7f.1/", "http://2130706433/", "http://[::ffff:10.0.0.1]/"]) {
      expect(await isPrivateHost(new URL(url).hostname), url).toBe(true);
    }
    expect(await isPrivateHost(new URL("http://203.0.113.7/").hostname)).toBe(false);
  });
});
