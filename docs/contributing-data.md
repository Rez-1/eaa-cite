# Contributing data

For people who know the law or accessibility and want to correct or add to the
dataset. Reporting and correcting a value need only a GitHub account and a
browser. The file format is in [data-format.md](data-format.md); terms such as
claim, citation and pinpoint are in [CONTEXT.md](../CONTEXT.md).

Every change must meet three rules:

- Official sources only: the law on an official legislation site, an official
  gazette, a European Commission page, or a supervisory authority's own site.
  Blogs, law firm notes, news and secondary databases help you find the law;
  cite the law itself.
- Quotes are verbatim, in the source's language, at most 30 words, with
  omissions marked `…`, and translated if not in English.
- Every change is reviewed against the source ([Review](#review)).

## Report a wrong or outdated value

Open an issue at https://github.com/Rez-1/eaa-cite/issues/new/choose, choose
"Data correction", and give the jurisdiction and claim (for example Germany,
`penalties`), what is wrong, and the source URL, pinpoint and quote that state
the correct value. With the quote and pinpoint the fix is quick; without them
the report starts a research task.

## Correct a value

In `data/jurisdictions/<code>.json`:

1. Find the claim under `claims` ([claim ids](data-format.md#claim-list)) and
   change its `value`.
2. Change the citation with it: the `pinpoint` names where the new value is
   stated, the `quote` is the text that states it, and the `translation` matches.
3. If the citation needs a source not yet in the file,
   [add it](#add-a-citation-or-a-source).
4. Set the source's `retrievedAt` to the day you read it.
5. Remove any `unverified` entry your change answers.

On GitHub without installing anything: open the file (for example
https://github.com/Rez-1/eaa-cite/blob/main/data/jurisdictions/de.json), click the
pencil icon and accept the fork, make the change, choose "Commit changes" then
"Propose changes", and open the pull request. Its template asks which sources you
checked and whether you updated `retrievedAt`.

The checks then run for you. `ci` loads every file and runs the tests.
`verify-sources` fetches every source and looks for every quote, including yours;
sources on www.gesetze-im-internet.de are skipped in CI
([why](verification.md#the-monthly-job)), so the maintainer checks a German
change locally. A first-time contributor's checks may need the maintainer's
approval. If a check fails, open its "Details", fix the file on your branch, and
the checks run again.

### Check your change locally

With Node 22 and a clone ([install.md](install.md)):

```bash
npm run cli -- check-data data/jurisdictions/es.json   # the load rules, one file
npm test                 # every file, plus the editorial rules
npm run verify-sources   # every quote against its live source
```

A file that breaks a [load rule](data-format.md#load-rules) gets one problem per
line, each starting with its path: `claims.penalties.citations[0]` is the first
citation of `penalties` (counting from 0), `sources.0.language` the `language`
of the first source. A file that loads but breaks an
[editorial rule](data-format.md#editorial-rules), such as a quote over 30 words,
fails `npm test`. What `verify-sources` reports is in
[verification.md](verification.md).

## Add a citation or a source

Add the source to the file's `sources`, then cite it by `id` from a claim:

```json
{ "id": "bfsg-38", "title": "BFSG § 38 Übergangsbestimmungen", "kind": "consolidated-text",
  "url": "https://www.gesetze-im-internet.de/bfsg/__38.html", "language": "de",
  "retrievedAt": "2026-11-08", "verify": "quote" }
```

```json
{ "source": "bfsg-38", "pinpoint": "BFSG § 38 Absatz 2", "quote": "…", "translation": "…" }
```

Follow the file's `id` pattern (`bfsg-38`, `sfs-2023-254`, `ley-11-2023`), pick
the [kind](data-format.md#source-kinds), and add `identifier` and `note` where
they apply. Choose `verify: "quote"` almost always; use `manual` only if a script
cannot read the page, say why in the `note`, and prefer another official URL for
the same text if one exists
([why](data-format.md#quote-or-manual-verification)). Every source must be cited
and every citation must name a listed source. A source on a new host does not
load until the host is added to `src/dataset/officialHosts.ts`; the maintainer
does that, so say in the pull request that the host is new.

## Record something you could not confirm

Add a sentence to `unverified` instead of writing a claim: what is missing,
where you looked, and why it is not recorded. Do not guess a value or cite a
secondary source to fill the gap.

```json
"unverified": ["Regional (autonomous community) penalty amounts that may displace the State regime under RDL 1/2013 art. 78: not checked."]
```

## Add a jurisdiction

Any EU member state can be added
([codes](data-format.md#allowed-jurisdiction-codes)). Open a "New jurisdiction"
issue first, so the work is not done twice.

For each claim, find the provision in the transposing law and quote it. Required:
`applicationDate`, `microenterpriseExemption`, `microenterpriseDefinition`,
`presumptionOfConformity` (and whether it names an EN 301 549 version),
`penalties` and `transitionalServiceContracts`. Optional, if the law has them:
`supervisoryAuthority` (and where the authority is designated),
`transitionalSelfServiceTerminals` and `nationalStandardReference`. What each
holds is in the [claim list](data-format.md#claim-list).

Sources: the law on the official legislation or gazette site, the consolidated
text where one is published, the designating ordinance for the authority, and the
authority's own site only for what only it says. Note in each source what the
consolidated text is consolidated to, and list amendments you did not check in
`unverified`. If a required claim has no source, open the pull request anyway
and say so; the maintainer decides. An optional claim without a source is left
out and listed in `unverified`.

To create the file, copy `se.json` (the smallest) to `<code>.json` in lower case
(Greece is `gr.json`), set `jurisdiction`, `name` and `instrument`, replace the
sources, claims and `unverified`, and remove any `harmonisation` block.

Three places in code must change before it loads; leave them to the maintainer if
you do not write code, and list the languages, currency and hosts in the pull
request:

- `PUBLISHED` in `src/dataset/index.ts`;
- the `language` and `currency` enums in `src/dataset/schema.ts`, for a new
  language (today `en`, `sv`, `de`, `es`) or currency (`EUR`, `SEK`);
- `OFFICIAL_SOURCE_HOSTS` in `src/dataset/officialHosts.ts`.

Before the pull request, run the three commands in
[Check your change locally](#check-your-change-locally).

## Review

The owner reviews every change to legal content. For each changed claim: the
source is official and opens; the pinpoint names the provision; the quote is
there word for word; the translation is faithful and a machine translation is
marked ([rule](data-format.md#translations)); the value reads the quote
correctly; `retrievedAt` is the day the source was read; and anything uncertain
is in `unverified`.

A disagreement about the law is settled by the primary text at the pinpoint, not
by commentary or other countries' practice. If the text does not settle it, the
point goes in `unverified`.

## Credit and licence

Everything in `data/` is CC BY 4.0 ([DATA-LICENSE](../DATA-LICENSE)); by
contributing you agree to publish under it. Quoted legislation remains its
publishers' work. Contributors are credited by name in
[CHANGELOG.md](../CHANGELOG.md); say in your pull request how you would like to
be named.
