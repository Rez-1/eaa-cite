# Limitations

What this project does not cover, and what its answers do not prove.

## Not legal advice

eaa-cite is a research aid. It tells you what a law says and where it says it.
It does not tell you what the law means for your site or your business.

Before you rely on a value:

1. Open the source URL in the citation.
2. Find the pinpoint and check that the quote is there.
3. Read the text around it. A quote under 30 words can miss a condition or an
   exception in the next sentence.
4. For a decision that matters, ask a lawyer qualified in that jurisdiction.

[docs/results.md](results.md) shows how to read a citation and check it yourself.

## Coverage

Four jurisdictions: the EU directive itself (`EU`), Sweden (`SE`), Germany (`DE`)
and Spain (`ES`). Asking for any other code returns an error that names the
published ones.

The research covers services, with e-commerce as the main case. Products and
sector-specific services (banking, transport, e-books) are only partly covered.
For example, the self-service terminal transition is recorded for EU, DE and ES,
but no other product obligation is.

Only EU member states can be added. The EAA is an EU directive, so a UK or
Norwegian law is never filed under it.

## Known gaps in the data

Each jurisdiction file has an `unverified` list: things the research looked for
and could not confirm from an official source. These are never written as
claims. Read them before you rely on a file:

| File | What its `unverified` list covers |
|---|---|
| [`data/jurisdictions/eu.json`](../data/jurisdictions/eu.json) | no Commission decision citing a harmonised standard under the EAA was found; no calendar end date for the self-service terminal transition; the service contract end date is worked out from "five years"; a pending amendment proposal was not reviewed |
| [`data/jurisdictions/se.json`](../data/jurisdictions/se.json) | no EN 301 549 version named in Swedish law; no vite amount stated; one commencement provision taken from the original print; the self-service terminal transition was not quoted, so it is not a claim |
| [`data/jurisdictions/de.json`](../data/jurisdictions/de.json) | the Länder treaty founding the MLBF was not found among permitted sources; later amendments to the BFSGV and BFSG were not checked |
| [`data/jurisdictions/es.json`](../data/jurisdictions/es.json) | which body each autonomous community designated as supervisor; which sectoral law sets e-commerce penalties; regional penalty amounts |

The table summarises. The files hold the full wording.

### Spain's penalties

Spain's penalty bands are the State regime: título III of Real Decreto
Legislativo 1/2013, which Ley 11/2023 artículo 30.1 applies where sectoral law
makes no provision. An autonomous community may have its own regime, and the
regional amounts were not checked. The `maxFine` of 1,000,000 EUR is the State
maximum. A region's own maximum may differ.

## Translations

Every non-English quote has an English translation. The translations are
unofficial. They exist so a reader can check that the quote supports the value
without reading the source language. Cite the original text, not the translation.

## How fresh the data is

- Each source has a `retrievedAt` date: the day someone read it. All sources in
  this release were retrieved on 2026-11-08.
- A conformance answer has a `checkedAt` date: the oldest `retrievedAt` among the
  sources it cites. The answer is only as fresh as that.
- A weekly job re-reads every source and fails if a quote is gone. It does not
  catch a law changed in a place no quote covers. See
  [docs/verification.md](verification.md).
- The tests fail once any source is more than 365 days old, so stale data cannot
  pass CI unnoticed.

A law can change on any day. Between two runs of the weekly job, the data can be
up to a week behind the source, and a change outside the quoted passages can go
unnoticed for longer.

## What a scan can and cannot tell you

The scan tools run axe-core, which checks a subset of WCAG automatically. Most
accessibility defects need a person to find them.

- `failing` lists defects axe found. Each one is real, and the list is not
  complete.
- `needsReview` lists criteria axe could not decide. A person checks each one.
- `notCheckedByAxe` lists clause 9 criteria no axe rule touched. These need a
  person. On the repaired test-shop page, 41 of the 50 are in this list.
- There is no "passed" list. An axe pass means its rules found nothing, not that
  the criterion was evaluated
  ([ADR 0004](adr/0004-an-axe-pass-is-not-an-evaluation.md)).

A scan with nothing failing is not evidence that a site conforms.
[docs/results.md](results.md) explains how to turn a scan into a work list.

### What `scan_url` can reach

`scan_url` loads any http or https URL it is given in headless Chromium. Other
schemes (`file:`, `data:`, `javascript:`) are refused.

A scan that starts at a private address (`localhost`, 0.0.0.0/8, loopback, the RFC 1918 ranges, carrier-grade NAT (100.64.0.0/10), link-local, `::`, IPv6 unique-local and link-local, IPv4 written inside IPv6, or a name that resolves to one) may go
anywhere, so a local dev server can be scanned. A scan that starts at a public
address follows redirects, up to 10 hops, but stops with an error if the page
navigates to a private address.

That rule covers the page's own navigations only. A public page's images,
scripts, frames and requests made by its scripts load as in a normal browser,
wherever they point.

`scan_html` blocks every network request the markup makes.

If the server runs where it can reach internal services, an assistant can still
ask it to scan them directly. See [SECURITY.md](../SECURITY.md).

## Standards versions

The criteria table is EN 301 549 v3.2.1 clause 9: the 50 WCAG 2.1 success
criteria at levels A and AA. WCAG 2.2 additions and level AAA criteria are outside
it. A scan reports failures under them in `outsideClause9`, and
`explain_criterion` says they are not clause 9 criteria.

The conformance sentence defaults to "EN 301 549 v3.2.1" and "WCAG 2.1 AA". You
can pass other version strings, but the criteria table and the scan mapping stay
on v3.2.1.

TODO(owner): say whether more jurisdictions, products, EN 301 549 v4 or WCAG 2.2 are planned.
