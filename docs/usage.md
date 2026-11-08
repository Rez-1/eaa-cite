# Usage

The same functions sit behind three interfaces: the MCP tools
([`src/mcp/server.ts`](../src/mcp/server.ts)), the `eaa-cite` command
([`src/cli/run.ts`](../src/cli/run.ts)) and the TypeScript library. They give the
same answers. Each section below names all three. To set up an MCP client, see
[mcp-setup.md](mcp-setup.md). Terms follow [CONTEXT.md](../CONTEXT.md).

| Task | MCP tool | CLI | Library |
|---|---|---|---|
| [Read obligations](#obligations) | `get_obligations` | `obligations <code> [claim]` | `getJurisdiction`, `citationsOf` |
| [Compare a claim](#compare-a-claim) | `compare_jurisdictions` | `compare <claim>` | `compareClaim` |
| [Conformance answer](#conformance-answer) | `conformance_statement` | | `conformanceFor` |
| [Look up a criterion](#criteria) | `explain_criterion` | | `findCriterion`, `criteria` |
| [Scan a page](#scan) | `scan_url`, `scan_html` | `scan <url or file>` | `createScanner`, `mapToClauses` |
| [Check a data file](#check-a-jurisdiction-file) | | `check-data <file>` | `parseJurisdictionFile` |

## Common rules

### MCP tools

Every tool returns one text item holding pretty-printed JSON. A tool that cannot
answer returns `isError: true` with a plain-text message; the messages are listed
in each section. Arguments that fail the input schema are rejected by the MCP SDK
before the tool runs, also as `isError: true`:

```
MCP error -32602: Input validation error: Invalid arguments for tool get_obligations: Too small: expected string to have >=2 characters at country
```

All six tools are marked `readOnlyHint: true`. Only `scan_url` is marked
`openWorldHint: true`: it is the only tool that reaches the network. No model
runs inside the server, so the same input gives the same output, apart from
`scan_url` when the page changes.

A `country` argument is an ISO code of an EU member state, or `EU` for the
directive. It is trimmed and case-insensitive, at least two characters.
Published: `EU`, `SE`, `DE`, `ES`. Any other code fails with
`No data for "xx". Published: EU, SE, DE, ES`.

### CLI

```bash
npm run build
node dist/cli/main.js --help
```

`npm run cli -- <command>` runs the TypeScript source directly. After `npm link`,
`eaa-cite <command>` works anywhere. Every command takes `--json`.

| Exit code | Meaning |
|---|---|
| 0 | Done |
| 1 | Bad news: `scan` found clause 9 failures, or `check-data` found a file that does not load. So `eaa-cite scan` can gate a CI step. |
| 2 | The command could not run: wrong arguments, an unknown jurisdiction or claim, or a failed scan |

### Library

The package is not on npm. Clone and build it ([install.md](install.md)), then
add it to your project with `npm install /absolute/path/to/eaa-cite`. npm links
the folder, so a `git pull` and `npm run build` in the clone update your project.

| | |
|---|---|
| Module format | ESM only, Node 22 or later |
| Entry points | `eaa-cite`: dataset, criteria and `mapToClauses` ([`src/index.ts`](../src/index.ts)). `eaa-cite/scan`: the pure clause 9 mapping and axe tag reading ([`src/scan/index.ts`](../src/scan/index.ts)). `eaa-cite/scan/browser`: the scanner, the only entry that loads Playwright ([`src/scan/browser.ts`](../src/scan/browser.ts)). |
| Types | `.d.ts` next to the JavaScript in `dist/`. Use `"moduleResolution": "nodenext"` or `"bundler"`. |

Importing `eaa-cite` loads and checks every jurisdiction file and the clause 9
table, and throws `DatasetIntegrityError` if one is broken. It never starts a
browser. The MCP server factory is not exported; run `dist/mcp/bin.js`, or see
[`test/mcp.test.ts`](../test/mcp.test.ts) for driving it in process.

The public API is what the entry points export plus the JSON the tools return.
Changes are recorded in [CHANGELOG.md](../CHANGELOG.md).

## Obligations

Every claim for one jurisdiction with its resolved citations, plus the
harmonisation status that applies there.

```bash
node dist/cli/main.js obligations se              # every claim
node dist/cli/main.js obligations se penalties    # one claim
```

```ts
import { getJurisdiction, citationsOf, PUBLISHED, isPublished } from "eaa-cite";

const de = getJurisdiction("de"); // any case, trimmed
de.claims.penalties.value.maxFine; // 100000
de.claims.penalties.citations[0].source.url; // "https://www.gesetze-im-internet.de/bfsg/__37.html"
PUBLISHED; // ["EU", "SE", "DE", "ES"]
isPublished("se"); // false: exact upper-case match, unlike getJurisdiction

for (const { place, path, citation } of citationsOf("SE")) console.log(place, path, citation.source.id);
// applicationDate claims.applicationDate.citations[0] sfs-2023-254
```

`get_obligations { country }` returns `jurisdiction`, `name`, `instrument`,
`claims`, `harmonisation` and `unverified`. `getJurisdiction` returns the same
minus `harmonisation` (use `conformanceFor`), plus `sources`. `citationsOf`
lists every citation as `{ place, path, citation }`, with the EU harmonisation
citations last for `EU`. Trimmed, for Germany:

```json
{
  "jurisdiction": "DE",
  "name": "Germany",
  "instrument": "Barrierefreiheitsstärkungsgesetz (BFSG)",
  "claims": {
    "penalties": {
      "value": { "summary": "Administrative fines under § 37. …", "currency": "EUR", "maxFine": 100000, "tiers": [ … ] },
      "citations": [
        {
          "source": { "id": "bfsg-37", "kind": "consolidated-text", "url": "https://www.gesetze-im-internet.de/bfsg/__37.html", "language": "de", "retrievedAt": "2026-11-08", "verify": "quote", … },
          "pinpoint": "BFSG § 37 Absatz 2 (offences listed in § 37 Absatz 1)",
          "quote": "Absatzes 1 Nummer 1, 7, 8, 9 und 10 mit einer Geldbuße bis zu hunderttausend Euro und in den übrigen Fällen … bis zu zehntausend Euro",
          "translation": "in the cases of paragraph 1 numbers 1, 7, 8, 9 and 10, a fine of up to EUR 100,000, and in the other cases up to EUR 10,000"
        }
      ]
    },
    …
  },
  "harmonisation": { "status": "not_cited", "basis": "eu", "checkedAt": "2026-11-08", "citations": [ … ] },
  "unverified": [ "The Länder Staatsvertrag … that founds the MLBF …", … ]
}
```

How to read it:

- Each entry under `claims` is a `value` and at least one citation, sometimes
  with a researcher's `note`. The value fields per claim are in
  [data-format.md](data-format.md#claims). Read the value together with its
  quote.
- `pinpoint` is the exact place in the source. `quote` is verbatim in the
  source's language, with `…` for a part left out. `translation` is unofficial
  and is there for checking the quote; cite the original.
- `source` is the whole source entry. Its `note` can be a legal caveat, so read
  it.
- A claim missing from `claims` means the dataset has no value for it, not that
  the law is silent. Sweden has no `transitionalSelfServiceTerminals`, for
  example.
- `harmonisation` has the fields of a [conformance answer](#conformance-answer)
  without the sentence.
- `unverified` lists what the research could not confirm from an official
  source. Treat each entry as an open question.

The CLI prints each value with every citation, then, without a claim argument,
the `unverified` list.

### Check a citation yourself

1. Open `source.url` and find the `pinpoint`.
2. Find the `quote`. Where it has `…`, each piece appears in that order.
3. Check that the quote supports the `value`. The tooling checks that the quote
   is on the page, not that the value reads it correctly.
4. Look at `retrievedAt`, the date someone last confirmed the quote. A source
   with `verify: "manual"` has only been checked by a person, on that date
   ([verification.md](verification.md)).

## Compare a claim

One claim for every published jurisdiction.

```bash
node dist/cli/main.js compare transitionalSelfServiceTerminals
```

```ts
import { compareClaim } from "eaa-cite";
const t = compareClaim("transitionalSelfServiceTerminals");
t.rows.map((r) => [r.jurisdiction, r.value.maxYearsAfterFirstUse]); // [["EU", 20], ["DE", 15], ["ES", 10]]
t.absent; // ["SE"]
```

`compare_jurisdictions { claim }` takes a claim id from
[data-format.md](data-format.md#claim-list); any other value is a schema
rejection. It returns `{ claim, rows, absent }`. Each row is the claim's
`{ value, citations, note? }` plus `jurisdiction`, in `PUBLISHED` order, and
`row.value` is typed by the claim id. `absent` lists jurisdictions with no value.
The CLI prints the first citation of each row.

## Conformance answer

What an audit report may say about the standard it assessed against, in one
jurisdiction.

```ts
import { conformanceFor, DEFAULT_EN_VERSION, DEFAULT_WCAG_VERSION } from "eaa-cite";
conformanceFor("SE").mayClaimPresumptionOfConformity; // false
conformanceFor("ES", { wcagVersion: "WCAG 2.2 AA" }).wcagVersion; // "WCAG 2.2 AA"
```

`conformance_statement { country, enVersion?, wcagVersion? }` and
`conformanceFor(code, { enVersion?, wcagVersion? })` return the same answer. The
versions are free text, printed into the sentence as given. For Germany:

```json
{
  "status": "not_cited",
  "basis": "eu",
  "enVersion": "EN 301 549 v3.2.1",
  "wcagVersion": "WCAG 2.1 AA",
  "mayClaimPresumptionOfConformity": false,
  "sentence": "The site was assessed against EN 301 549 v3.2.1 (WCAG 2.1 AA) as a technical benchmark. No version of EN 301 549 is currently cited in the Official Journal of the European Union under Directive (EU) 2019/882, so no presumption of conformity is available through a harmonised standard, to this site or to any other.",
  "checkedAt": "2026-11-08",
  "citations": [ { "source": { "id": "commission-harmonised-standards", … }, "pinpoint": "…", "quote": "Websites and mobile applications of public sector bodies", "jurisdiction": "EU" }, … ]
}
```

| Field | Meaning |
|---|---|
| `status` | `cited`, `not_cited` or `national_only` ([data-format.md](data-format.md#harmonisation-status)). |
| `basis` | `eu` from the EU file, or `national-law` when the member state's law names an EN 301 549 version ([how it is worked out](data-format.md#conformance-answer)). |
| `enVersion` | The version in law if there is one, else the caller's, else `DEFAULT_EN_VERSION` (EN 301 549 v3.2.1). |
| `wcagVersion` | The caller's, else `DEFAULT_WCAG_VERSION` (WCAG 2.1 AA). |
| `sentence` | Fixed wording per status, in `src/standards/harmonisation.ts`. Print it as it is. The sentences are not exported, so the checks always run first. |
| `mayClaimPresumptionOfConformity` | `true` only when `status` is `cited`. |
| `checkedAt` | The oldest `retrievedAt` among the cited sources. |
| `citations` | The evidence, each tagged with the `jurisdiction` whose file it comes from. |

As of 2026-11-08 the status is `not_cited` everywhere. Why EN 301 549's citation
under the Web Accessibility Directive does not count is in
[ADR 0003](adr/0003-harmonisation-status-has-three-values.md).

Errors: an unpublished code (`UnknownJurisdictionError`), and, when national law
names a version and `enVersion` is another (`VersionMismatchError`):
`<code> law names <version>, but the assessment used <enVersion>. The conformance sentence cannot name a version the law does not.`
No published jurisdiction names a version, so the second cannot occur with the
shipped data.

## Criteria

One of the 50 EN 301 549 v3.2.1 clause 9 criteria, by WCAG number or EN clause.

```ts
import { findCriterion, criteria, criteriaFile } from "eaa-cite";
findCriterion("2.4.7"); // { enClause: "9.2.4.7", wcagRef: "2.4.7", level: "AA", name: "Focus Visible", wcagUrl: "…", enPage: 48 }
findCriterion("2.4.11"); // undefined: a WCAG 2.2 addition, outside clause 9
criteria.length; // 50
```

`explain_criterion { ref }` (at least 5 characters, trimmed) returns the same
row plus `enVersion` and `enSource` (the ETSI PDF's `url`, `bytes`, `sha256`,
`pages`). `enPage` is the 1-based PDF page of the clause heading. A ref outside
the 50 fails with
`"2.4.11" is not a clause 9 criterion of EN 301 549 v3.2.1. It covers WCAG 2.1 levels A and AA only; AAA criteria and WCAG 2.2 additions are outside it.`
The table holds no ETSI text ([ADR 0005](adr/0005-publish-clause-numbers-not-etsi-text.md));
its format is in [data-format.md](data-format.md#clause-9-criteria-table).

## Scan

Runs axe-core in headless Chromium with the WCAG 2.1 A and AA rules (tags
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) plus WCAG 2.2 AA, and files each
result under its clause 9 criterion. Install Chromium first:
`npx playwright install chromium`.

```bash
node dist/cli/main.js scan https://shop.example/
node dist/cli/main.js scan page.html       # a local file, scanned as HTML
```

```ts
import { createScanner } from "eaa-cite/scan/browser";
const scanner = createScanner({ timeoutMs: 15_000 });
try {
  const report = await scanner.scanHtml(html); // or scanner.scanUrl("http://localhost:3000")
  report.summary; // { failing: 4, needsReview: 0, notCheckedByAxe: 43, ofCriteria: 50 }
} finally {
  await scanner.close();
}
```

`createScanner(options?)` returns a `BrowserScanner` that owns one Chromium: it
launches on the first scan, relaunches after a failed launch or a crash, and
shuts down on `close()`. Each scan gets a fresh browser context. Options are
`timeoutMs` (each navigation, default 30,000) and, for tests, `launch` and
`isPrivateHost`. If you run axe yourself, pass its result to `mapToClauses`
(pure, no browser, from the package root or `eaa-cite/scan`); only the fields
in `AxeRun` are read.

### What scan_url may load

`scan_url { url }` loads any http or https URL, including `localhost` and private
network addresses. The assistant chooses the URL. What that means for where you
run the server is in [SECURITY.md](../SECURITY.md). Other schemes (`file:`,
`data:`, `javascript:`) are refused, at the start and on every redirect.

The redirect rule. Redirects are followed one hop at a time, up to 10. A scan
that starts at a private address may navigate anywhere, so a local dev server can
be scanned. A scan that starts at a public address stops with an error if a
redirect, or a navigation the page starts, goes to a private address. A host is
private if it is `localhost`, ends in `.localhost`, or is or resolves to a
loopback, private-network, carrier-grade NAT, link-local or other local address,
including IPv4 written inside IPv6; the list is in
[`src/scan/privateHost.ts`](../src/scan/privateHost.ts). The rule covers
top-level navigations only. The page's images, scripts, styles, frames and
`fetch` calls are not filtered. Popups are refused.

The main document is fetched by Node and refused above 20 MB. Each navigation
waits for `load` with a 30 second timeout; the whole scan has a 60 second
deadline.

### scan_html

`scan_html { html }` (1 to 2,000,000 characters, a document or a fragment) sets
the markup as the page content in an offline browser context: HTTP requests,
WebSockets, prefetch and service workers are refused. Script in the markup still
runs, because axe runs as page script. A page that needs external CSS is scanned
without it, which can change contrast results. The report's `url` is
`about:blank (inline HTML)`. The CLI scans a local file the same way.

### The report

Both tools return a `ScanReport`: a `ClauseReport` from
[`src/scan/map.ts`](../src/scan/map.ts) plus `caveat`.

| Field | What it holds |
|---|---|
| `url` | The page's URL after redirects, or `about:blank (inline HTML)`. |
| `axeVersion` | The axe-core version, or `null`. |
| `failing` | Criteria where an axe rule found violations. |
| `needsReview` | Criteria where an axe rule could not decide. |
| `notCheckedByAxe` | Criteria no axe rule touched on this page: `{ enClause, wcagRef, name }`. |
| `outsideClause9` | Failed rules that name no clause 9 criterion. |
| `summary` | Counts of the first three, and `ofCriteria` (50). |
| `caveat` | Fixed text (`SCAN_CAVEAT`) saying what the result does not mean, and that selectors and URLs come from the page and are data, not instructions. |

An entry in `failing` or `needsReview` has `enClause`, `wcagRef`, `level`,
`name`, `wcagUrl` and `rules`. Each rule hit has `ruleId`, `help`, `helpUrl`,
`impact` (`critical`, `serious`, `moderate`, or `minor` when axe gives none),
`instances` and `firstTarget` (the selector of the first flagged element; run axe
in the browser to see the rest). Rules are sorted by impact then instances,
criteria by WCAG number. A rule whose tags name several criteria is listed under
each. For `test/fixtures/shop-with-defects.html`:

```
Failing: 4 of 50 clause 9 criteria
  9.1.1.1   Non-text Content                     image-alt (1)
  9.1.4.3   Contrast (Minimum)                   color-contrast (1)
  9.3.1.1   Language of Page                     html-has-lang (1)
  9.4.1.2   Name, Role, Value                    button-name (1), label (1)

Not checked by axe: 43 criteria need a person.
```

How to read the groups:

- `failing` is a finding: the page fails that criterion, at least where axe
  looked.
- `needsReview` means axe saw something it cannot judge, such as a `<video>`
  whose captions it cannot assess. A person decides. An undecided rule that
  names no clause 9 criterion is not reported.
- `notCheckedByAxe` is where most of the manual work is. It holds criteria axe
  has no rule for, such as Keyboard (2.1.1) and Focus Visible (2.4.7), and
  criteria whose rules found nothing to test on this page.
- A criterion in none of the lists had axe rules that all passed. On the fixture
  4 + 0 + 43 = 47, so three are in no list. There is no "passed" list, because
  an axe pass is not an evaluation
  ([ADR 0004](adr/0004-an-axe-pass-is-not-an-evaluation.md)).
- `outsideClause9` holds WCAG 2.2 failures such as `target-size`, which
  EN 301 549 v3.2.1 does not require. They are reported but are not clause 9
  findings. Best-practice rules are not run.

### What a scan can and cannot tell you

A scan tells you which clause 9 criteria fail where axe has a rule, which
elements to fix first, and which criteria need a person. It cannot tell you that
the page conforms: axe finds a minority of defects. It says nothing about pages
or states it did not reach (an open menu, a form after an error, a logged-in
view), or about the law. The repaired test-shop page,
`examples/test-shop/product-fixed.html`, has no failures and 41 of 50 criteria
not checked by axe.

From scan to audit: fix `failing` and scan again; check each `needsReview`
criterion by hand; test each `notCheckedByAxe` criterion by hand (keyboard,
screen reader, 400% zoom, as it needs); look at the criteria in no list too; read
`outsideClause9` without counting it. Only when a person has recorded how all 50
were evaluated can a report say the page meets clause 9.

### Scan errors

Tool errors start `Scan failed: ` and are one line. The library throws the error
itself; Playwright errors pass through unchanged.

| Case | Message |
|---|---|
| Not http or https, at the start or on a redirect (`UnsupportedUrlError`) | `Only http and https URLs can be scanned, got "file:///etc/passwd"` |
| Public start navigated to a private address (`BlockedNavigationError`, with `url`) | `Refused to load <url>: it is a private network address, and the scan started at a public one. Start the scan at a private address (such as localhost) to scan private pages.` |
| More than 10 redirects | `Stopped after 10 redirects from <start URL>` |
| No `load` within 30 seconds | the first line of Playwright's timeout message |
| Whole scan over 60 seconds | `The scan did not finish within 60 seconds` |
| Page unreachable (the server keeps running) | `Could not load <url>: <reason>`, for example `connect ECONNREFUSED 127.0.0.1:9` |
| Document over 20 MB | `Refused to load <url>: the document is larger than 20 MB.` |
| Chromium missing or cannot start | the first line of Playwright's launch error |
| `html` empty or over 2,000,000 characters | schema rejection |

## Check a jurisdiction file

Runs the schema and the [load rules](data-format.md#load-rules) on one file
before a pull request.

```bash
node dist/cli/main.js check-data my-edits/es.json
node dist/cli/main.js check-data draft.json --as DE   # check as another jurisdiction
# data/jurisdictions/es.json loads: ES, 9 claims, 16 citations, 3 sources.
```

```ts
import { parseJurisdictionFile, DatasetIntegrityError } from "eaa-cite";
try {
  const { cited, harmonisation } = parseJurisdictionFile(json, "SE");
} catch (error) {
  if (error instanceof DatasetIntegrityError) error.problems; // ["jurisdiction: declares DE, but the file is for SE"]
}
```

The file is checked as the jurisdiction its name gives, unless `--as` (or the
`expected` argument) says otherwise. A file that does not load gets every problem
at once: schema errors first, then, if the schema passes, the load rules.
`error.file` is `jurisdictions/<code>.json`, or `jurisdiction file` without
`expected`. On success it returns `{ cited, harmonisation, citations }`:
`harmonisation` is the EU block with resolved citations (`null` for a member
state), and `citations` lists every resolved citation in file order. Quote length is checked by `npm test`, and source age by
`npm run verify-sources`.

## Resources

| URI | Content |
|---|---|
| `eaa://jurisdictions/{code}` | The jurisdiction file as checked in, before citations are resolved, including the EU `harmonisation` block. `{code}` is case-insensitive; the listing uses lower case. An unpublished code fails with JSON-RPC error `-32602` and `No data for "fr". Published: EU, SE, DE, ES`. |
| `eaa://criteria/en-301-549-v3.2.1` | The clause 9 table. |

Both are `application/json` and make no network requests.

## Library errors and types

| Error | Thrown by | Extra fields |
|---|---|---|
| `UnknownJurisdictionError` | `getJurisdiction`, `citationsOf`, `conformanceFor` | |
| `VersionMismatchError` | `conformanceFor` | `jurisdiction`, `namedInLaw`, `assessed` |
| `DatasetIntegrityError` | `parseJurisdictionFile`, and importing the package if a shipped file is broken | `file`, `problems` |
| `UnsupportedUrlError`, `BlockedNavigationError` (`eaa-cite/scan/browser`) | `assertScannableUrl`, `scanner.scanUrl` | `url` on the second |

`eaa-cite` exports the types `Published`, `JurisdictionFile`, `Claims`,
`ClaimId`, `Source`, `CitedJurisdiction`, `CitedClaims`, `ResolvedCitation`,
`CitationEntry`, `CitationPlace`, `ConformanceAnswer`, `Assessed`,
`ClaimComparison`, `Criterion`, `AxeRun` and `ClauseReport`. `eaa-cite/scan`
adds `RuleHit`, `CriterionHits`, `AxeRuleResult` and `Impact`;
`eaa-cite/scan/browser` adds `ScanReport`, `Scanner`, `BrowserScanner` and
`ScannerOptions`. Other types are reached through these, for example
`JurisdictionFile["claims"]["penalties"]["citations"][number]`.
