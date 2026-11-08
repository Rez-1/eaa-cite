# Source verification

Every value in the dataset rests on a quote from an official source. This page
explains how those quotes are re-checked against the live sources, and what to
do when a check fails. The script is `scripts/verify-sources.ts`; the CI job is
`.github/workflows/verify-sources.yml`.

## What is checked

- Every quote, against the source it cites. That covers every claim's citations
  in every published jurisdiction file, and the citations of the EU harmonisation
  status.
- Sources marked `verify: "quote"` are fetched and checked by the script.
- Sources marked `verify: "manual"` cannot be read by a script. They are not
  fetched; they are listed at the end of the run for a person to re-check. Today
  that is one source, Germany's federal gazette (`bgbl-2021-i-2970`), which serves
  its PDFs through a JavaScript viewer.

The script never edits the data: a missing quote can mean the law changed, the
page moved, or the quote was wrong, and only a person can tell which
([ADR 0001](adr/0001-every-claim-carries-its-citation.md)).

## How the check works

For each source marked `quote`, in turn:

1. Fetch the URL, following redirects, with a 30-second timeout. Any HTTP status
   other than success counts as a failed fetch. Sources are fetched one at a
   time, because these are public-service sites.
2. Decode the bytes in the character set the server declares, or failing that
   the one in the page's `<meta charset>`, or else UTF-8.
   gesetze-im-internet.de, for example, serves ISO-8859-1.
3. Reduce the HTML to readable text (`readableText` in
   `src/dataset/quotes.ts`): drop `<script>` and `<style>` blocks and every tag,
   decode HTML entities, fold curly quotes and guillemets to straight quotes and
   en and em dashes to hyphens, remove soft hyphens, collapse whitespace, and
   drop the space EUR-Lex prints before some punctuation. Statute sites wrap
   words in markup mid-sentence, so matching the raw HTML would miss text that is
   plainly there.
4. Split each quote citing this source into segments around each omission mark
   (`…`, `[…]` or `[...]`), and fold each segment the same way as the page.
5. Look for each segment in the text, in order: each one must appear after the
   end of the one before. The first segment not found is reported.
6. Record the SHA-256 of the fetched bytes.

The hash is printed for the record and never compared with an earlier one.
Consolidated statute pages change their markup often, and a changed hash on a
page whose quotes are all still there says nothing about the law. Two runs on
the same day gave the EUR-Lex directive page two different hashes, with every
quote found both times.

## Run it yourself

You need Node 22 and a clone with dependencies installed (see
[install.md](install.md)), and network access to the source sites.

```bash
npm run verify-sources
```

Output from a run on 2026-11-08:

```
ok      EU dir-2019-882  sha256 0a4c6224b790
ok      EU commission-harmonised-standards  sha256 d632c9156d27
ok      EU commission-wad-standards  sha256 062bd5390512
ok      SE sfs-2023-254  sha256 dd2fefd932fc
ok      SE sfs-2023-676  sha256 20c1ae514559
ok      DE bfsg-2  sha256 439aee6a9b40
ok      DE bfsg-3  sha256 7111f0b644b9
ok      DE bfsg-4  sha256 ac56075850ec
ok      DE bfsg-37  sha256 1c702279e5cc
ok      DE bfsg-38  sha256 05203645bb34
manual  DE bgbl-2021-i-2970
ok      DE mlbf-about  sha256 f410c62ecb72
ok      ES ley-11-2023  sha256 5d1f9e3c4c7d
ok      ES rd-143-2026  sha256 7311e75de8e5
ok      ES rdl-1-2013  sha256 4291039af89d

1 source(s) need a person to re-check: https://www.bgbl.de/xaver/bgbl/start.xav?startbk=Bundesanzeiger_BGBl&jumpTo=bgbl121s2970.pdf
```

Each line is the status, the jurisdiction, the source id and the first 12
characters of the page hash. A failed fetch shows its error instead of a hash.
For a missing quote, each affected citation gets an extra line naming the claim,
the pinpoint and the segment not found. This is what it would look like if the
fine in BFSG § 37 were amended (an illustration; no quote is missing today):

