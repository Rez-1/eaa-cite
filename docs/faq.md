# FAQ

## Does meeting EN 301 549 mean a shop conforms to the EAA?

No. As of 2026-11-08 no version of EN 301 549 is cited in the Official Journal
under the EAA (Directive (EU) 2019/882), so meeting it gives no presumption of
conformity. It can still be used as a technical benchmark. The common mistake is
reading its citation under the Web Accessibility Directive (2016/2102), which
covers public sector websites, as applying to the EAA.
[ADR 0003](adr/0003-harmonisation-status-has-three-values.md) explains this and
how the data records it.

## What sentence can my audit report print about the standard?

Call `conformance_statement` with the country. It returns a fixed sentence and
`mayClaimPresumptionOfConformity`, which is `true` only when the status is
`cited`. The wording is fixed in code and is not generated.
[docs/usage.md](usage.md#conformance-answer) explains each field.

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

There is no "passed" list on purpose: an axe pass means its rules found
nothing, not that the criterion was evaluated. The scan lists the criteria axe
did not check instead. See
[ADR 0004](adr/0004-an-axe-pass-is-not-an-evaluation.md).

## A scan found nothing failing. Is the page accessible?

Not necessarily. axe checks a subset of WCAG, and most criteria need a person.
See [usage.md](usage.md#what-a-scan-can-and-cannot-tell-you).

## Why axe-core and no other scanner?

Pa11y and Lighthouse would mostly re-report the same violations under other rule
names. Another engine can be added as a `Scanner` when it catches something axe
misses. See [ADR 0002](adr/0002-axe-core-is-the-only-scanner.md).

## Does the server use an AI model?

No. Every lookup reads the checked-in data, and every scan runs axe-core. The
same input gives the same output.

## Does the server send my data anywhere?

The lookup tools and the two resources make no network requests. `scan_url`
loads the URL you give it in headless Chromium, and the page loads its own
resources as in any browser. `scan_html` runs markup in an offline browser
context, so it cannot call out. The rules are in [usage.md](usage.md#what-scan_url-may-load),
and what they mean for where you run the server is in
[SECURITY.md](../SECURITY.md).

Your MCP client and its model see the tool results. That is up to the client, not
this server.

## How does this compare with other tools?

[holmdigital/a11y-hd](https://github.com/holmdigital/a11y-hd) covers far more
jurisdictions and ships a CLI and a component library. Its legal data links each
law. This repo covers four jurisdictions and cites each value inside them, with
the pinpoint and a verbatim quote.

Several community MCP servers wrap axe-core for scanning. This one adds the
mapping onto EN 301 549 clause 9 and the cited legal lookups.
