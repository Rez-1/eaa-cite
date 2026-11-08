# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Nothing is tagged yet; track `main`. Once releases start they will be git tags
with a GitHub release. A change to `data/` bumps the minor version and records
the date the data was retrieved. `eaa-cite/guarded` is a sample and has no
stability promise.

## [Unreleased]

Data retrieved 2026-11-08.

### Added

- Cited jurisdiction files for the EU directive, Sweden, Germany and Spain, the
  harmonisation status, and the EN 301 549 v3.2.1 clause 9 table.
- Load rules, `conformanceFor`, `npm run verify-sources` and its workflow.
- The MCP server, the `eaa-cite` command, and axe-core scans mapped onto
  clause 9, with the redirect rule for `scan_url`.
- The test shop with `expected.json`, `npm run demo` and `npm run try`.
- `eaa-cite/guarded`: a spend-capped wrapper for structured LLM calls, with
  `MemoryLedger`, `JsonlLedger`, a `ledgerContract` test for other ledgers, and
  an Anthropic adapter that loads the SDK only when it is first called.
- After review: fines must be in the jurisdiction's currency, every number and
  date in a value must appear in its citations, and citations can list `absent`
  phrases, used to notice an EAA standard citation on the Commission's page.

### Changed

- The scanner moved to its own entry, `eaa-cite/scan`, so the package root no
  longer loads Playwright.
- The scheduled source check runs monthly instead of weekly, and CI skips
  www.gesetze-im-internet.de, which drops connections from GitHub's runners.

### Fixed

Found by five independent reviews of the public repository:

- A page calling `window.open` crashed the server; popups are refused.
- `scan_html` let WebSockets and prefetch reach the network; its context is
  now offline.
- An endless response could use gigabytes; documents are capped at 20 MB and a
  scan has a deadline.
- Scan errors carried Playwright's call log with request headers; they are one
  line.
- The private-address check missed 6to4, SIIT, local-use NAT64, fec0::/10,
  192.0.0.0/24 and 198.18.0.0/15.
- Selectors are cut to 120 characters, and the caveat says scan output is data,
  not instructions.
- WCAG 2.2 AA rules were never run; they run now, under `outsideClause9`.
- Source URLs could be any address; they must be on an official host, and
  `verify-sources` follows redirects only between those hosts.
- The one-year staleness test would have failed every clone from 2027-11-09; the
  check moved to `verify-sources`.
- Installing from git produced no `dist/`; there is a `prepare` script.
- Germany's penalty tiers claimed a minimum § 37 BFSG does not state. Sweden's
  penalties cite the minor-cases exemption. Spain's RDL 1/2013 source records
  its amendment by Ley 4/2026. Spain's fine-band quotes include each maximum.
- The test shop's needs-review and not-detectable lists were not enforced.
- CI has read-only permissions, SHA-pinned actions and Dependabot.
- The stdio server did not exit when its client closed stdin, leaving a server
  and a browser behind per session.

## Contributors

Each person whose code, data or docs change is merged is listed here by name.
