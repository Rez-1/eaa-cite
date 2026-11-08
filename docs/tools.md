# MCP tools and resources

Reference for the six tools and two resources the server offers. Checked against
[`src/mcp/server.ts`](../src/mcp/server.ts) and the modules it calls. To set the
server up, see [mcp-setup.md](mcp-setup.md). To make sense of what comes back,
see [results.md](results.md).

## Conventions

Every tool returns one text content item holding JSON, pretty-printed with two
spaces. A client or assistant parses that text.

A tool that cannot answer returns a result with `isError: true` and a plain-text
message instead of JSON. The messages are listed under each tool.

Arguments that fail the input schema are rejected by the MCP SDK before the tool
runs. They also come back as `isError: true`, with text that starts
`MCP error -32602: Input validation error: Invalid arguments for tool <name>:`
followed by what was wrong, for example:

```
MCP error -32602: Input validation error: Invalid arguments for tool get_obligations: Too small: expected string to have >=2 characters at country
```

The `country` argument takes an ISO code of an EU member state, or `EU` for the
directive itself. It is trimmed and case-insensitive, so `se`, `SE` and ` SE `
all work. It must be at least two characters. Published jurisdictions: `EU`,
`SE`, `DE`, `ES`.

All six tools are marked `readOnlyHint: true`. Only `scan_url` is marked
`openWorldHint: true`, because it is the only tool that reaches the network:

| Tool | Reads | Network |
|---|---|---|
| `get_obligations` | checked-in dataset | none |
| `compare_jurisdictions` | checked-in dataset | none |
| `conformance_statement` | checked-in dataset | none |
| `explain_criterion` | checked-in clause 9 table | none |
| `scan_url` | the page at the URL | fetches the URL in Chromium |
| `scan_html` | the markup you pass | none; every request from the markup is blocked |

No model runs inside the server. Two calls with the same input give the same
output, apart from `scan_url` when the page itself changes.

## get_obligations

Every claim for one jurisdiction, each with its resolved citations, plus the
harmonisation status that applies there.

### Input

