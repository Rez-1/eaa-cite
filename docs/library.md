# Using eaa-cite as a library

The package root, `eaa-cite`, exports the dataset lookups, the clause 9 table,
the scanner and the MCP server factory. Everything listed here is exported from
[`src/index.ts`](../src/index.ts). The second entry point, `eaa-cite/guarded`, is
a separate sample described in [guarded.md](guarded.md).

All snippets on this page are TypeScript and were run against the built package.

## Install and import

The package is not on npm. Clone and build it ([install.md](install.md)), then
add the clone to your project as a local dependency:

```bash
npm install /absolute/path/to/eaa-cite
```

npm links the folder, so a `git pull` and `npm run build` in the clone update
your project too.

| | |
|---|---|
| Package name | `eaa-cite` |
| Module format | ESM only (`"type": "module"`). There is no CommonJS build. |
| Node | 22 or later |
| Entry points | `eaa-cite` and `eaa-cite/guarded` |
| Types | `.d.ts` files next to the JavaScript in `dist/`. In TypeScript, use `"moduleResolution": "nodenext"` or `"bundler"` so the `exports` map is read. |

Importing `eaa-cite` loads and checks all four jurisdiction files and the
clause 9 table straight away. A broken data file throws at import time. It does
not start a browser; that happens on the first scan.

## Look up a jurisdiction

```ts
import { getJurisdiction, isPublished, PUBLISHED } from "eaa-cite";

const de = getJurisdiction("de"); // any case; surrounding spaces are trimmed
de.name; // "Germany"
de.claims.penalties.value.maxFine; // 100000
de.claims.penalties.value.currency; // "EUR"
de.claims.penalties.citations[0].pinpoint; // "BFSG § 37 Absatz 2 (offences listed in § 37 Absatz 1)"
de.claims.penalties.citations[0].source.url; // "https://www.gesetze-im-internet.de/bfsg/__37.html"

for (const code of PUBLISHED) {
  console.log(code, getJurisdiction(code).claims.applicationDate.value.date);
}

isPublished("SE"); // true
isPublished("se"); // false: isPublished is case-sensitive, getJurisdiction is not
```

| Export | What it does |
|---|---|
| `getJurisdiction(code)` | Returns a `CitedJurisdiction`: the file's `jurisdiction`, `name`, `instrument`, `sources`, `claims` and `unverified`, with each citation's `source` replaced by the full source object. Throws `UnknownJurisdictionError` for a code that is not published. |
| `PUBLISHED` | `["EU", "SE", "DE", "ES"]`, read-only. |
| `isPublished(code)` | Type guard for `Published`. Exact match, upper case only. |

