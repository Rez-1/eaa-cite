# eaa-cite

What the European Accessibility Act requires of an online shop, per member state,
with every value tied to the article it comes from. Plus an MCP server that gives
those answers to an AI assistant, and maps axe-core scan results onto EN 301 549.

```
> get_obligations { country: "DE" }  (penalties only)

maxFine: 100000 EUR
  BFSG § 37 Absatz 2 (offences listed in § 37 Absatz 1)
  "Absatzes 1 Nummer 1, 7, 8, 9 und 10 mit einer Geldbuße bis zu hunderttausend Euro und in den übrigen Fällen … bis zu zehntausend Euro"
  = in the cases of paragraph 1 numbers 1, 7, 8, 9 and 10, a fine of up to EUR 100,000, and in the other cases up to EUR 10,000
  https://www.gesetze-im-internet.de/bfsg/__37.html (retrieved 2026-11-08)
harmonisation: not_cited (from eu, checked 2026-11-08)
```

That is real output from `npm run demo`, which starts the server over stdio and
calls it the way Claude Desktop does.

## Why

Accessibility scanners report which WCAG criteria a page fails. The next question,
what the law says about it, is usually answered from memory or a blog post. The
answers that matter most (the highest fine, whether a small business is exempt,
how long an old contract may run) are the ones most often paraphrased wrong or
copied from the neighbouring country.

So every value in this dataset is a claim with a citation: the source, the
article, a verbatim quote in the source's language, and an English translation.
A weekly job re-reads every official source and fails if a quote is no longer
there.

## The dataset

Four files in [`data/jurisdictions/`](data/jurisdictions): the directive itself,
Sweden, Germany and Spain. Each value below links back to a quote in those files.

| | EU | SE | DE | ES |
|---|---|---|---|---|
| Applies from | 2025-06-28 | 2025-06-28 | 2025-06-28 | 2025-06-28 |
| Microenterprise exemption | services (Article 4(5)) | services (10 § första stycket) | services (BFSG § 3 Absatz 3 Satz 1) | services (artículo 3, apartado 3) |
| Highest fine stated | none (set nationally) | 10,000,000 SEK | 100,000 EUR | 1,000,000 EUR |
| Service contracts may run to | 5 years from 2025-06-28 | 2030-06-27 | 2030-06-27 | 5 years from 2025-06-28 |
| Self-service terminals, max years | 20 | not recorded | 15 | 10 |
| Supervisor for e-commerce | n/a | Post- och telestyrelsen | MLBF (joint Länder body) | each autonomous community; State unit as fallback |
| Names an EN 301 549 version | no | no | no | no |
| Harmonisation status | not_cited | not_cited | not_cited | not_cited |

The last row is the one people get wrong. EN 301 549 v3.2.1 is a harmonised
standard under the Web Accessibility Directive, which covers public sector
websites. As of 2026-11-08 no standard is cited under the EAA, so meeting EN 301
549 gives a shop no presumption of conformity. [ADR 0003](docs/adr/0003-harmonisation-status-has-three-values.md)
explains how the data model keeps the two directives apart.

Each file also has an `unverified` list of what was looked for and could not be
confirmed from an official source. Germany's, for example, notes that the treaty
founding its market surveillance body is published only in Land gazettes.

[`data/en-301-549-v3.2.1-clause9.json`](data/en-301-549-v3.2.1-clause9.json) is
the clause 9 table: 50 WCAG 2.1 A and AA criteria with their EN clause numbers,
extracted from the ETSI PDF and the W3C Recommendation, with the SHA-256 of both.

## How a claim is checked

```
npm run verify-sources
```

```
ok      EU dir-2019-882  sha256 a47628739bdf
ok      SE sfs-2023-254  sha256 dd2fefd932fc
ok      DE bfsg-37  sha256 1c702279e5cc
manual  DE bgbl-2021-i-2970
ok      ES ley-11-2023  sha256 492e4de258eb
...
1 source(s) need a person to re-check: https://www.bgbl.de/...
```

The script fetches each source, reduces the HTML to readable text, and looks for
every quote that cites it, piece by piece around any ellipsis. It exits non-zero
on a missing quote and never edits the data. The German federal gazette serves
PDFs through a JavaScript viewer, so that source is marked for a person to check
instead of being skipped silently.

The tests add rules a schema cannot: every citation names a listed source, every
non-English quote has a translation, quotes stay under 30 words, no source was
retrieved more than a year ago, and nothing outside the EU is filed under the EAA.

## The MCP server

