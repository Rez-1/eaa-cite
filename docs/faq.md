# FAQ

## What is this, in one sentence?

A dataset of what the European Accessibility Act requires in four jurisdictions,
with every value tied to a quote from the law, plus an MCP server that answers
from it and files axe-core scan results under EN 301 549 clauses.

## Does meeting EN 301 549 mean a shop conforms to the EAA?

No. As of 2026-11-08 no version of EN 301 549 is cited in the Official Journal
under the EAA (Directive (EU) 2019/882). Meeting it gives a shop no presumption of
conformity. It can still be used as a technical benchmark.

The confusion comes from the Web Accessibility Directive (2016/2102), which
covers public sector websites. EN 301 549 v3.2.1 is cited under that directive,
and that citation says nothing about the EAA.

The data records this as a harmonisation status with three values: `cited`,
`not_cited` and `national_only`. It is recorded once, in the EU file, and every
member state takes that answer unless its own law names an EN 301 549 version.
All four jurisdictions are `not_cited` today.
[ADR 0003](adr/0003-harmonisation-status-has-three-values.md) explains the model.

## What sentence can my audit report print about the standard?

Call `conformance_statement` with the country. It returns a fixed sentence and
`mayClaimPresumptionOfConformity`, which is `true` only when the status is
`cited`. The wording is fixed in code and is not generated.
[docs/results.md](results.md) explains each field.

## Why is my country not included?

Each jurisdiction needs its transposing law researched, every value quoted from
an official source, and the result reviewed. So far that has been done for the
EU directive, Sweden, Germany and Spain. To help add another member state, see
[docs/contributing-data.md](contributing-data.md). Only EU member states can be
added.

## Can I rely on a value?

Use it to find the provision, then read the provision. Each value comes with the
source URL, the pinpoint and the quote, so you can check it in a minute. Each file
also lists what could not be confirmed under `unverified`. See
[docs/limitations.md](limitations.md).

## Can I cite this dataset?

Yes. The files in `data/` are under CC BY 4.0. Attribute as:

```
eaa-cite dataset, https://github.com/Rez-1/eaa-cite
```

The quoted legislation stays the work of its publishers. EU legislation is reused
under Commission Decision 2011/833/EU, and Swedish, German and Spanish statutes
are not subject to copyright. [DATA-LICENSE](../DATA-LICENSE) has the details.
Cite the law itself, from the source URL, when you make a legal point.

## Why does a scan say nothing passed?

There is no "passed" list on purpose. When axe passes its rules for a criterion,
it means those rules found nothing. It does not mean the criterion was evaluated.
A "passed" list would read as "these are fine", and an assistant summarising the
result would repeat it. The scan lists the criteria axe did not check instead.
See [ADR 0004](adr/0004-an-axe-pass-is-not-an-evaluation.md).

## A scan found nothing failing. Is the page accessible?

Not necessarily. axe checks a subset of WCAG. On the repaired product page in the
test shop, nothing fails and 41 of the 50 clause 9 criteria are still listed as
not checked by axe. Each of those needs a person.

## Why axe-core and no other scanner?

Pa11y and Lighthouse would mostly re-report the same violations under other rule
names. The server takes the scanner as an injected `Scanner`, so another engine
can be added when it catches something axe misses. See
[ADR 0002](adr/0002-axe-core-is-the-only-scanner.md).

## Does the server use an AI model?

No. Every lookup reads the checked-in data, and every scan runs axe-core. The
same input gives the same output. The separate `eaa-cite/guarded` module wraps
LLM calls, but the server does not use it.

## Does the server send my data anywhere?

The lookup tools (`get_obligations`, `compare_jurisdictions`,
`conformance_statement`, `explain_criterion`) and the two resources make no
network requests.

`scan_url` loads the URL you give it in headless Chromium. The page then loads
its own scripts, images and other resources, as in any browser. `scan_url`
accepts any http or https URL, including `localhost` and private network
addresses. A scan that starts at a public address follows redirects but refuses
to navigate to a private one. See [docs/limitations.md](limitations.md).

`scan_html` runs pasted markup in an offline browser context (HTTP, WebSockets,
prefetch and service workers are all refused), so it cannot call out.

Your MCP client and its model see the tool results. That is up to the client, not
this server.

## Which Node versions, systems and clients does it work with?

It is tested on Node 22, on Ubuntu (in CI) and macOS, with Claude Desktop and
Claude Code as MCP clients. Nothing else has been tested. See
[docs/install.md](install.md) and [docs/mcp-setup.md](mcp-setup.md).

## Is it on npm?

No. Install it by cloning the repository and building it. See
[docs/install.md](install.md).

## How does this compare with other tools?

[holmdigital/a11y-hd](https://github.com/holmdigital/a11y-hd) covers far more
jurisdictions and ships a CLI and a component library. Its legal data links each
law. This repo covers four jurisdictions and cites each value inside them, with
the pinpoint and a verbatim quote.

Several community MCP servers wrap axe-core for scanning. This one adds the
mapping onto EN 301 549 clause 9 and the cited legal lookups.

## Glossary

The terms used across these docs (jurisdiction file, claim, citation, pinpoint,
harmonisation status, conformance answer) are defined in
[CONTEXT.md](../CONTEXT.md).
