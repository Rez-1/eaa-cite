import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { run, USAGE, type Io } from "../src/cli/run.js";
import { mapToClauses } from "../src/scan/map.js";
import { SCAN_CAVEAT, type BrowserScanner } from "../src/scan/scanner.js";

/**
 * The CLI through run(), with output captured and the scanner faked, plus a
 * few runs of the real entry point to check exit codes and that the process
 * ends.
 */

const failingReport = {
  ...mapToClauses({
    url: "https://shop.test/",
    testEngine: { name: "axe-core", version: "4.14.0" },
    violations: [{ id: "image-alt", impact: "critical", tags: ["wcag2a", "wcag111"], help: "h", helpUrl: "u", nodes: [{ target: ["img"] }] }],
    incomplete: [],
    passes: [],
  }),
  caveat: SCAN_CAVEAT,
};
const cleanReport = { ...failingReport, failing: [], summary: { ...failingReport.summary, failing: 0 } };

function harness(report = failingReport, fail?: Error) {
  const out: string[] = [];
  const err: string[] = [];
  const calls: string[] = [];
  let closed = 0;
  const scanner: BrowserScanner = {
    scanUrl: async (url) => (calls.push(`url ${url}`), fail ? Promise.reject(fail) : { ...report, url }),
    scanHtml: async () => (calls.push("html"), report),
    close: async () => void closed++,
  };
  const io: Io = { out: (t) => out.push(t), err: (t) => err.push(t), createScanner: () => scanner };
  return { io, out: () => out.join("\n"), err: () => err.join("\n"), calls, closed: () => closed };
}

describe("help and usage", () => {
  it("prints usage on --help and exits 0", async () => {
    const h = harness();
    expect(await run(["--help"], h.io)).toBe(0);
    expect(h.out()).toBe(USAGE);
  });

  it("exits 2 with usage for no command, an unknown command, or a bad flag", async () => {
    for (const argv of [[], ["frobnicate"], ["scan", "--nope"]]) {
      const h = harness();
      expect(await run(argv, h.io), argv.join(" ")).toBe(2);
      expect(h.err()).toContain("Usage: eaa-cite");
    }
  });
});

describe("scan", () => {
  it("exits 1 and lists failures by EN clause, closing the scanner", async () => {
    const h = harness();
    expect(await run(["scan", "https://shop.test/"], h.io)).toBe(1);
    expect(h.calls).toEqual(["url https://shop.test/"]);
    expect(h.out()).toContain("9.1.1.1");
    expect(h.out()).toContain("image-alt (1)");
    expect(h.out()).toContain(SCAN_CAVEAT);
    expect(h.closed()).toBe(1);
  });

  it("exits 0 when nothing in clause 9 fails", async () => {
    expect(await run(["scan", "https://shop.test/"], harness(cleanReport).io)).toBe(0);
  });

  it("scans a local file as HTML, not as a URL", async () => {
    const h = harness();
    await run(["scan", "test/fixtures/shop-clean.html"], h.io);
    expect(h.calls).toEqual(["html"]);
  });

  it("treats an http(s) argument as a URL even if a file of that name exists", async () => {
    // "https://shop.test" is also the relative path https:/shop.test.
    const dir = await mkdtemp(path.join(tmpdir(), "eaa-cli-url-"));
    await mkdir(path.join(dir, "https:"));
    await writeFile(path.join(dir, "https:", "shop.test"), "<p>x</p>");
    const h = harness();
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      await run(["scan", "https://shop.test"], h.io);
    } finally {
      process.chdir(cwd);
    }
    expect(h.calls).toEqual(["url https://shop.test"]);
  });

  it("lists failures outside clause 9", async () => {
    const report = {
      ...cleanReport,
      outsideClause9: [{ ruleId: "target-size", help: "h", helpUrl: "u", impact: "serious" as const, instances: 2, firstTarget: "button" }],
    };
    const h = harness(report);
    await run(["scan", "https://shop.test/"], h.io);
    expect(h.out()).toContain("Outside clause 9: target-size");
  });

  it("prints the report as JSON with --json", async () => {
    const h = harness();
    await run(["scan", "https://shop.test/", "--json"], h.io);
    expect(JSON.parse(h.out())).toMatchObject({ url: "https://shop.test/", caveat: SCAN_CAVEAT });
  });

  it("exits 2 with the reason when the scan fails, and still closes the scanner", async () => {
    const h = harness(failingReport, new Error("Only http and https URLs can be scanned"));
    expect(await run(["scan", "ftp://x"], h.io)).toBe(2);
    expect(h.err()).toBe("Scan failed: Only http and https URLs can be scanned");
    expect(h.closed()).toBe(1);
  });
});

