# Contributing data

This page is for people who know the law or accessibility and want to correct or
add to the dataset. You do not need to write code. The "Report" and "Correct"
paths below need only a GitHub account and a web browser.

The format of the files is described in [data-format.md](data-format.md). Terms
such as claim, citation and pinpoint are defined in [CONTEXT.md](../CONTEXT.md).

## Before you start

Three things every change has to meet:

- Official sources only. A source is an official document: the law on an
  official legislation site, an official gazette, a European Commission page, or
  a supervisory authority's own site. The permitted hosts are listed in
  `src/dataset/officialHosts.ts`. Blogs, law firm notes, news articles and secondary
  databases are not sources, even when they are right. Use them to find the law,
  then cite the law.
- Quotes are verbatim. Copy the exact words from the source, in its language,
  with any omission marked `…`. At most 30 words. Every quote from a non-English
  source needs an English translation.
- Every change is reviewed against the source. The reviewer opens your URL, finds
  your pinpoint and reads your quote there. If it is not there, the change is not
  merged.

The data is under CC BY 4.0 (see [Credit and licence](#credit-and-licence)).

## Report a wrong or outdated value

If you see a value that is wrong or out of date and do not want to edit the file
yourself, open an issue:

1. Go to https://github.com/Rez-1/eaa-cite/issues/new/choose.
2. Choose "Data correction".
3. Fill in the form:
   - the jurisdiction and the claim (for example Germany, `penalties`);
   - what is wrong;
   - the source URL and the pinpoint where the correct value is stated;
   - the quote, word for word in the source's language.

The quote and pinpoint matter most. With them the maintainer can check and fix
the value quickly. Without them, the report starts a research task.

## Correct a value

### Edit the jurisdiction file

Each jurisdiction has one file in `data/jurisdictions/`: `eu.json`, `se.json`,
`de.json`, `es.json`.

1. Find the claim under `claims`. The claim ids are listed in
   [data-format.md](data-format.md#claim-list).
2. Change the `value`.
3. Change the citation to match. A value and its citation change together: the
   `pinpoint` must name where the new value is stated, and the `quote` must be the
   text that states it. Update the `translation` too.
4. If the citation points to a source that is not yet in the file, add it (see
   [Add a citation or a source](#add-a-citation-or-a-source)).
5. On the source you read, set `retrievedAt` to today's date, as `YYYY-MM-DD`.
6. If the old value had an entry in `unverified` that your change answers,
   remove it.

Keep the JSON valid: double quotes around every string, commas between items, no
comma after the last item in a list.

Check field names against [data-format.md](data-format.md). A misspelt field or
claim id stops the file loading, and the error names the key, for example
`claims: Unrecognized key: "penalty"`.

### Edit on GitHub without installing anything

1. Open the file on GitHub, for example
   https://github.com/Rez-1/eaa-cite/blob/main/data/jurisdictions/de.json.
2. Click the pencil icon ("Edit this file"). GitHub offers to fork the
   repository; accept.
3. Make your change.
4. Click "Commit changes", write a one-line description, and choose "Propose
   changes".
5. Open the pull request. The template asks which sources you checked and
   whether you updated `retrievedAt`.

The checks then run on GitHub for you:

- `ci` loads every file and runs the tests. A broken file shows the problem list
  described in the next section.
- `verify-sources` runs because the pull request touches `data/`. It fetches
  every source and checks every quote is still there, including yours. Sources
  on www.gesetze-im-internet.de are skipped in CI
  ([why](verification.md#the-monthly-job)); the maintainer checks a German change
  locally.

If this is your first pull request to the repository, the maintainer may need to
approve the checks before they run. If a check fails, open it ("Details") to read
the message, edit the file again on your fork's branch, and the checks run again.

### Check your change locally

If you have Node 22 and a clone of the repository (see
[install.md](install.md)):

```bash
npm run cli -- check-data data/jurisdictions/es.json   # the load rules, on one file
npm test                 # loads every file and checks the editorial rules
npm run verify-sources   # fetches every source and checks every quote
```

`check-data` is the quickest: it checks just the file you edited and lists every
problem, without running the whole test suite. See [cli.md](cli.md#check-data).

If a file breaks a load rule, you get a `DatasetIntegrityError` that names the
file and lists every problem at once, one per line
([example](data-format.md#load-rules)). Each line starts with the path to the
problem. `claims.penalties.citations[0]`
is the first citation of the `penalties` claim (counting starts at 0).
`sources.0.language` is the `language` of the first source. Fix every line,
then run the tests again. The list of rules and their messages is in
[data-format.md](data-format.md#load-rules).

If a file loads but breaks an editorial rule, `npm test` reports a failed test,
for example a quote over 30 words. See
[data-format.md](data-format.md#editorial-rules).

For what `verify-sources` reports, see [verification.md](verification.md).

## Add a citation or a source

A claim can have more than one citation, for example when one provision sets the
rule and another sets the amounts.

To add a source, add an entry to the file's `sources` list:

```json
{
  "id": "bfsg-38",
  "title": "BFSG § 38 Übergangsbestimmungen",
  "kind": "consolidated-text",
  "url": "https://www.gesetze-im-internet.de/bfsg/__38.html",
  "language": "de",
  "retrievedAt": "2026-11-08",
  "verify": "quote"
}
```

- Pick an `id` that says what the source is: lower-case letters, digits and
  hyphens, unique in the file. Follow the file's pattern: `bfsg-38` for BFSG
  § 38, `sfs-2023-254` for SFS 2023:254, `ley-11-2023` for Ley 11/2023.
- Choose the `kind` from the six in
  [data-format.md](data-format.md#source-kinds).
- Add `identifier` if the document has an official one (CELEX, SFS, BGBl, BOE).
- Add a `note` for anything a reader should know, such as "The authority
  describing itself. Not a designating provision."

Choose `verify` ([data-format.md](data-format.md#quote-or-manual-verification)):
`quote` almost always. Use `manual` only if a script cannot read the page, and
say why in the `note`. A `manual` source is re-checked by a person, so prefer
another official URL for the same text if there is one.

Then cite it from a claim, by `id`:

```json
{
  "source": "bfsg-38",
  "pinpoint": "BFSG § 38 Absatz 2",
  "quote": "…",
  "translation": "…"
}
```

Every source must be cited at least once, and every citation must name a listed
source. A file that breaks either rule does not load.

A source on a new website, even an official one, does not load until its host
is added to `src/dataset/officialHosts.ts`. The maintainer does that; say in the
pull request that the host is new.

## Record something you could not confirm

If you looked for something and could not confirm it from an official source,
add a sentence to the file's `unverified` list instead of writing a claim.

```json
"unverified": [
  "Regional (autonomous community) penalty amounts that may displace the State regime under RDL 1/2013 art. 78: not checked."
]
```

Say what is missing, where you looked, and why it is not recorded. Do not guess
a value and do not cite a secondary source to fill the gap. A clear "not
confirmed" is more useful to a reader than a value nobody can check. See
[data-format.md](data-format.md#unverified).

## Add a jurisdiction

Any EU member state can be added, and nothing outside the EU
([data-format.md](data-format.md#allowed-jurisdiction-codes)). Start by opening a "New jurisdiction" issue
(https://github.com/Rez-1/eaa-cite/issues/new/choose) so the work is not done
twice.

### Research checklist

For each claim, find the provision in the transposing law and quote it. The
required claims are:

| Claim | What to find |
|---|---|
| `applicationDate` | The commencement provision that applies the obligations from 28 June 2025. |
| `microenterpriseExemption` | The provision exempting microenterprises that provide services. |
| `microenterpriseDefinition` | The definition of a microenterprise: headcount, turnover and balance sheet thresholds, and how they combine. |
| `presumptionOfConformity` | The provision giving a presumption of conformity through harmonised standards, and whether it names an EN 301 549 version. |
| `penalties` | The penalty provisions: currency, the highest fine stated, any tiers. |
| `transitionalServiceContracts` | The transition for service contracts concluded before 28 June 2025: a date, or a period. |

The optional claims, if the law has them:

| Claim | What to find |
|---|---|
| `supervisoryAuthority` | Which body supervises e-commerce services, and where the law or ordinance designates it. |
| `transitionalSelfServiceTerminals` | How long existing self-service terminals may stay in use. |
| `nationalStandardReference` | A national standard the law points to separately. |

Which sources qualify: the law on the official national legislation or gazette
site; the consolidated text where the state publishes one; the designating
ordinance for the authority; the authority's own site for what only it says.

When a claim has no source: if it is required, open the issue or pull request
anyway and say which claim you could not source; the maintainer decides how to
proceed. If it is optional, leave it out and add an entry to `unverified`.

Laws are often amended. Note in each source's `note` what the consolidated text
is consolidated to, as `se.json` does, and list amendments you did not check in
`unverified`.

### Create the jurisdiction file

1. Copy an existing file. `se.json` is the smallest.
2. Name the copy after the two-letter code in lower case, for example
   `data/jurisdictions/fr.json` for France. Greece is `gr.json`.
3. Set `jurisdiction` to the code in upper case (`"FR"`), `name` to the English
   name, and `instrument` to the transposing law's title in its own language.
4. Replace the sources, claims and `unverified` with your own.
5. Remove any `harmonisation` block. Only the EU file has one.

### Register it in code

Three places outside the data must change before the new file loads and passes
the tests:

- `PUBLISHED` in `src/dataset/index.ts`, the list of files that are loaded;
- the `language` enum in `src/dataset/schema.ts` if the law is in a language not
  yet listed (today `en`, `sv`, `de`, `es`), and the `currency` enum if the fines
  are in a currency not yet listed (today `EUR`, `SEK`);
- `OFFICIAL_SOURCE_HOSTS` in `src/dataset/officialHosts.ts`, for each new website.

If you do not write code, leave these to the maintainer. Say in the pull request
that the jurisdiction is new, and list the languages, currency and domains it
uses.

### Checks before opening a pull request

Run the three commands in [Check your change locally](#check-your-change-locally).
The file must load, pass the editorial rules, and have every quote found on its
live page. If you cannot run `verify-sources`, the check on the pull request does
it for you.

## Review

The owner reviews every change to the legal content. For each changed claim the
review checks:

- the source is official and the URL opens;
- the pinpoint names the provision that states the value;
- the quote is there, word for word;
- the translation is faithful, and a machine translation is marked as one
  ([data-format.md](data-format.md#translations));
- the value reads the quote correctly;
- `retrievedAt` is the date the source was read;
- anything left uncertain is in `unverified`, not in a claim.

When there is a disagreement about how to read the law, the primary text
settles it. Arguments rest on the words of the law at the pinpoint, not on
commentary or on what other countries do. If the text does not settle it, the
point goes in `unverified` until a source does.

## Credit and licence

Everything in `data/` is under the Creative Commons Attribution 4.0 licence (CC
BY 4.0); see [DATA-LICENSE](../DATA-LICENSE). By contributing to `data/` you
agree that your contribution is published under that licence. Quoted legislation
remains the work of its publishers and is quoted to identify each provision.

Contributors are credited by name in the contributors section of
[CHANGELOG.md](../CHANGELOG.md), in the release that includes their change. Say
in your pull request or issue how you would like to be named.
