import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Scanner } from "../src/mcp/server.js";
import { scanHtml } from "../src/scan/browser.js";
import type { AxeRun } from "../src/scan/map.js";

/**
 * Contract tests: a real MCP client talks to the server over the SDK's
 * in-memory transport, so these exercise tool registration, input validation
 * and the wire format, not just the functions underneath.
 */

const fakeRun: AxeRun = {
  url: "https://shop.test/",
  testEngine: { name: "axe-core", version: "4.14.0" },
  violations: [
    { id: "image-alt", impact: "critical", tags: ["wcag2a", "wcag111"], help: "Images must have alternative text", helpUrl: "https://x/image-alt", nodes: [{ target: ["img.hero"] }] },
  ],
  incomplete: [],
  passes: [],
};

async function connect(scanner: Scanner): Promise<Client> {
  const server = createServer({ scanner });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

type TextResult = { isError?: boolean; content: { type: string; text: string }[] };
const body = (result: unknown): any => JSON.parse((result as TextResult).content[0]!.text);
const text = (result: unknown): string => (result as TextResult).content[0]!.text;

let client: Client;
const scanned: string[] = [];
beforeAll(async () => {
  client = await connect({
    scanUrl: async (url) => {
      scanned.push(url);
      return { ...fakeRun, url };
    },
    scanHtml: async () => fakeRun,
  });
});

describe("tool list", () => {
  it("offers the six tools, all marked read-only", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["compare_jurisdictions", "conformance_statement", "explain_criterion", "get_obligations", "scan_html", "scan_url"],
    );
    for (const tool of tools) expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
  });
});

