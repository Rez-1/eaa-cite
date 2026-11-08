# Architecture

A map of the code for reviewers. The reasons behind each decision are in the
ADRs, linked at the end; why every value carries a citation is
[ADR 0001](adr/0001-every-claim-carries-its-citation.md). Terms follow
[CONTEXT.md](../CONTEXT.md).

## Layout of the repo

| Path | What it holds |
|---|---|
| `src/` | the library and the MCP server |
| `data/jurisdictions/` | one jurisdiction file per jurisdiction |
| `data/en-301-549-v3.2.1-clause9.json` | the clause 9 criteria table |
| `scripts/` | command-line tools run with `tsx` |
| `test/` | tests that cross modules, plus fixtures |
| `examples/` | the test shop and its results ([examples/README.md](../examples/README.md)) |
| `docs/` | these docs, the ADRs and the case study |

Unit tests sit next to their module as `*.test.ts`.

### scripts/

| Script | Command | What it does |
|---|---|---|
| `build-criteria.ts` | `npm run build:criteria` | downloads the ETSI PDF and WCAG 2.1, parses both with `lib/criteriaSource.ts`, writes the criteria table |
| `verify-sources.ts` | `npm run verify-sources` | re-reads every source and checks each quote ([docs/verification.md](verification.md)) |
| `demo.ts` | `npm run demo` | starts the server over stdio and calls three tools |
| `try-test-shop.ts` | `npm run try` | scans the test shop through the server and writes `examples/RESULTS.md` |

## How data flows

```
data/jurisdictions/se.json          (jurisdiction file: citations name a source id)
        │
        │  parseJurisdictionFile    schema + load rules; throws DatasetIntegrityError
        ▼
cited jurisdiction                  (each citation carries its whole source)
        │
        ├── getJurisdiction ──────► get_obligations
        ├── compareClaim ─────────► compare_jurisdictions
        └── conformanceFor ───────► conformance_statement
              ▲                     (and the harmonisation block of get_obligations)
              │
        EU file's harmonisation block


Chromium + axe-core ── mapToClauses ──► scan report ──► scan_url / scan_html
                            ▲
                  clause 9 criteria table
```

Every jurisdiction file is loaded and checked once, when `src/dataset/index.ts`
is first imported. A broken file stops the process at start-up, not at the first
call.

## Modules

### dataset

`src/dataset/`. Owns everything about claims and citations.

- `schema.ts`: the Zod schema for a jurisdiction file. A claim without a
  citation cannot be represented.
- `load.ts`: `parseJurisdictionFile` and the load rules, kept in one `RULES`
  list. Turns a jurisdiction file into a cited jurisdiction.
- `index.ts`: the published list (`PUBLISHED`) and the queries:
  `getJurisdiction`, `citationsOf`, `compareClaim`, `conformanceFor`.
- `conformance.ts`: works out the conformance answer from the EU harmonisation
  block and the member state's own law.
- `quotes.ts`: reduces HTML to readable text and matches a quote against it.
  Used by `scripts/verify-sources.ts`.
- `officialHosts.ts`: the hosts a source may be on. A load rule enforces it, and
  `verify-sources` follows redirects only between these hosts.

### standards

`src/standards/harmonisation.ts`. The three harmonisation status values and the
fixed conformance sentences. The wording lives here so a change to it is a diff
someone reviews.

### criteria

`src/criteria/index.ts` loads the checked-in table, validates it and offers
`findCriterion`. The table is built by `scripts/build-criteria.ts`, whose parsers
(`scripts/lib/criteriaSource.ts`) read the EN 301 549 text and the WCAG 2.1
Recommendation and refuse any disagreement between them. The table holds clause numbers and
W3C names, and no ETSI text ([ADR 0005](adr/0005-publish-clause-numbers-not-etsi-text.md)).

### scan

`src/scan/`.