| Tool | What it returns |
|---|---|
| `get_obligations` | Every claim for one jurisdiction, each with its citations, plus the harmonisation status that applies there |
| `compare_jurisdictions` | One claim across all jurisdictions, for example `penalties` |
| `conformance_statement` | The sentence an audit report can print about the standard it used, and whether it may claim a presumption of conformity |
| `explain_criterion` | An EN 301 549 clause 9 criterion by WCAG number or EN clause |
| `scan_url` | axe-core on an http(s) URL, with each violation filed under its EN clause |
| `scan_html` | The same for markup you already have; network requests are blocked |

No model runs inside the server. Lookups are deterministic, and the scan tools run
axe in headless Chromium.

Scan results have no "passed" list. An axe pass on a criterion means its rules
found nothing, not that the criterion was evaluated, so the result lists the
criteria axe did not check instead ([ADR 0004](docs/adr/0004-an-axe-pass-is-not-an-evaluation.md)):

```
> scan_html { html: <test/fixtures/shop-with-defects.html> }

  9.1.1.1  Non-text Content           image-alt
  9.1.4.3  Contrast (Minimum)         color-contrast
  9.3.1.1  Language of Page           html-has-lang
  9.4.1.2  Name, Role, Value          button-name, label
  4 failing, 0 need review, 43 of 50 not checked by axe
```

### Running it

Node 22 or later.

```bash
git clone https://github.com/Rez-1/eaa-cite && cd eaa-cite
npm install
npx playwright install chromium
npm run build
```

Then add it to your MCP client. For Claude Desktop, in
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eaa-cite": { "command": "node", "args": ["/absolute/path/to/eaa-cite/dist/mcp/bin.js"] }
  }
}
```

For Claude Code:

```bash
claude mcp add eaa-cite -- node /absolute/path/to/eaa-cite/dist/mcp/bin.js
```

## Using it as a library

```ts
import { getJurisdiction, harmonisationFor, scanUrl, mapToClauses } from "eaa-cite";

const es = getJurisdiction("ES");
es.claims.penalties.value.maxFine; // 1000000
es.claims.penalties.citations[0].pinpoint; // "Ley 11/2023, artículo 30, apartado 1, párrafo primero"

harmonisationFor("SE").status; // "not_cited"

const report = mapToClauses(await scanUrl("http://localhost:3000"));
```

## `eaa-cite/guarded`

A separate module, not used by the server: a wrapper for structured LLM calls with
spend caps enforced in code. It checks a ledger before each call, validates output
against a Zod schema, retries a bounded number of times, and writes a ledger row
for every outcome, failures included. It is the agent wrapper from the private
system this repo was extracted from, with the Postgres table replaced by a
`SpendLedger` interface. There is an Anthropic adapter; the SDK is an optional
peer dependency. See [ADR 0006](docs/adr/0006-spend-caps-are-code.md) and
[`src/guarded/run.test.ts`](src/guarded/run.test.ts).

## Design decisions

1. [Every claim carries its citation](docs/adr/0001-every-claim-carries-its-citation.md)
2. [axe-core is the only scanner](docs/adr/0002-axe-core-is-the-only-scanner.md)
3. [Harmonisation status has three values and is recorded once, at EU level](docs/adr/0003-harmonisation-status-has-three-values.md)
4. [An axe pass is not an evaluation of a criterion](docs/adr/0004-an-axe-pass-is-not-an-evaluation.md)
5. [Publish clause numbers, not ETSI's text](docs/adr/0005-publish-clause-numbers-not-etsi-text.md)
6. [Spend caps are code, not prompt instructions](docs/adr/0006-spend-caps-are-code.md)

[docs/case-study.md](docs/case-study.md) describes the private audit system this
came from: the state machine, idempotent queues, findings tiered by how they were
produced, and the gates a report passes before it can be signed.

## Tests

```bash
npm test
```

86 tests, including real Chromium scans of local fixtures with planted defects,
and contract tests that drive the server through an MCP client. The scan tests
need `npx playwright install chromium` once; nothing else needs the network.

## Related work

[holmdigital/a11y-hd](https://github.com/holmdigital/a11y-hd) covers far more
ground: 17 jurisdictions, a CLI with PDF and JUnit output, accessibility statement
generation and a React component library. Its legal data links each law. This
repo covers four jurisdictions and cites each value inside them.

Several community MCP servers wrap axe-core for scanning. This one adds the
EN 301 549 mapping and the legal lookups.

## Limitations

This is a research aid, not legal advice. Four jurisdictions, services only, with
e-commerce as the main case; products and sector-specific services (banking,
transport, e-books) are only partly covered. Spain's penalty bands are the State
regime, which applies where an autonomous community has none of its own. axe-core
finds a minority of accessibility defects; the rest need a person.

## Licence

Code: MIT ([LICENSE](LICENSE)). Data in `data/`: CC BY 4.0 ([DATA-LICENSE](DATA-LICENSE)).
The quoted legislation is the work of its publishers and is quoted for
identification; EU legislation is reused under Commission Decision 2011/833/EU.
