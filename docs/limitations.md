# Limitations

What this project does not cover, and what its answers do not prove.

## Not legal advice

eaa-cite is a research aid. It tells you what a law says and where it says it.
It does not tell you what the law means for your site or your business.

Check a value against its source before you rely on it
([usage.md](usage.md#check-a-citation-yourself)), and read the text around
the quote: a quote under 30 words can miss a condition or an exception in the
next sentence. For a decision that matters, ask a lawyer qualified in that
jurisdiction.

## Coverage

Four jurisdictions: the EU directive itself (`EU`), Sweden (`SE`), Germany (`DE`)
and Spain (`ES`). Asking for any other code returns an error that names the
published ones.

The research covers services, with e-commerce as the main case. Products and
sector-specific services (banking, transport, e-books) are only partly covered.
For example, the self-service terminal transition is recorded for EU, DE and ES,
but no other product obligation is.

Only EU member states can be added
([data-format.md](data-format.md#allowed-jurisdiction-codes)).

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

Every non-English quote has an unofficial English translation, for checking the
quote. Cite the original text ([data-format.md](data-format.md#translations)).

## How fresh the data is

All sources in this release were retrieved on 2026-11-08. A conformance answer
is dated by its oldest source (`checkedAt`).

A monthly job re-reads every source, fails if a quote is gone, and fails for any
source retrieved more than a year ago ([verification.md](verification.md)). A
law can change on any day, so between runs the data can be up to a month behind
the source. A change outside the quoted passages is not caught at all
([verification.md](verification.md#what-verification-does-not-prove)).

## Scans

axe-core checks a subset of WCAG automatically. A scan with nothing failing is
not evidence that a site conforms: most criteria still need a person. What a
scan can and cannot tell you is in
[usage.md](usage.md#what-a-scan-can-and-cannot-tell-you).

`scan_url` loads any http or https URL, including private addresses, under the
redirect rule in [usage.md](usage.md#what-scan_url-may-load). If the server can reach internal
services, an assistant can ask it to scan them. See [SECURITY.md](../SECURITY.md).

## Standards versions

The criteria table is EN 301 549 v3.2.1 clause 9: the 50 WCAG 2.1 success
criteria at levels A and AA. WCAG 2.2 additions and level AAA criteria are outside
it. A scan runs the WCAG 2.2 AA rules too and reports their failures in
`outsideClause9`; AAA rules are not run. `explain_criterion` says these are not
clause 9 criteria.

The conformance sentence defaults to "EN 301 549 v3.2.1" and "WCAG 2.1 AA". You
can pass other version strings, but the criteria table and the scan mapping stay
on v3.2.1.

TODO(owner): say whether more jurisdictions, products, EN 301 549 v4 or WCAG 2.2 are planned.