A `CitedJurisdiction` has no `harmonisation` field. Use
[`conformanceFor`](#get-a-conformance-answer) for that.

Optional claims are missing when a file does not record them, so check before
reading:

```ts
const terminals = getJurisdiction("SE").claims.transitionalSelfServiceTerminals;
if (terminals) console.log(terminals.value.maxYearsAfterFirstUse);
```

The claims and their value shapes are listed in
[data-format.md](data-format.md#claims).

## Read citations

```ts
import { citationsOf } from "eaa-cite";

for (const { place, path, citation } of citationsOf("SE")) {
  console.log(place, path, citation.source.id, citation.source.retrievedAt);
}
// applicationDate claims.applicationDate.citations[0] sfs-2023-254 2026-11-08
// ...
```

`citationsOf(code)` returns every citation in a jurisdiction as a
`CitationEntry[]`: the citations of each claim in turn, then, for `EU` only,
the citations of the harmonisation block.

| Type | Fields |
|---|---|
| `CitationEntry` | `place`: a `CitationPlace`. `path`: where it sits in the file, for example `claims.penalties.citations[0]` or `harmonisation.citations[1]`. `citation`: a `ResolvedCitation`. |
| `CitationPlace` | A `ClaimId`, or `"harmonisation"`. |
| `ResolvedCitation` | `source` (a `Source`), `pinpoint`, `quote`, `translation?`, `note?`. |
| `Source` | `id`, `title`, `identifier?`, `kind`, `url`, `language`, `retrievedAt`, `verify`, `note?`. |

## Compare a claim

```ts
import { compareClaim, type ClaimComparison } from "eaa-cite";

const terminals = compareClaim("transitionalSelfServiceTerminals");
for (const row of terminals.rows) {
  console.log(row.jurisdiction, row.value.maxYearsAfterFirstUse, row.citations[0].pinpoint);
}
// EU 20 Article 32(2)
// DE 15 BFSG § 38 Absatz 2
// ES 10 Ley 11/2023, disposición transitoria única, apartado 2
terminals.absent; // ["SE"]
```

`compareClaim(claim)` returns `{ claim, rows, absent }`. Each row is the claim's
`{ value, citations, note? }` with a `jurisdiction` field added, in `PUBLISHED`
order. `absent` lists the jurisdictions with no value for the claim. The value
type follows the claim id, so `row.value` is typed. `ClaimComparison` is the
return type for any claim id.

## Get a conformance answer

```ts
import { conformanceFor, DEFAULT_EN_VERSION, DEFAULT_WCAG_VERSION } from "eaa-cite";

const se = conformanceFor("SE");
se.status; // "not_cited"
se.basis; // "eu"
se.mayClaimPresumptionOfConformity; // false
se.checkedAt; // "2026-11-08"
se.sentence; // "The site was assessed against EN 301 549 v3.2.1 (WCAG 2.1 AA) as a technical benchmark. ..."

conformanceFor("ES", { wcagVersion: "WCAG 2.2 AA" }).wcagVersion; // "WCAG 2.2 AA"

DEFAULT_EN_VERSION; // "EN 301 549 v3.2.1"
DEFAULT_WCAG_VERSION; // "WCAG 2.1 AA"
```

`conformanceFor(code, assessed?)` takes an `Assessed` (`{ enVersion?, wcagVersion? }`) and returns a `ConformanceAnswer`:

| Field | Type | Meaning |
|---|---|---|
| `status` | `HarmonisationStatus` | `cited`, `not_cited` or `national_only` |
| `basis` | `"eu"` or `"national-law"` | `national-law` when the member state's law names an EN 301 549 version |
| `enVersion` | string | The version the sentence names: the one in law if there is one, else `assessed.enVersion`, else `DEFAULT_EN_VERSION` |
| `wcagVersion` | string | `assessed.wcagVersion`, else `DEFAULT_WCAG_VERSION` |
| `sentence` | string | Fixed wording for the status |
| `mayClaimPresumptionOfConformity` | boolean | `true` only for `cited` |
| `checkedAt` | string | The oldest `retrievedAt` among the citations |
| `citations` | `ResolvedCitation` with `jurisdiction` | The citations the answer rests on |

It throws `UnknownJurisdictionError` for an unpublished code, and
`VersionMismatchError` when the law names a version and `enVersion` is a
different one. How to read the answer: [results.md](results.md#read-a-conformance-answer).

The fixed sentences themselves are not exported. Reaching them only through
`conformanceFor` means the version check and the EU or national choice always
run first ([ADR 0003](adr/0003-harmonisation-status-has-three-values.md)).
`HARMONISATION_STATUSES` and the `HarmonisationStatus` type are exported, for
code that stores or displays a status.

## Look up a criterion

```ts
import { criteria, criteriaFile, findCriterion } from "eaa-cite";

const focus = findCriterion("2.4.7"); // or "9.2.4.7"
focus?.enClause; // "9.2.4.7"
focus?.name; // "Focus Visible"
focus?.level; // "AA"
focus?.enPage; // 48

findCriterion("2.4.11"); // undefined: a WCAG 2.2 addition, outside clause 9

criteria.length; // 50
criteriaFile.sources.en.sha256; // "1eee3a1841a94567da8e59f3b19a782ce9ab081c386b6a2a763b8cde13ff5b49"
```

| Export | What it is |
|---|---|
| `findCriterion(ref)` | A `Criterion` by EN clause or WCAG number, trimmed. `undefined` for anything outside the 50. |
| `criteria` | The 50 `Criterion` rows, read-only, in clause order. |
| `criteriaFile` | The whole table: `enVersion`, `wcagVersion`, `sources.en` (`url`, `bytes`, `sha256`, `pages`), `sources.wcag` (`url`, `bytes`, `sha256`), `extractedAt`, `criteria`. |
| `Criterion` | `enClause`, `wcagRef`, `level` (`A` or `AA`), `name`, `wcagUrl`, `enPage`. |

## Scan a page

`createScanner` returns a scanner that owns one Chromium. It launches Chromium
on the first scan, launches it again after a failed launch or a crash, and shuts
it down on `close()`. Install Chromium first: `npx playwright install chromium`.

```ts
import { readFile } from "node:fs/promises";
import { createScanner } from "eaa-cite";

const scanner = createScanner({ timeoutMs: 15_000 });
try {
  // Any HTML file of yours. Inside a clone of this repository,
  // test/fixtures/shop-with-defects.html gives the output below.
  const html = await readFile("page.html", "utf8");
  const report = await scanner.scanHtml(html);
  for (const c of report.failing) {
    console.log(c.enClause, c.name, c.rules.map((r) => r.ruleId).join(", "));
  }
  // 9.1.1.1 Non-text Content image-alt
  // 9.1.4.3 Contrast (Minimum) color-contrast
  // 9.3.1.1 Language of Page html-has-lang
  // 9.4.1.2 Name, Role, Value button-name, label
  report.summary; // { failing: 4, needsReview: 0, notCheckedByAxe: 43, ofCriteria: 50 }

  const page = await scanner.scanUrl("http://localhost:3000");
} finally {
  await scanner.close();
}
```

| Export | What it does |
|---|---|
| `createScanner(options?)` | Returns a `BrowserScanner`: `scanUrl(url)`, `scanHtml(html)` and `close()`. |
| `ScannerOptions` | `timeoutMs` (each navigation; default 30,000), `launch` (how to start Chromium; default `chromium.launch()`), `isPrivateHost` (the check behind the redirect rule). The last two are for tests. |
| `ScanReport` | A `ClauseReport` plus `caveat`. This is what the MCP scan tools return. |
| `SCAN_CAVEAT` | The fixed caveat text carried on every report. |
| `assertScannableUrl(raw)` | Parses a URL and returns a `URL`. Throws `UnsupportedUrlError` unless it is http or https. |
| `mapToClauses(run)` | Maps an axe-core result (`AxeRun`) onto clause 9 and returns a `ClauseReport`. Pure, no browser. Use it if you run axe yourself. |

`scanUrl` and `scanHtml` behave as the `scan_url` and `scan_html` tools do,
including the redirect rule and the blocked requests; see
[tools.md](tools.md#scan_url). The report fields are listed in
[tools.md](tools.md#scan-results) and explained in
[results.md](results.md#read-a-scan-report).

If you run axe yourself, pass its result to `mapToClauses`. Only the fields in
`AxeRun` are read:

```ts
import { mapToClauses, type AxeRun } from "eaa-cite";

const run: AxeRun = {
  url: "https://shop.example/",
  testEngine: { name: "axe-core", version: "4.14.0" },
  violations: [
    {
      id: "image-alt",
      impact: "critical",
      tags: ["wcag2a", "wcag111"],
      help: "Images must have alternative text",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.14/image-alt",
      nodes: [{ target: ["img.hero"] }],
    },
  ],
  incomplete: [],
  passes: [],
};
mapToClauses(run).failing[0].enClause; // "9.1.1.1"
```

## Run the MCP server in your own process

`createServer({ scanner, version? })` returns an `McpServer` from
`@modelcontextprotocol/sdk` with the six tools and two resources registered. Pass
it any `Scanner`: an object with `scanUrl(url)` and `scanHtml(html)` that return
a `ScanReport`. `version` is the server version reported to clients; default
`"0.1.0"`.

To connect it, install the MCP SDK in your own project
(`npm install @modelcontextprotocol/sdk`). A test that talks to the server with
a fake scanner, the way [`test/mcp.test.ts`](../test/mcp.test.ts) does:

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, mapToClauses, SCAN_CAVEAT, type Scanner, type ScanReport } from "eaa-cite";

const fixed: ScanReport = {
  ...mapToClauses({ url: "https://shop.test/", violations: [], incomplete: [], passes: [] }),
  caveat: SCAN_CAVEAT,
};
const scanner: Scanner = { scanUrl: async (url) => ({ ...fixed, url }), scanHtml: async () => fixed };

const server = createServer({ scanner });
const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "my-test", version: "0" });
await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

const result = await client.callTool({ name: "scan_url", arguments: { url: "https://shop.test/" } });
await client.close();
```

For a real server, pass `createScanner()` and call `scanner.close()` when you
shut down. [`src/mcp/bin.ts`](../src/mcp/bin.ts) does exactly that over stdio.

## Load a jurisdiction file of your own

`parseJurisdictionFile(json, expected?)` checks a file and returns
`{ cited, harmonisation }`: the `CitedJurisdiction`, and the EU harmonisation
block with resolved citations (`null` for a member state). Use it to test an
edited or new file before it ships.

```ts
import { readFile } from "node:fs/promises";
import { DatasetIntegrityError, parseJurisdictionFile } from "eaa-cite";

// A copy of se.json where someone changed "jurisdiction" to "DE" by mistake.
const edited = JSON.parse(await readFile("my-edits/se.json", "utf8"));
try {
  parseJurisdictionFile(edited, "SE");
} catch (error) {
  if (!(error instanceof DatasetIntegrityError)) throw error;
  error.file; // "jurisdictions/se.json"
  error.problems; // ["jurisdiction: declares DE, but the file is for SE"]
}
```

`expected` is the jurisdiction the file is for. With it, a file that declares
another jurisdiction is rejected, and the error names the file
`jurisdictions/<code>.json`; without it, the label is `jurisdiction file`.

The function throws one `DatasetIntegrityError` listing every problem found:
schema errors first (as `path: message`), and only if the schema passes, the load
rules. Every object in the schema is strict, so an unknown or misspelt key is a
schema error, not silently dropped. The rules are listed in [data-format.md](data-format.md#load-rules).

## Errors

| Error | Thrown by | Message | Extra fields |
|---|---|---|---|
| `UnknownJurisdictionError` | `getJurisdiction`, `citationsOf`, `conformanceFor` | `No data for "FR". Published: EU, SE, DE, ES` | |
| `VersionMismatchError` | `conformanceFor` | `<code> law names <version>, but the assessment used <enVersion>. The conformance sentence cannot name a version the law does not.` | `jurisdiction`, `namedInLaw`, `assessed` |
| `DatasetIntegrityError` | `parseJurisdictionFile`, and importing the package if a shipped file is broken | `<file> does not load:` followed by one `  - <problem>` line per problem | `file`, `problems` |
| `UnsupportedUrlError` | `assertScannableUrl`, `scanner.scanUrl` | `Only http and https URLs can be scanned, got "<url>"` | |
| `BlockedNavigationError` | `scanner.scanUrl` | `Refused to load <url>: it is a private network address, and the scan started at a public one. Start the scan at a private address (such as localhost) to scan private pages.` | `url` |

Playwright errors from a scan (timeouts, refused connections, a missing
Chromium) are passed through unchanged.
A redirect chain longer than 10 hops throws a plain `Error`:
`Stopped after 10 redirects from <url>`.

None of the published jurisdictions names an EN 301 549 version, so
`VersionMismatchError` cannot occur with the shipped data.

## Types

| Type | What it is | Defined in |
|---|---|---|
| `Published` | `"EU" \| "SE" \| "DE" \| "ES"` | [`src/dataset/index.ts`](../src/dataset/index.ts) |
| `JurisdictionFile` | A jurisdiction file as checked in | [`src/dataset/schema.ts`](../src/dataset/schema.ts) |
| `Claims` | The `claims` object of a jurisdiction file | `src/dataset/schema.ts` |
| `ClaimId` | One claim id | `src/dataset/schema.ts` |
| `Source` | One source entry | `src/dataset/schema.ts` |
| `CitedJurisdiction` | A loaded file with citations resolved and no `harmonisation` | [`src/dataset/load.ts`](../src/dataset/load.ts) |
| `CitedClaims` | `Claims` with citations resolved | `src/dataset/load.ts` |
| `ResolvedCitation` | A citation whose `source` is the full `Source` | `src/dataset/load.ts` |
| `CitationEntry` | One citation with its `place` and `path` | `src/dataset/load.ts` |
| `CitationPlace` | A `ClaimId` or `"harmonisation"` | `src/dataset/load.ts` |
| `ConformanceAnswer` | The conformance answer | [`src/dataset/conformance.ts`](../src/dataset/conformance.ts) |
| `Assessed` | What was assessed: `{ enVersion?, wcagVersion? }` | `src/dataset/conformance.ts` |
| `ClaimComparison` | What `compareClaim` returns | [`src/dataset/index.ts`](../src/dataset/index.ts) |
| `HarmonisationStatus` | `"cited" \| "not_cited" \| "national_only"` | [`src/standards/harmonisation.ts`](../src/standards/harmonisation.ts) |
| `Criterion` | One clause 9 row | [`src/criteria/source.ts`](../src/criteria/source.ts) |
| `AxeRun` | The parts of an axe-core result `mapToClauses` reads | [`src/scan/map.ts`](../src/scan/map.ts) |
| `ClauseReport` | The clause 9 report | `src/scan/map.ts` |
| `ScanReport` | `ClauseReport` plus `caveat` | [`src/scan/scanner.ts`](../src/scan/scanner.ts) |
| `Scanner` | `scanUrl` and `scanHtml`, as `createServer` needs | `src/scan/scanner.ts` |
| `BrowserScanner` | `Scanner` plus `close()` | `src/scan/scanner.ts` |
| `ScannerOptions` | Options for `createScanner` | `src/scan/scanner.ts` |

Some types used inside these are not exported from the package root, for example
`RuleHit`, `CriterionHits` and `Citation`. Reach them through the exported types,
for example `ClauseReport["failing"][number]`.

## Stability

The public API is what `src/index.ts` exports, plus the shape of the JSON the
tools return. The current version is 0.1.0. Changes to either are recorded in
[CHANGELOG.md](../CHANGELOG.md); read it before you update. A data change bumps
the minor version, and the changelog records the date the data was retrieved.

`eaa-cite/guarded` is a sample with no stability promise.