describe("get_obligations", () => {
  it("returns every claim with its quote, pinpoint and source URL", async () => {
    const de = body(await client.callTool({ name: "get_obligations", arguments: { country: "de" } }));
    expect(de.jurisdiction).toBe("DE");
    const penalties = de.claims.penalties;
    expect(penalties.value.maxFine).toBe(100000);
    expect(penalties.citations[0]).toMatchObject({
      pinpoint: expect.stringContaining("§ 37"),
      quote: expect.stringContaining("hunderttausend Euro"),
      translation: expect.stringContaining("EUR 100,000"),
      source: { url: "https://www.gesetze-im-internet.de/bfsg/__37.html", retrievedAt: expect.any(String) },
    });
  });

  it("passes each source's note through with the citation", async () => {
    // ADR 0001: some notes are legal caveats, so they are never trimmed.
    const de = body(await client.callTool({ name: "get_obligations", arguments: { country: "DE" } }));
    const mlbf = de.claims.supervisoryAuthority.citations.find((c: any) => c.source.id === "mlbf-about");
    expect(mlbf.source.note).toMatch(/Not a designating provision/);
  });

  it("never returns a claim without a citation", async () => {
    for (const country of ["EU", "SE", "DE", "ES"]) {
      const file = body(await client.callTool({ name: "get_obligations", arguments: { country } }));
      for (const [id, claim] of Object.entries<any>(file.claims)) {
        if (!claim) continue;
        expect(claim.citations.length, `${country}.${id}`).toBeGreaterThan(0);
        for (const c of claim.citations) expect(c.source.url, `${country}.${id}`).toMatch(/^https:\/\//);
      }
    }
  });

  it("gives a member state the EU harmonisation answer, citing the Commission page", async () => {
    const se = body(await client.callTool({ name: "get_obligations", arguments: { country: "SE" } }));
    expect(se.harmonisation).toMatchObject({ status: "not_cited", basis: "eu" });
    expect(se.harmonisation.citations[0].source.url).toMatch(/single-market-economy\.ec\.europa\.eu/);
  });

  it("refuses a jurisdiction it has no data for, naming the ones it has", async () => {
    const result = await client.callTool({ name: "get_obligations", arguments: { country: "GB" } });
    expect((result as TextResult).isError).toBe(true);
    expect(text(result)).toMatch(/No data for "GB"\. Published: EU, SE, DE, ES/);
  });
});

describe("compare_jurisdictions", () => {
  it("lines up one rule across jurisdictions and says where it is absent", async () => {
    const result = body(await client.callTool({ name: "compare_jurisdictions", arguments: { claim: "transitionalSelfServiceTerminals" } }));
    const years = Object.fromEntries(result.rows.map((r: any) => [r.jurisdiction, r.value.maxYearsAfterFirstUse]));
    expect(years).toEqual({ EU: 20, DE: 15, ES: 10 });
    expect(result.absent).toEqual(["SE"]);
  });

  it("rejects a claim name outside the schema", async () => {
    const result = await client.callTool({ name: "compare_jurisdictions", arguments: { claim: "fines" } });
    expect((result as TextResult).isError).toBe(true);
  });
});

describe("conformance_statement", () => {
  it("shares status, basis, checkedAt and citations with get_obligations", async () => {
    for (const country of ["EU", "SE", "DE", "ES"]) {
      const statement = body(await client.callTool({ name: "conformance_statement", arguments: { country } }));
      const { harmonisation } = body(await client.callTool({ name: "get_obligations", arguments: { country } }));
      const shared = (o: any) => ({ status: o.status, basis: o.basis, checkedAt: o.checkedAt, citations: o.citations });
      expect(shared(statement), country).toEqual(shared(harmonisation));
      expect(statement.basis, country).toBe("eu");
    }
  });

  it("reports the versions it used", async () => {
    const result = body(await client.callTool({ name: "conformance_statement", arguments: { country: "SE", wcagVersion: "WCAG 2.1 AA" } }));
    expect(result).toMatchObject({ enVersion: "EN 301 549 v3.2.1", wcagVersion: "WCAG 2.1 AA" });
  });

  it("claims no presumption of conformity while nothing is cited under the EAA", async () => {
    const result = body(await client.callTool({ name: "conformance_statement", arguments: { country: "ES" } }));
    expect(result.mayClaimPresumptionOfConformity).toBe(false);
    expect(result.status).toBe("not_cited");
    expect(result.sentence).toContain("EN 301 549 v3.2.1 (WCAG 2.1 AA) as a technical benchmark");
    expect(result.citations.length).toBeGreaterThan(0);
  });
});

describe("explain_criterion", () => {
  it("finds a criterion by either numbering", async () => {
    const byWcag = body(await client.callTool({ name: "explain_criterion", arguments: { ref: "1.4.3" } }));
    const byEn = body(await client.callTool({ name: "explain_criterion", arguments: { ref: "9.1.4.3" } }));
    expect(byWcag).toEqual(byEn);
    expect(byWcag).toMatchObject({ enClause: "9.1.4.3", level: "AA", enSource: { sha256: expect.stringMatching(/^[0-9a-f]{64}$/) } });
  });

  it("explains why a WCAG 2.2 criterion is not there", async () => {
    const result = await client.callTool({ name: "explain_criterion", arguments: { ref: "2.4.11" } });
    expect((result as TextResult).isError).toBe(true);
    expect(text(result)).toMatch(/WCAG 2\.2 additions are outside it/);
  });
});

describe("scan_url", () => {
  it("maps the scanner's result to EN clauses and attaches the caveat", async () => {
    const result = body(await client.callTool({ name: "scan_url", arguments: { url: "https://shop.test/" } }));
    expect(scanned).toContain("https://shop.test/");
    expect(result.failing[0]).toMatchObject({ enClause: "9.1.1.1", rules: [{ ruleId: "image-alt" }] });
    expect(result.caveat).toMatch(/no `passed` list/);
    expect(result).not.toHaveProperty("passed");
  });

  it("turns a scanner error into a tool error instead of crashing the server", async () => {
    const failing = await connect({
      scanUrl: async () => {
        throw new Error("Only http and https URLs can be scanned");
      },
      scanHtml: async () => fakeRun,
    });
    const result = await failing.callTool({ name: "scan_url", arguments: { url: "file:///etc/passwd" } });
    expect((result as TextResult).isError).toBe(true);
    expect(text(result)).toMatch(/Only http and https/);
  });
});

describe("resources", () => {
  it("lists one data file per jurisdiction and serves it", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(
      expect.arrayContaining(["eaa://jurisdictions/eu", "eaa://jurisdictions/se", "eaa://criteria/en-301-549-v3.2.1"]),
    );
    const { contents } = await client.readResource({ uri: "eaa://jurisdictions/es" });
    expect(JSON.parse((contents[0] as { text: string }).text).jurisdiction).toBe("ES");
  });
});

describe("scan_html with a real browser", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it("reports the planted defects end to end", async () => {
    const real = await connect({ scanUrl: async () => fakeRun, scanHtml: (html) => scanHtml(html, { browser }) });
    const html = await readFile(new URL("./fixtures/shop-with-defects.html", import.meta.url), "utf8");
    const result = body(await real.callTool({ name: "scan_html", arguments: { html } }));
    expect(result.failing.map((c: any) => c.enClause)).toEqual(expect.arrayContaining(["9.1.1.1", "9.1.4.3", "9.3.1.1", "9.4.1.2"]));
  });
});
