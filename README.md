# eaa-cite

eaa-cite is a dataset and a tool for the European Accessibility Act (EAA), the EU
law that requires online shops and other services to be accessible from June 2025.
For the EU and three member states it records what the law requires, and every
value carries a citation: the article, a verbatim quote and the official source.
It also scans web pages with axe-core and files the results under the EN 301 549
clauses they relate to. You can use it from the command line, as a TypeScript
library, or as an MCP server that an AI assistant such as Claude can call.

Pre-release: there are no tagged versions yet, so track `main`.

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

The legal answers that matter most about accessibility (the highest fine, whether
a small business is exempt, how long an old contract may run) are the ones most
often paraphrased wrong or copied from the neighbouring country. Here every value
is a claim with a citation: the source, the article, a verbatim quote in the
source's language, and an English translation. A monthly job re-reads every
official source and fails if a quote is no longer there. The reasoning is in
[ADR 0001](docs/adr/0001-every-claim-carries-its-citation.md).

## What is in it

- A dataset of four jurisdiction files in [`data/jurisdictions/`](data/jurisdictions):
  the directive itself, Sweden, Germany and Spain.
- The EN 301 549 v3.2.1 clause 9 table: 50 WCAG 2.1 A and AA criteria with their
  EN clause numbers, in [`data/en-301-549-v3.2.1-clause9.json`](data/en-301-549-v3.2.1-clause9.json).
- An MCP server with six tools: `get_obligations`, `compare_jurisdictions`,
  `conformance_statement`, `explain_criterion`, `scan_url` and `scan_html`. No
  model runs inside it.
- A TypeScript library with the same lookups and the scanner.
- `npm run verify-sources`, which checks every quote against its live source.

## The dataset at a glance

Each value links back to a quote in the [jurisdiction files](data/jurisdictions).

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

## Quick start

Node 22 or later. Tested on Ubuntu and macOS.

```bash
git clone https://github.com/Rez-1/eaa-cite && cd eaa-cite
npm install
npx playwright install chromium
npm run build
claude mcp add eaa-cite -- node "$(pwd)/dist/mcp/bin.js"
```

The last line adds the server to Claude Code. Its `scan_url` tool loads any URL
the assistant gives it, including `localhost` and private network addresses, so
only run it where that is fine (see [SECURITY.md](SECURITY.md)). For Claude Desktop and other
clients, see [docs/mcp-setup.md](docs/mcp-setup.md). Full install notes are in
[docs/install.md](docs/install.md).

From the terminal:

```bash
node dist/cli/main.js scan https://shop.example/   # failures by EN 301 549 clause
node dist/cli/main.js obligations de penalties     # the value, its article and quote
```

The four commands are in [docs/usage.md](docs/usage.md).

As a library:

```ts
import { getJurisdiction, conformanceFor } from "eaa-cite";

getJurisdiction("ES").claims.penalties.value.maxFine; // 1000000
conformanceFor("SE").status; // "not_cited"
```

## Documentation

- [docs/install.md](docs/install.md): install from source, then [add the server to a client](docs/mcp-setup.md)
- [docs/usage.md](docs/usage.md): every tool, command and library function, and how to read what they return
- [docs/limitations.md](docs/limitations.md): what the data and the scans do not cover; common questions are in the [FAQ](docs/faq.md)
- [docs/contributing-data.md](docs/contributing-data.md): correct or add data, with links to the file format and source verification
- [docs/architecture.md](docs/architecture.md): the code, the [decision records](docs/adr) and the [system it came from](docs/case-study.md)
- [examples/README.md](examples/README.md): the test shop and its results
- [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and the glossary, [CONTEXT.md](CONTEXT.md)

## Not legal advice

This is a research aid. Check a value against its cited source before you rely
on it. What is not covered is in [docs/limitations.md](docs/limitations.md).

## Licence

Code: MIT ([LICENSE](LICENSE)). Data in `data/`: CC BY 4.0 ([DATA-LICENSE](DATA-LICENSE)).
The quoted legislation is the work of its publishers and is quoted for
identification; EU legislation is reused under Commission Decision 2011/833/EU.
