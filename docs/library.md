# Using eaa-cite as a library

The package root, `eaa-cite`, exports the dataset lookups, the clause 9 table
and the pure clause 9 mapping ([`src/index.ts`](../src/index.ts)). The scanner
is its own entry, `eaa-cite/scan` ([`src/scan/index.ts`](../src/scan/index.ts)),
because it loads Playwright. `eaa-cite/guarded` is a separate sample described in
[guarded.md](guarded.md).

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
| Entry points | `eaa-cite`, `eaa-cite/scan` and `eaa-cite/guarded` |
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

`conformanceFor(code, assessed?)` takes an `Assessed` (`{ enVersion?, wcagVersion? }`)
and returns a `ConformanceAnswer`, whose fields are explained in
[results.md](results.md#read-a-conformance-answer). `enVersion` is the version in
law if there is one, else `assessed.enVersion`, else `DEFAULT_EN_VERSION`.
`wcagVersion` is `assessed.wcagVersion`, else `DEFAULT_WCAG_VERSION`.

It throws `UnknownJurisdictionError` for an unpublished code, and
`VersionMismatchError` when the law names a version and `enVersion` is a
different one.

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

Import the scanner from `eaa-cite/scan`. The package root does not load
Playwright, so importing the dataset never loads a browser library.

`createScanner` returns a scanner that owns one Chromium. It launches Chromium
on the first scan, launches it again after a failed launch or a crash, and shuts
it down on `close()`. Install Chromium first: `npx playwright install chromium`.

```ts
import { readFile } from "node:fs/promises";
import { createScanner } from "eaa-cite/scan";

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
| `mapToClauses(run)` | Maps an axe-core result (`AxeRun`) onto clause 9 and returns a `ClauseReport`. Pure, no browser. Use it if you run axe yourself. Also exported from the package root. |
| `BlockedNavigationError`, `UnsupportedUrlError` | The scan errors in [Errors](#errors). |

`scanUrl` and `scanHtml` behave as the `scan_url` and `scan_html` tools do,
including the redirect rule and the blocked requests; see
[tools.md](tools.md#scan_url) and [tools.md](tools.md#scan_html). The report fields are listed in
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

## The MCP server

The server factory is not exported. To run the server, start
`dist/mcp/bin.js` from a client ([mcp-setup.md](mcp-setup.md)).
[`test/mcp.test.ts`](../test/mcp.test.ts) shows how the repo's own tests drive it
in process, with a fake `Scanner`.

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
rules ([data-format.md](data-format.md#load-rules)).

## Errors

| Error | Thrown by | Message | Extra fields |
|---|---|---|---|
| `UnknownJurisdictionError` | `getJurisdiction`, `citationsOf`, `conformanceFor` | `No data for "FR". Published: EU, SE, DE, ES` | |
| `VersionMismatchError` | `conformanceFor` | `<code> law names <version>, but the assessment used <enVersion>. The conformance sentence cannot name a version the law does not.` | `jurisdiction`, `namedInLaw`, `assessed` |
| `DatasetIntegrityError` | `parseJurisdictionFile`, and importing the package if a shipped file is broken | `<file> does not load:` followed by one `  - <problem>` line per problem | `file`, `problems` |
| `UnsupportedUrlError` (from `eaa-cite/scan`) | `assertScannableUrl`, `scanner.scanUrl` | `Only http and https URLs can be scanned, got "<url>"` | |
| `BlockedNavigationError` (from `eaa-cite/scan`) | `scanner.scanUrl` | `Refused to load <url>: it is a private network address, and the scan started at a public one. Start the scan at a private address (such as localhost) to scan private pages.` | `url` |

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
| `Scanner` | `scanUrl` and `scanHtml` | `src/scan/scanner.ts` |
| `BrowserScanner` | `Scanner` plus `close()` | `src/scan/scanner.ts` |
| `ScannerOptions` | Options for `createScanner` | `src/scan/scanner.ts` |

`ScanReport`, `Scanner`, `BrowserScanner` and `ScannerOptions` come from
`eaa-cite/scan`, which also exports `RuleHit` and `CriterionHits`. Types not
exported anywhere, such as `Citation`, are reached through the exported types,
for example `JurisdictionFile["claims"]["penalties"]["citations"][number]`.

## Stability

The public API is what `src/index.ts` and `src/scan/index.ts` export, plus the
shape of the JSON the tools return. The current version is 0.1.0. Changes to either are recorded in
[CHANGELOG.md](../CHANGELOG.md); read it before you update. A data change bumps
the minor version, and the changelog records the date the data was retrieved.

`eaa-cite/guarded` is a sample with no stability promise.