describe("obligations", () => {
  it("prints every claim with its citations and the unverified list", async () => {
    const h = harness();
    expect(await run(["obligations", "de"], h.io)).toBe(0);
    const text = h.out();
    expect(text).toContain("Germany: Barrierefreiheitsstärkungsgesetz (BFSG)");
    expect(text).toContain("Harmonisation status: not_cited");
    expect(text).toContain("hunderttausend Euro");
    expect(text).toContain("https://www.gesetze-im-internet.de/bfsg/__37.html");
    expect(text).toContain("Could not be confirmed:");
  });

  it("prints a claim's note", async () => {
    const h = harness();
    await run(["obligations", "EU", "applicationDate"], h.io);
    expect(h.out()).toContain("Note: Article 31(3)");
  });

  it("narrows to one claim", async () => {
    const h = harness();
    await run(["obligations", "SE", "penalties"], h.io);
    expect(h.out()).toContain("penalties:");
    expect(h.out()).not.toContain("applicationDate:");
  });

  it("prints JSON whose citations carry their sources", async () => {
    const h = harness();
    await run(["obligations", "es", "--json"], h.io);
    const body = JSON.parse(h.out());
    expect(body.claims.penalties.citations[0].source.url).toMatch(/^https:\/\/www\.boe\.es\//);
    expect(body.harmonisation.status).toBe("not_cited");
  });

  it("exits 2 for an unknown jurisdiction or claim", async () => {
    const gb = harness();
    expect(await run(["obligations", "GB"], gb.io)).toBe(2);
    expect(gb.err()).toMatch(/No data for "GB"/);
    expect(await run(["obligations", "SE", "fines"], harness().io)).toBe(2);
  });
});

describe("compare", () => {
  it("lines up one claim and names where it is absent", async () => {
    const h = harness();
    expect(await run(["compare", "transitionalSelfServiceTerminals"], h.io)).toBe(0);
    expect(h.out()).toMatch(/EU .*maxYearsAfterFirstUse 20/);
    expect(h.out()).toContain("No value: SE");
  });

  it("exits 2 for a claim the schema does not define", async () => {
    const h = harness();
    expect(await run(["compare", "fines"], h.io)).toBe(2);
    expect(h.err()).toContain('Unknown claim "fines"');
  });
});

describe("check-data", () => {
  const scratch = mkdtemp(path.join(tmpdir(), "eaa-cli-"));
  const copyOf = async (code: string) => JSON.parse(await readFile(`data/jurisdictions/${code}.json`, "utf8"));
  const write = async (name: string, value: unknown) => {
    const file = path.join(await scratch, name);
    await writeFile(file, typeof value === "string" ? value : JSON.stringify(value));
    return file;
  };

  it("passes a shipped file, guessing the jurisdiction from the file name", async () => {
    const h = harness();
    expect(await run(["check-data", "data/jurisdictions/de.json"], h.io)).toBe(0);
    expect(h.out()).toMatch(/loads: DE, \d+ claims, \d+ citations, \d+ sources\./);
  });

  it("exits 1 and lists every problem in a broken file", async () => {
    const se = await copyOf("se");
    se.claims.penalties.citations[0].source = "missing";
    se.claims.penalty = {};
    const h = harness();
    expect(await run(["check-data", await write("se.json", se)], h.io)).toBe(1);
    expect(h.err()).toContain('Unrecognized key: "penalty"');
  });

  it("checks the declared jurisdiction against --as", async () => {
    const h = harness();
    expect(await run(["check-data", await write("draft.json", await copyOf("se")), "--as", "DE"], h.io)).toBe(1);
    expect(h.err()).toContain("jurisdiction: declares SE, but the file is for DE");
  });

  it("reports unreadable JSON as a file that does not load", async () => {
    const h = harness();
    expect(await run(["check-data", await write("es.json", "{ not json"), "--json"], h.io)).toBe(1);
    expect(JSON.parse(h.out())).toMatchObject({ loads: false });
  });

  it("refuses --as with a code outside the EU", async () => {
    expect(await run(["check-data", "data/jurisdictions/se.json", "--as", "GB"], harness().io)).toBe(2);
  });
});

describe("the real entry point", () => {
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ["--import", "tsx", "src/cli/main.ts", ...args], { encoding: "utf8", timeout: 60_000 });

  it("exits with the command's code", () => {
    expect(cli("check-data", "data/jurisdictions/eu.json").status).toBe(0);
    expect(cli("obligations", "GB").status).toBe(2);
  });

  it("scans a fixture in real Chromium, exits 1, and the process ends", () => {
    const result = cli("scan", "test/fixtures/shop-with-defects.html", "--json");
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).failing.map((c: { enClause: string }) => c.enClause)).toContain("9.1.1.1");
  });
});