```
MISSING DE bfsg-37  sha256 1c702279e5cc
          penalties (BFSG § 37 Absatz 2 (offences listed in § 37 Absatz 1)): not found: "Absatzes 1 Nummer 1, 7, 8, 9 und 10 mit einer Geldbuße bis zu hunderttausend Euro und in den übrigen Fällen"
```

For machine-readable output, as the CI job uses:

```bash
npm run --silent verify-sources -- --json > verification.json
```

To leave out a host that cannot be reached from where you run it, pass
`--skip-host <host>`, once per host. Its sources are reported as `skipped`.

```json
{
  "checkedAt": "2026-11-08T17:10:00.517Z",
  "results": [
    {
      "jurisdiction": "EU",
      "source": "dir-2019-882",
      "url": "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32019L0882",
      "status": "ok",
      "sha256": "53202e0b922c84a11e72b36bd4beee1950dec1113bb3c617e05a71486731faed"
    },
    …
    {
      "jurisdiction": "DE",
      "source": "bgbl-2021-i-2970",
      "url": "https://www.bgbl.de/xaver/bgbl/start.xav?startbk=Bundesanzeiger_BGBl&jumpTo=bgbl121s2970.pdf",
      "status": "manual"
    },
    …
  ]
}
```

A `quote-missing` result also has a `missing` list, each item with `claim`,
`pinpoint` and `segment`. A `fetch-failed` result has an `error` string.

The script exits with code 1 if any source is `quote-missing` or `fetch-failed`,
and 0 otherwise. `manual` sources do not make it fail.

## Reading the result

| Status | Shown as | Meaning | Fails the run |
|---|---|---|---|
| `ok` | `ok` | The page was fetched and every quote citing it was found. | no |
| `quote-missing` | `MISSING` | The page was fetched, and at least one quote was not found. | yes |
| `phrase-found` | `FOUND` | The page was fetched, and a phrase a citation lists as `absent` is now on it. A claim of absence, such as "not cited", may no longer hold. | yes |
| `fetch-failed` | `FAILED` | The page could not be fetched: a network error, a timeout, or an HTTP error status. Nothing was checked. | yes |
| `manual` | `manual` | The source is marked `verify: "manual"`. It was not fetched; a person must check it. | no |
| `skipped` | `skipped` | Its host was passed to `--skip-host`. It was not fetched. | no |

Any source whose `retrievedAt` is more than 365 days old is also marked `STALE`
(`"stale": true` in the JSON), whatever its status, and fails the run. Stale data
therefore opens an issue even when every quote is still there.

