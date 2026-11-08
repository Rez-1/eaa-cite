# Data format

The files in `data/`. Field names match `src/dataset/schema.ts`, which wins if
this page and the code disagree. Terms follow [CONTEXT.md](../CONTEXT.md). To
change the data, see [contributing-data.md](contributing-data.md).

| File | What it is |
|---|---|
| `data/jurisdictions/eu.json` | Directive (EU) 2019/882, plus the harmonisation status. |
| `data/jurisdictions/se.json`, `de.json`, `es.json` | One file per member state. |
| `data/en-301-549-v3.2.1-clause9.json` | The clause 9 criteria table. Generated; do not edit. |

## Jurisdiction file

| Field | Required | Content |
|---|---|---|
| `jurisdiction` | yes | The code, matching the file name (`se.json` holds `"SE"`). |
| `name` | yes | The English name. |
| `instrument` | yes | The law the claims are about, in its own language. |
| `sources` | yes | At least one [source](#sources). |
| `claims` | yes | The [claims](#claims). |
| `harmonisation` | EU file only | The [harmonisation status](#harmonisation-status). |
| `unverified` | yes | [What could not be confirmed](#unverified); may be `[]`. |

Every object is strict: an unknown or misspelt key, such as
`supervisoryAuthorty`, stops the file loading with
`claims: Unrecognized key: "supervisoryAuthorty"`. Only files listed in
`PUBLISHED` (`src/dataset/index.ts`) are loaded. `se.json` is the smallest
example to read.

### Allowed jurisdiction codes

`EU` plus the 27 member states:
`AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK`.
Greece is `GR`. Nothing outside the EU: the EAA is an EU directive, so a UK or
Norwegian law is never filed under it, and the tests check `GB` and `NO` are
never published.

## Sources

| Field | Required | Content |
|---|---|---|
| `id` | yes | Lower-case letters, digits and hyphens, unique in the file, for example `bfsg-37`. |
| `title` | yes | The document's title. |
| `identifier` | no | CELEX, SFS, BGBl or BOE reference. |
| `kind` | yes | See [Source kinds](#source-kinds). |
| `url` | yes | An `https` URL on an official host ([load rules](#load-rules)). |
| `language` | yes | `en`, `sv`, `de` or `es`. A new one is a schema change. |
| `retrievedAt` | yes | `YYYY-MM-DD`: when someone last confirmed the quotes at that URL. |
| `verify` | yes | See [quote or manual verification](#quote-or-manual-verification). |
| `note` | no | What it is consolidated to, why it cannot be fetched, or a legal caveat. |

### Source kinds

`legislation` (a law as adopted, for example the directive on EUR-Lex),
`consolidated-text` (with amendments worked in, for example `bfsg-37`),
`official-gazette` (as printed, for example `bgbl-2021-i-2970`),
`authority-page` (a supervisory authority about itself, such as `mlbf-about`),
`commission-page`, and `search` (in the schema, unused, purpose unstated). An
`authority-page` is weaker evidence than a law; say so in its `note`, as
`mlbf-about` does.

### quote or manual verification

`quote`: `verify-sources` fetches the URL and checks every quote citing it. Use it
whenever the URL serves the text as a normal page. `manual`: a script cannot read
the URL (the German federal gazette's JavaScript viewer is the one case), so a
person re-checks it; say why in the `note`. How both are checked is in
[verification.md](verification.md).

## Citations

| Field | Required | Content |
|---|---|---|
| `source` | yes | The `id` of a source in the same file. Replaced by the whole source on load. |
| `pinpoint` | yes | The place in the source, as precise as the text allows, in its own terms: `Article 32(1), second subparagraph`, `Lag (2023:254) 39 § första stycket`, `BFSG § 37 Absatz 2 (offences listed in § 37 Absatz 1)`. Name the instrument when the file has several; add a bracketed explanation when the provision alone would mislead. For a page with no numbered parts, name the page or heading. |
| `quote` | yes | Verbatim, in the source's language, at most 30 words. Mark omissions `…` or `[…]`; each piece must appear in order. No words of your own: explanations go in a `note`. Markup and typography do not matter to the checker, but every word and number must match. |
| `translation` | if not `en` | English translation of the quote. |
| `absent` | no | Phrases that must not appear on the page, for a claim of absence such as "no standard is cited". `verify-sources` fails if one appears. |
| `note` | no | Anything a reader needs about this citation. |

### Translations

Written by whoever adds the citation, so a reader can check the quote without
the language. They are unofficial; a report cites the original. A machine
translation is allowed if its `note` says so (`"Machine translation, reviewed by
<name>."`) and it is reviewed before merge.

## Claims

Every claim is `{ "value": { … }, "citations": [ … ], "note"?: "…" }` with at
least one citation ([ADR 0001](adr/0001-every-claim-carries-its-citation.md)).
Dates are `YYYY-MM-DD`; amounts are whole numbers in the unit the field names. A
missing optional claim means the dataset has no value; if you looked and could
not confirm it, say so in `unverified`.

### Claim list

| Claim id | Required | Value fields and rules |
|---|---|---|
| `applicationDate` | yes | `date`: when the obligations apply (Article 31(2), or the national commencement provision). `2025-06-28` everywhere. Exceptions for other provisions go in `note`. |
| `transpositionDeadline` | no | `date`. EU file only (`2022-06-28`). |
| `microenterpriseExemption` | yes | `appliesTo`: only `"services"`. |
| `microenterpriseDefinition` | yes | `employeesFewerThan`, `maxAnnualTurnoverEur`, `maxAnnualBalanceSheetTotalEur`, and `test`: how they combine, in words, as the law states it. |
| `presumptionOfConformity` | yes | `basis` (the fixed string `"harmonised standards whose references are published in the Official Journal"`) and `namesEn301549Version`: the version the law names in so many words, or `null`. Non-null makes a member state `national_only`. |
| `nationalStandardReference` | no | `standard`, `edition` (or `null`), `appliesTo`. A national standard the law points to, such as Spain's UNE 139803. Does not change the harmonisation status. |
| `supervisoryAuthority` | no | `summary` and `bodies` (`name`, `role`, optional `website`). Not in the EU file. Where designation is left to regions, say so and list the gaps in `unverified`. |
| `penalties` | yes | `summary`, `currency` (`EUR`, `SEK` or `null`), `maxFine` (the highest stated, or `null`), optional `tiers` (`label`, `min`, `max`). Use the law's tier names; `min` is `null` when only a ceiling is stated. |
| `transitionalServiceContracts` | yes | `rule`, `until`: the last day the text states, or `null` when it states a period. Never a worked-out date; put that in `unverified`. |
| `transitionalSelfServiceTerminals` | no | `rule`, `maxYearsAfterFirstUse` in whole years. |

## Harmonisation status

Whether conformity with EN 301 549 gives a presumption of conformity under the
EAA:

| Status | Meaning |
|---|---|
| `cited` | A version is cited in the Official Journal under 2019/882. A report may claim the presumption. |
| `not_cited` | None is. EN 301 549 is a technical benchmark. |
| `national_only` | Not cited, but the member state's law names a version, which then governs there. No presumption claimed. |

It is recorded once, in `eu.json`, as `"harmonisation": { "status", "citations",
"note"? }`. The schema allows only `cited` or `not_cited` there; a member state
file has no block. The answer is dated by its oldest citation. The Commission
page citation lists `absent` phrases, so `verify-sources` fails the day an EAA
entry appears. As of 2026-11-08 the status is `not_cited`. The reasoning is in
[ADR 0003](adr/0003-harmonisation-status-has-three-values.md).

### Conformance answer

`conformanceFor` (`src/dataset/conformance.ts`) works it out:

1. A member state whose `namesEn301549Version` is set is `national_only`, basis
   `national-law`, citing that claim, naming that version. Asking for another
   version throws `VersionMismatchError`.
2. Otherwise the status and citations are the EU file's, basis `eu`, version the
   caller's or EN 301 549 v3.2.1.
3. The WCAG baseline is the caller's or WCAG 2.1 AA. The sentence is fixed per
   status in `src/standards/harmonisation.ts`. `checkedAt` is the oldest
   `retrievedAt` cited.

The fields are in [usage.md](usage.md#conformance-answer).

## Unverified

Plain sentences: what the research looked for and could not confirm from an
official source. One entry per gap: a value left to someone else with no source
found, a provision read but not quoted, an amendment not checked, or a
worked-out value with how it was worked out. Say what is missing, where you
looked, and why it is not recorded. An entry is never a claim, and a claim is
never written from an entry.

## Load rules

`parseJurisdictionFile` (`src/dataset/load.ts`) checks every file on load. A file
that breaks a rule does not load, and the package does not start. The
`DatasetIntegrityError` lists every problem, schema problems first (the other
rules run only once the schema passes):

```
jurisdictions/de.json does not load:
  - claims.penalties.citations[0]: names source "bfsg-99", which is not listed
  - sources: "bfsg-37" is never cited
  - claims.microenterpriseExemption.citations[0]: quote is in de and has no translation
```

| Rule | Problem message |
|---|---|
| The file declares the jurisdiction it is named for. | `jurisdiction: declares DK, but the file is for SE` |
| The EU file has a harmonisation block. | `harmonisation: the EU file must record the harmonisation status` |
| No member state file has one. | `harmonisation: only the EU file records it; member states take the EU answer (ADR 0003)` |
| Every source is `https` on a host in `src/dataset/officialHosts.ts`, because `verify-sources` fetches them. | `sources: "bfsg-2" is not on an official host (http://…); see src/dataset/officialHosts.ts` |
| Source ids are unique. | `sources: id "ley-11-2023" is listed twice` |
| Every citation names a listed source. | `claims.penalties.citations[0]: names source "bfsg-99", which is not listed` |
| Every source is cited. | `sources: "orphan" is never cited` |
| Every non-English quote has a translation. | `claims.applicationDate.citations[0]: quote is in sv and has no translation` |
| Fines are in the jurisdiction's currency. | `claims.penalties.value.currency: is SEK, but DE fines are in EUR` |
| Every number and ISO date in a value appears in the English text of a citation (digits, "2 million", words up to twenty, "28 June 2025"). | `claims.penalties.value: 50000 is not in any of its citations` |

The EU harmonisation citations are checked too. The figures rule checks that a
number is stated, not that it is stated for that field, so review still compares
each value with its quote. These rules depend on neither date nor judgement;
source age is checked by `verify-sources`, because a date check at load would
stop a copy working a year after release.

## Editorial rules

`test/dataset.test.ts` checks the shipped data with `npm test`, never at load:
quotes are at most 30 words (counting pieces around `…`); no `retrievedAt` is in
the future; `GB` and `NO` are never published; `applicationDate` is
`2025-06-28` everywhere; a `cited` EU status has a `legislation` source among its
citations; and harmonisation quotes that mention 2016/2102 never make it `cited`.

## Clause 9 criteria table

`data/en-301-549-v3.2.1-clause9.json` holds `enVersion`, `wcagVersion`,
`sources.en` (the ETSI PDF: `url`, `bytes`, `sha256`, `pages`), `sources.wcag`
(WCAG 2.1: `url`, `bytes`, `sha256`), `extractedAt`, and 50 `criteria`, each with
`enClause`, `wcagRef`, `level`, `name` (from W3C), `wcagUrl` and `enPage` (the
PDF page of the clause heading). It holds no ETSI text
([ADR 0005](adr/0005-publish-clause-numbers-not-etsi-text.md)).

`npm run build:criteria` (`scripts/build-criteria.ts`, with the parsers in
`scripts/lib/criteriaSource.ts`) downloads both documents, parses EN clauses 9.1 to 9.4
and the WCAG Recommendation, and throws on any disagreement or a criterion that
is AAA or not in WCAG 2.1. It prints a line such as
`50 criteria (A 30, AA 20) from 186 PDF pages` and overwrites the file. If
`sources.en.sha256` changed, ETSI changed the PDF: read the `criteria` diff
before committing. The file is checked against its schema on load.
