# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Versioning

- Releases are git tags with a matching GitHub release, made by the maintainer.
  The package is not published to npm.
- A change to `data/` bumps the minor version. Each release that changes data
  records the date the data was retrieved.
- `eaa-cite/guarded` is a sample and has no stability promise.

## [Unreleased]

Data retrieved 2026-11-08.

### Added

- Jurisdiction files for the EU directive (Directive (EU) 2019/882), Sweden
  (Lag (2023:254)), Germany (BFSG) and Spain (Ley 11/2023, título I). Every value
  is a claim with at least one citation: source, pinpoint, verbatim quote and an
  English translation for non-English sources. Each file lists what could not be
  confirmed under `unverified`.
- The EN 301 549 v3.2.1 clause 9 table: 50 WCAG 2.1 A and AA criteria with their
  EN clause numbers and PDF pages, and the SHA-256 of the ETSI PDF and the WCAG
  page it was built from. `npm run build:criteria` regenerates it.
- Harmonisation status with three values (`cited`, `not_cited`, `national_only`),
  recorded once in the EU file. All four jurisdictions are `not_cited`.
- Load rules: a jurisdiction file loads only if it passes the schema, declares the
  jurisdiction it is named for, keeps the harmonisation block in the EU file only,
  has unique source ids, cites only listed sources, cites every listed source, and
  translates every non-English quote. Every object is strict, so a misspelt key
  is an error. A broken file fails with every problem listed in one
  `DatasetIntegrityError`.
- `conformanceFor`: the conformance answer per jurisdiction, with the fixed
  sentence, the EN version it names, and `checkedAt` set to the oldest cited
  source's retrieval date. Refuses an assessment against a version other than
  the one national law names.
- MCP server over stdio with six read-only tools (`get_obligations`,
  `compare_jurisdictions`, `conformance_statement`, `explain_criterion`,
  `scan_url`, `scan_html`) and two resources (`eaa://jurisdictions/{code}`,
  `eaa://criteria/en-301-549-v3.2.1`). No model runs inside it.
- axe-core scans in headless Chromium, mapped onto clause 9 as failing, needs
  review and not checked by axe, with no "passed" list. `createScanner` owns the
  browser and relaunches it after a failed launch or a crash. An unreachable page
  fails the scan with a tool error; the server keeps running.
- A redirect rule for `scan_url`: a scan that starts at a public address follows
  up to 10 redirects and stops with `BlockedNavigationError` if the page
  navigates to a private address. Private covers loopback, 0.0.0.0/8, the
  RFC 1918 ranges, carrier-grade NAT, link-local, and the IPv6 equivalents,
  including IPv4 written inside IPv6.
- `npm run verify-sources`: re-reads every source and checks each quote is still
  there. Never edits the data.
- `npm run demo`: starts the server over stdio and calls three tools.
- The `eaa-cite` command: `scan` (exits 1 on clause 9 failures), `obligations`,
  `compare` and `check-data`, each with `--json`. See `docs/cli.md`.
- A five-page test shop with planted defects (`examples/test-shop/`) and an
  `expected.json` written before the first scan. `npm run try` scans it through
  the server and writes `examples/RESULTS.md`; `--w3c` adds W3C's Before and
  After Demonstration site.
- `eaa-cite/guarded`: a spend-capped wrapper for structured LLM calls, with
  `MemoryLedger`, `JsonlLedger`, a `ledgerContract` test for other ledgers, and
  an Anthropic adapter that loads the SDK only when it is first called.
- ADRs 0001 to 0006, a case study of the private system this came from, and
  `CONTEXT.md` as the glossary.
- CI on every push to `main` and every pull request: typecheck, tests, build and
  `npm run demo`.
- A `verify-sources` workflow that runs weekly and on every pull request that
  touches `data/`. When the weekly run fails, it opens an issue labelled
  `verify-sources`, or comments on the open one.
- Documentation in `docs/`, plus `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md` and this changelog.

### Fixed

- The stdio server now exits when its client closes stdin. Before, a server that
  had started Chromium kept running after the client left, so each MCP session
  left a server and a browser behind, and the CI step that runs the demo hung.

## Contributors

Each person whose code, data or docs change is merged is listed here by name.