- `scanner.ts`: `createScanner` owns Chromium. It launches the browser on the
  first scan, launches again after a failed launch or a crash, runs axe-core with
  the WCAG 2.1 A and AA tags plus WCAG 2.2 AA, and returns the scan report with
  its caveat. Each scan has a deadline and reports errors in one line. It also
  holds `assertScannableUrl`, which refuses anything but http and https, and
  `openWithRedirectRule`, which applies the redirect rule
  ([usage.md](usage.md#what-scan_url-may-load)) and refuses popups.
- `fetchDocument.ts`: fetches each main-frame document in Node, without
  following redirects and with a 20 MB cap, so the browser never receives an
  unbounded body.
- `privateHost.ts`: `isPrivateHost`, the private-address check behind the
  redirect rule. The resolver is a parameter, so its tests need no DNS.
- `axeTags.ts`: reads WCAG numbers out of axe rule tags.
- `map.ts`: `mapToClauses` sorts an axe result into failing, needs review and
  not checked by axe. It is pure, so it is tested without a browser.
- `index.ts` and `browser.ts`: the two package entries. `eaa-cite/scan` is the
  pure part (`axeTags.ts`, `map.ts`); `eaa-cite/scan/browser` is the scanner and
  the only entry that loads Playwright. `test/entry.test.ts` fails if Playwright
  becomes reachable from the root, `scan` or `criteria` entries.

### cli

`src/cli/`.

- `run.ts`: the four commands (`scan`, `obligations`, `compare`, `check-data`).
  Each calls one function the MCP tools also use and formats the answer as text
  or JSON. Output and the scanner are injected, so the tests need no process.
- `main.ts`: the `eaa-cite` entry point. Sets the exit code from `run`.

### mcp

`src/mcp/`.

- `server.ts`: `createServer` registers the six tools and two resources. It
  holds no logic of its own beyond formatting: each tool calls one function from
  `dataset`, `criteria` or `scan`. Two helpers turn errors into tool results:
  `lookup` for the dataset tools (caller errors become tool errors) and
  `scanned` for the scan tools. It also exports the result types, such as
  `Obligations`, that `scripts/lib/mcpClient.ts` uses.
- `bin.ts`: the stdio entry point. Passes `createScanner()` to the server and
  closes it on shutdown. Lookups never start a browser.

## Seam

One interface where a different implementation can be plugged in:

| Seam | Defined in | Used for |
|---|---|---|
| `Scanner` | `src/scan/scanner.ts` | the server's scan tools. `bin.ts` passes `createScanner()`; the MCP tests pass a fake that returns a fixed scan report. A second scan engine would be another `Scanner` ([ADR 0002](adr/0002-axe-core-is-the-only-scanner.md)). |

## Testing approach

- Load rules are tested by breaking copies of the real jurisdiction files and
  checking the problems the loader reports (`test/dataset.test.ts`).
- Editorial rules (quote length, the application date, no future retrieval
  dates, the evidence a `cited` status needs) run against the shipped data in
  the same file. Source age is checked by `verify-sources`, so the package keeps
  working after a source passes its age limit.
- MCP contract tests drive the server through a real MCP client
  (`test/mcp.test.ts`).
- Chromium scans the fixtures in `test/fixtures/` and the test shop in
  `examples/test-shop/` (`test/scan.browser.test.ts`, `test/test-shop.test.ts`).
  The same browser tests cover relaunching after a crash and the redirect rule,
  against a local server with redirects.
- Fixed legal wording is compared as whole strings
  (`src/standards/harmonisation.test.ts`).

## Design decisions

1. [Every claim carries its citation](adr/0001-every-claim-carries-its-citation.md): a value without a citation cannot be represented or loaded.
2. [axe-core is the only scanner](adr/0002-axe-core-is-the-only-scanner.md): Pa11y and Lighthouse would re-report the same violations.
3. [Harmonisation status has three values and is recorded once, at EU level](adr/0003-harmonisation-status-has-three-values.md): keeps the EAA apart from the Web Accessibility Directive.
4. [An axe pass is not an evaluation of a criterion](adr/0004-an-axe-pass-is-not-an-evaluation.md): why scans have no "passed" list.
5. [Publish clause numbers, not ETSI's text](adr/0005-publish-clause-numbers-not-etsi-text.md): what the criteria table holds and why.

## Where this came from

eaa-cite is the public part of a private audit system.
[docs/case-study.md](case-study.md) describes that system and lists which parts
moved here.
