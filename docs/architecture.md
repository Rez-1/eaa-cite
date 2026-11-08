# Architecture

A map of the code for reviewers. The reasons behind each decision are in the
ADRs, linked at the end. Terms follow [CONTEXT.md](../CONTEXT.md).

## Why citations

Scanners report which WCAG criteria a page fails. The next question is what the
law says about it, and that is usually answered from memory or a blog post. The
values that matter most (the highest fine, whether a small business is exempt,
how long an old contract may run) are the ones most often paraphrased wrong or
copied from a neighbouring country.

So every value is a claim, and a claim cannot exist without a citation: a source,
a pinpoint, a verbatim quote and an English translation. A file that breaks this
does not load, and a weekly job checks every quote against its live source.
[ADR 0001](adr/0001-every-claim-carries-its-citation.md) has the full argument.

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
| `build-criteria.ts` | `npm run build:criteria` | downloads the ETSI PDF and WCAG 2.1, parses both, writes the criteria table |
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

### standards

`src/standards/harmonisation.ts`. The three harmonisation status values and the
fixed conformance sentences. The wording lives here so a change to it is a diff
someone reviews.

### criteria

`src/criteria/`. `source.ts` parses the EN 301 549 text and the WCAG 2.1
Recommendation and refuses any disagreement between them. `index.ts` loads the
checked-in table and offers `findCriterion`. The table holds clause numbers and
W3C names, and no ETSI text ([ADR 0005](adr/0005-publish-clause-numbers-not-etsi-text.md)).

### scan

`src/scan/`.

- `scanner.ts`: `createScanner` owns Chromium. It launches the browser on the
  first scan, launches again after a failed launch or a crash, runs axe-core with
  the WCAG 2.1 A and AA tags, and returns the scan report with its caveat. It
  also holds `assertScannableUrl`, which refuses anything but http and https,
  and `openWithRedirectRule`, which follows redirects one hop at a time and
  refuses a private address after a public start.
- `privateHost.ts`: `isPrivateHost`, the private-address check behind the
  redirect rule.
- `axeTags.ts`: reads WCAG numbers out of axe rule tags.
- `map.ts`: `mapToClauses` sorts an axe result into failing, needs review and
  not checked by axe. It is pure, so it is tested without a browser.
- `index.ts`: the pure parts only, so importing them does not load Playwright.

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

### guarded

`src/guarded/`. A spend-capped wrapper for structured LLM calls. Nothing else in
the repo imports it, and the server calls no model. It is a sample with no
stability promise. See [docs/guarded.md](guarded.md).

## Seams

Three interfaces where a different implementation can be plugged in:

| Seam | Defined in | Used for |
|---|---|---|
| `Scanner` | `src/scan/scanner.ts` | the server's scan tools. `bin.ts` passes `createScanner()`; the MCP tests pass a fake that returns a fixed scan report. A second scan engine would be another `Scanner` ([ADR 0002](adr/0002-axe-core-is-the-only-scanner.md)). |
| `SpendLedger` | `src/guarded/ledger.ts` | where `runStructured` records runs and reads spend back. Ships as `MemoryLedger` and `JsonlLedger`. `ledgerContract` (`src/guarded/ledger.contract.ts`) is the test a new ledger must pass. |
| `ModelClient` | `src/guarded/run.ts` | the model provider behind `runStructured`. Ships as `anthropicClient`. |

## Testing approach

- Load rules are tested by breaking copies of the real jurisdiction files and
  checking the problems the loader reports (`test/dataset.test.ts`).
- Editorial rules (quote length, source age, official domains) run against the
  shipped data in the same file. They are tests, not load checks, so the package
  keeps working after a source passes its age limit.
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
6. [Spend caps are code, not prompt instructions](adr/0006-spend-caps-are-code.md): how `eaa-cite/guarded` limits spend.

## Where this came from

eaa-cite is the public part of a private audit system.
[docs/case-study.md](case-study.md) describes that system and lists which parts
moved here.