`ok` means the words are still on the page. It does not mean the value is still
right; see [What verification does not prove](#what-verification-does-not-prove).

## The monthly job

`.github/workflows/verify-sources.yml` runs the script on GitHub Actions, on
Ubuntu with Node 22:

- on every pull request that changes a file under `data/`, so a new or changed
  quote is checked live even when the contributor cannot run Node;
- on the 1st of each month at 06:17 UTC;
- on demand, from the Actions tab ("Run workflow").

The job passes `--skip-host www.gesetze-im-internet.de`. That site drops
connections from GitHub's runners: a diagnostic run on 2026-11-08 resolved the
same address as elsewhere (195.74.94.216) but got no answer on port 443 or 80,
with any user agent, while the other official hosts answered. So the six German
sources there show as `skipped` in CI and are checked by running
`npm run verify-sources` from another network, on the same monthly cadence.

Each run saves `verification.json` as a build artifact named `verification`,
whether the check passed or failed. Download it from the run's summary page. It is
kept for the repository's artifact retention period.

When a scheduled run fails, the job opens a GitHub issue titled "Source check
failed" with the label `verify-sources`. If an issue with that label is already
open, it adds a comment to it instead. The issue or comment gives the date, a
link to the run, and a table of each failing source with its status and either
the error or the affected claims and pinpoints. Anyone watching the repository
is notified of the issue in the usual way.

A failed pull-request run does not open an issue. It shows as a failed check on
the pull request.

The owner aims to fix a scheduled failure within two weeks.

Why monthly: the cited texts change a few times a year across all sources, and
most amendments are published weeks before they apply. A monthly run fits the
two-week fix target, makes fewer requests to public sites, and opens fewer
issues for a site that was briefly down. Run `npm run verify-sources` yourself
when you need the answer for a given day.

## When the monthly job fails

Start from the `verify-sources` issue. It names each failing source and, for a
missing quote, the claim and pinpoint affected. Download the `verification`
artifact from the linked run if you need the missing segment itself, or run
`npm run verify-sources` locally.

### A quote is missing

Something about the source changed. Find out what before touching the data.

1. Open the source URL in a browser and go to the pinpoint.
2. Look for the quote. The segment named in the report is the first piece that
   was not found; the pieces before it were.
3. Decide which of three things happened:
   - The law was amended. The provision now says something else. Read the new
     text and decide whether the claim's value changes. Update the `quote`, the
     `translation` and, if needed, the `value` and `pinpoint`. If you cannot yet
     tell what the amendment means, add an entry to `unverified` saying so.
   - The page moved or was restructured. The text is the same, but at a new URL
     or under a new heading. Update the source's `url`, and the `pinpoint` if the
     numbering changed.
   - The quote was wrong to begin with: a typo, or a word that was never in the
     source. Correct the quote against the source.
4. Set `retrievedAt` on the source to the date you read it.
5. Run `npm test` and `npm run verify-sources`. Both should pass.
6. Open a pull request, and link the `verify-sources` issue from it. Close the
   issue when the fix is merged and the next run passes.

### A fetch failed

1. Run `npm run verify-sources` again. Public sites have short outages, and a
   second run often passes. If the failure was on the monthly run, you can also
   re-run the workflow from the Actions tab.
2. If it fails again, open the URL in a browser.
   - If the site is down for everyone, wait and try again later. Comment on the
     issue with what you saw.
   - If the page has moved (a 404 in the error, or a redirect to a search page),
     find the new URL for the same document and update the source's `url`. Then
     treat it as a possible missing quote and check every quote that cites it.
   - If the page opens in a browser but not for the script, the site may be
     blocking automated requests or serving the text through script. Check
     whether the same document is available at another official URL that serves
     plain HTML.
3. Switch the source to `"verify": "manual"` only when no official URL for the
   document can be fetched by a script. Say why in the source's `note`. A manual
   source costs a person's time on every re-check, so it is a last resort.

### A manual source is due

Manual sources appear in every run's output and in the JSON with status
`manual`. They do not fail the run, so nothing reminds you except that list and
the [age rule](#reading-the-result).

To re-check one:

1. Open the source URL in a browser.
2. For every citation of that source, go to the pinpoint and confirm the quote
   is there, word for word.
3. If everything is still there, set `retrievedAt` to today's date.
4. If anything differs, follow [A quote is missing](#a-quote-is-missing).
5. Open a pull request saying which source you re-checked by hand.

The script never updates `retrievedAt`, for `quote` sources either. After a
passing run, someone still has to update the dates for the sources it confirmed,
or the age rule fails within the year.

## What verification does not prove

- That the value is right. The script checks that the quote is on the page. The
  load rules check that each number and date in a value appears in its
  citations, but not that it is the right one; review does that.
- That the quote still supports the value. A provision can keep its words while
  another provision changes what they mean: a new exception, a definition
  rewritten elsewhere, a later law that takes precedence.
- That the law has not changed elsewhere. An amendment to a provision nobody
  quotes is invisible to the check.
- That a manual source is current. Only a person has checked it, on its
  `retrievedAt` date.
- That the source is the right one. A quote can be found on a page that is
  outdated or superseded.

For those, read the source and its amendment history. Known gaps are in each
file's `unverified` list.