| Field | Type | Required | Notes |
|---|---|---|---|
| `country` | string, at least 2 characters | yes | See [Conventions](#conventions). |

### Output

| Field | Type | What it holds |
|---|---|---|
| `jurisdiction` | string | The code, upper case: `EU`, `SE`, `DE` or `ES`. |
| `name` | string | For example `Sweden`. |
| `instrument` | string | The law the claims are about, for example `Lag (2023:254) om vissa produkters och tjänsters tillgänglighet`. |
| `claims` | object | One entry per claim id the file records. Each is `{ value, citations, note? }`. Optional claims the file does not record are missing. |
| `claims.<id>.citations[]` | array | Resolved citations: `source` (the whole source object), `pinpoint`, `quote`, `translation` (for non-English sources), `note`. |
| `harmonisation` | object | `status`, `basis`, `checkedAt` and `citations`, the same fields as [`conformance_statement`](#conformance_statement) without the sentence. |
| `unverified` | string[] | What the research looked for and could not confirm from an official source. |

A source object has `id`, `title`, `identifier` (optional), `kind`, `url`,
`language`, `retrievedAt`, `verify` and `note` (optional). The claim ids and the
shape of each value are in [data-format.md](data-format.md#claims).

If national law names an EN 301 549 version, that version is in
`claims.presumptionOfConformity.value.namesEn301549Version`. None of the four
published jurisdictions names one.

A trimmed example, with notes on reading each part, is in
[results.md](results.md#read-an-obligations-answer).

### Errors

| Case | Message |
|---|---|
| Code not published | `No data for "xx". Published: EU, SE, DE, ES` (the code is echoed as given) |
| Code shorter than 2 characters | schema rejection, see [Conventions](#conventions) |

## compare_jurisdictions

One claim side by side for every published jurisdiction.

### Input

| Field | Type | Required | Notes |
|---|---|---|---|
| `claim` | string, one of the claim ids | yes | The ids are listed in [data-format.md](data-format.md#claim-list). |

### Output

| Field | Type | What it holds |
|---|---|---|
| `claim` | string | The claim id asked for. |
| `rows` | array | One row per jurisdiction that records the claim, in the order `EU`, `SE`, `DE`, `ES`. Each row is `{ jurisdiction, value, citations, note? }`, with citations resolved as in `get_obligations`. |
| `absent` | string[] | Jurisdictions whose file has no value for the claim. |

Real output from `npm run demo`, reduced to one line per row:

```
> compare_jurisdictions { claim: "transitionalSelfServiceTerminals" }

  EU: max 20 years  (Article 32(2))
  DE: max 15 years  (BFSG § 38 Absatz 2)
  ES: max 10 years  (Ley 11/2023, disposición transitoria única, apartado 2)
  no data: SE
```

### Errors

The tool has no error messages of its own. A `claim` outside the list is a schema
rejection:

```
MCP error -32602: Input validation error: Invalid arguments for tool compare_jurisdictions: Invalid option: expected one of "applicationDate"|"transpositionDeadline"|...
```

## conformance_statement

The sentence an audit report can print about the standard it assessed against,
and whether it may claim a presumption of conformity.

### Input

| Field | Type | Required | Default |
|---|---|---|---|
| `country` | string, at least 2 characters | yes | |
| `enVersion` | string | no | `EN 301 549 v3.2.1`, or the version national law names |
| `wcagVersion` | string | no | `WCAG 2.1 AA` |

The versions are free text. They are printed into the sentence as given.

### Output

The conformance answer from `conformanceFor`
([`src/dataset/conformance.ts`](../src/dataset/conformance.ts)). Each field is
explained, with a real example, in
[results.md](results.md#read-a-conformance-answer).

### Errors

| Case | Message |
|---|---|
| Code not published | `No data for "FR". Published: EU, SE, DE, ES` |
| National law names a version and `enVersion` is a different one | `<code> law names <version in law>, but the assessment used <enVersion>. The conformance sentence cannot name a version the law does not.` |

None of the published jurisdictions names a version, so the second error cannot
occur with the shipped data.

## explain_criterion

One EN 301 549 v3.2.1 clause 9 criterion.

### Input

| Field | Type | Required | Notes |
|---|---|---|---|
| `ref` | string, at least 5 characters | yes | A WCAG number such as `1.4.3` or an EN clause such as `9.1.4.3`. Surrounding spaces are ignored. |

### Output

Real output for `{ "ref": "1.4.3" }`:

```json
{
  "enClause": "9.1.4.3",
  "wcagRef": "1.4.3",
  "level": "AA",
  "name": "Contrast (Minimum)",
  "wcagUrl": "https://www.w3.org/TR/WCAG21/#contrast-minimum",
  "enPage": 46,
  "enVersion": "EN 301 549 v3.2.1",
  "enSource": {
    "url": "https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf",
    "bytes": 2285361,
    "sha256": "1eee3a1841a94567da8e59f3b19a782ce9ab081c386b6a2a763b8cde13ff5b49",
    "pages": 186
  }
}
```

`enPage` is the 1-based page of the EN PDF where the clause heading is. The
table holds no ETSI requirement text ([ADR 0005](adr/0005-publish-clause-numbers-not-etsi-text.md)).

### Errors

| Case | Message |
|---|---|
| Not one of the 50 criteria | `"2.4.11" is not a clause 9 criterion of EN 301 549 v3.2.1. It covers WCAG 2.1 levels A and AA only; AAA criteria and WCAG 2.2 additions are outside it.` |
| `ref` shorter than 5 characters, such as `1.4` | schema rejection |

## scan_url

Loads a page in headless Chromium, runs axe-core with the WCAG 2.1 A and AA rules
(tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) and files each result under its
clause 9 criterion.

### Input

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | string | yes | An `http:` or `https:` URL. |

The server fetches any http or https URL it is given, including `localhost` and
private network addresses. The assistant chooses the URL, so the server will load
whatever it asks for. Other schemes (`file:`, `data:`, `javascript:`) are
refused, at the start and on every redirect. What this means for where you run
the server is in [SECURITY.md](../SECURITY.md).

The redirect rule. Redirects are followed one hop at a time, up to 10. Where the
scan starts decides where it may go:

- A scan that starts at a private address may navigate anywhere, so a local dev
  server can be scanned.
- A scan that starts at a public address may not navigate to a private one. A
  redirect, or a navigation the page starts itself, to a private address stops
  the scan with an error.

A host is private if it is `localhost`, ends in `.localhost`, or is or resolves
to an address in a loopback, private-network, carrier-grade NAT, link-local or
other local range, including IPv4 written inside IPv6. The full list is in
[`src/scan/privateHost.ts`](../src/scan/privateHost.ts). The rule covers
top-level navigations only. Requests the page makes for images, scripts, styles,
frames or `fetch` are not filtered. Popups the page opens are refused.

The main document is fetched by Node, not the browser, and refused above 20 MB.
The page is loaded until its `load` event, with a 30 second timeout for each
navigation, and the whole scan has a 60 second deadline. The server launches one Chromium on the first scan and reuses it,
launching again after a failed launch or a crash. Each scan gets a fresh browser
context.

### Output

A clause report plus a `caveat` string. See [Scan results](#scan-results).

### Errors

Every scan error comes back as `isError: true` with text that starts
`Scan failed: `.

| Case | Message |
|---|---|
| Not a URL, or a scheme other than http and https (`file:`, `data:`, `javascript:` ...) | `Scan failed: Only http and https URLs can be scanned, got "file:///etc/passwd"` |
| Public start navigated to a private address | `Scan failed: Refused to load <url>: it is a private network address, and the scan started at a public one. Start the scan at a private address (such as localhost) to scan private pages.` |
| More than 10 redirects | `Scan failed: Stopped after 10 redirects from <start URL>` |
| A redirect to a non-http scheme | `Scan failed: Only http and https URLs can be scanned, got "<target>"` |
| Page did not reach `load` in 30 seconds | `Scan failed: ` followed by the first line of Playwright's timeout message for `page.goto` |
| The whole scan took more than 60 seconds | `Scan failed: The scan did not finish within 60 seconds` |
| Page could not be reached | `Scan failed: Could not load <url>: <reason>`, for example `connect ECONNREFUSED 127.0.0.1:9`. The server keeps running. |
| The page's document is over 20 MB | `Scan failed: Refused to load <url>: the document is larger than 20 MB.` |
| Chromium not installed or cannot start | `Scan failed: ` followed by the first line of Playwright's launch error. Run `npx playwright install chromium`. |

Every message is one line. A refused popup does not fail the scan.

## scan_html

The same scan for markup you already have, such as a component's rendered output.

### Input

| Field | Type | Required | Notes |
|---|---|---|---|
| `html` | string, 1 to 2,000,000 characters | yes | A full HTML document or a fragment. |

The markup is set as the page content in an offline browser context: HTTP
requests (images, stylesheets, scripts, fonts), WebSockets, prefetch and service
workers are all refused, so the page cannot call out. Script in the markup still
runs, because axe itself runs as page script. A page that depends on external
CSS is scanned without it, which can change contrast results.

### Output

Same shape as `scan_url`. `url` is always `about:blank (inline HTML)`.

### Errors

| Case | Message |
|---|---|
| Markup did not reach `load` in 30 seconds | `Scan failed: ` followed by Playwright's timeout message |
| Chromium not installed or cannot start | `Scan failed: ` followed by Playwright's launch error |
| Empty string or more than 2,000,000 characters | schema rejection |

## Scan results

Both scan tools return the `ClauseReport` from
[`src/scan/map.ts`](../src/scan/map.ts) with a `caveat` added. There is no
`passed` field. What each group means and what to do with it is in
[results.md](results.md#read-a-scan-report).

| Field | Type | What it holds |
|---|---|---|
| `url` | string | The page's URL after any redirects, or `about:blank (inline HTML)`. |
| `axeVersion` | string or null | The axe-core version that ran, for example `4.14.0`. |
| `failing` | array | Criteria where an axe rule found violations. |
| `needsReview` | array | Criteria where axe could not decide. |
| `notCheckedByAxe` | array | Criteria no axe rule touched on this page: `{ enClause, wcagRef, name }`. |
| `outsideClause9` | array | Rule hits for failed rules that name no clause 9 criterion. |
| `summary` | object | `failing`, `needsReview`, `notCheckedByAxe` (counts of criteria) and `ofCriteria` (50). |
| `caveat` | string | Fixed text saying what the result does not mean. |

Each entry in `failing` and `needsReview`:

| Field | Type | What it holds |
|---|---|---|
| `enClause` | string | For example `9.1.1.1`. |
| `wcagRef` | string | For example `1.1.1`. |
| `level` | `A` or `AA` | |
| `name` | string | The W3C name of the criterion. |
| `wcagUrl` | string | Link into the WCAG 2.1 Recommendation. |
| `rules` | array | Rule hits, most severe first. |

Each rule hit, in `rules` and in `outsideClause9`:

| Field | Type | What it holds |
|---|---|---|
| `ruleId` | string | The axe rule, for example `image-alt`. |
| `help` | string | axe's one-line description. |
| `helpUrl` | string | axe's page for the rule. |
| `impact` | `critical`, `serious`, `moderate` or `minor` | `minor` when axe gives none. |
| `instances` | number | How many elements the rule flagged. |
| `firstTarget` | string | Selector of the first flagged element. |

One rule can appear under more than one criterion when its axe tags name several.
Both lists are sorted by WCAG number. A full example report is in
[results.md](results.md#read-a-scan-report).

## Resources

### eaa://jurisdictions/{code}

The jurisdiction file exactly as checked in, before citations are resolved:
citations name their source by id, and the EU file includes its `harmonisation`
block. MIME type `application/json`.

`{code}` is case-insensitive. Listing resources returns one entry per published
jurisdiction, with lower-case URIs: `eaa://jurisdictions/eu`,
`eaa://jurisdictions/se`, `eaa://jurisdictions/de`, `eaa://jurisdictions/es`.

Reading an unpublished code fails with a JSON-RPC invalid-params error (code
`-32602`) whose message includes `No data for "fr". Published: EU, SE, DE, ES`.

Use this to show the source data. To read values, use `get_obligations`, which
fills in each citation's source. The fields are described in
[data-format.md](data-format.md).

### eaa://criteria/en-301-549-v3.2.1

The clause 9 table: `enVersion`, `wcagVersion`, `sources` (the ETSI PDF and the
W3C Recommendation, each with `url`, `bytes` and `sha256`; the PDF also has
`pages`), `extractedAt`, and the 50 `criteria`. MIME type `application/json`.
