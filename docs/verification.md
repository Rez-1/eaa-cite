# Source verification

How the quotes behind every value are re-checked against the live sources, and
what to do when a check fails. The script is `scripts/verify-sources.ts`; the CI
job is `.github/workflows/verify-sources.yml`.

Every citation is checked: every claim in every published file, and the EU
harmonisation status. Sources marked `verify: "quote"` are fetched and checked.
Sources marked `verify: "manual"` are listed for a person to re-check; today that
is Germany's federal gazette (`bgbl-2021-i-2970`), which serves its PDFs through
a JavaScript viewer.

The script never edits the data: a missing quote can mean the law changed, the
page moved, or the quote was wrong, and only a person can tell which
([ADR 0001](adr/0001-every-claim-carries-its-citation.md)).

## How the check works

For each `quote` source, one at a time (these are public-service sites):

1. Fetch the URL, following redirects between official hosts only, with a
   30-second timeout. Any non-success status is a failed fetch.
2. Decode in the character set the server declares, else the page's
   `<meta charset>`, else UTF-8 (gesetze-im-internet.de serves ISO-8859-1).
3. Reduce the HTML to readable text (`readableText` in `src/dataset/quotes.ts`):
   drop scripts, styles and tags, decode entities, fold curly quotes, guillemets
   and dashes, remove soft hyphens, and collapse whitespace. Statute sites wrap
   words in markup mid-sentence, so the raw HTML would miss text that is there.
4. Split each quote around its omission marks (`…`, `[…]`, `[...]`) and look for
   each piece in order. The first piece not found is reported.
5. Look for any `absent` phrase the citations list.
6. Print the SHA-256 of the page. It is never compared with an earlier one:
   statute pages change their markup often, so a new hash says nothing about the
   law.

## Run it yourself

With Node 22, a clone ([install.md](install.md)) and network access:

```bash
npm run verify-sources
npm run --silent verify-sources -- --json > verification.json   # as CI does
npm run verify-sources -- --skip-host www.gesetze-im-internet.de  # once per host
```

Each line is the status, jurisdiction, source id and the start of the page hash:

```
ok      DE bfsg-37  sha256 1c702279e5cc
manual  DE bgbl-2021-i-2970
MISSING DE bfsg-37  sha256 1c702279e5cc
          penalties (BFSG § 37 Absatz 2 (offences listed in § 37 Absatz 1)): not found: "Absatzes 1 Nummer 1, 7, 8, 9 und 10 …"
```

(The `MISSING` line is an illustration; no quote is missing today.) The run ends
with the manual sources to re-check. In the JSON, each result has
`jurisdiction`, `source`, `url`, `status` and `sha256`; a `quote-missing` result
adds `missing` (`claim`, `pinpoint`, `segment`), a `fetch-failed` result adds
`error`, and a stale one has `"stale": true`.

## Reading the result

| Status | Shown as | Meaning | Fails the run |
|---|---|---|---|
| `ok` | `ok` | Fetched, and every quote found. | no |
| `quote-missing` | `MISSING` | Fetched, and at least one quote not found. | yes |
| `phrase-found` | `FOUND` | A phrase listed as `absent` is now on the page, so a claim of absence such as "not cited" may no longer hold. | yes |
| `fetch-failed` | `FAILED` | Network error, timeout or HTTP error. Nothing was checked. | yes |
| `manual` | `manual` | Not fetched; a person must check it. | no |
| `skipped` | `skipped` | Its host was passed to `--skip-host`. | no |

A source whose `retrievedAt` is more than 365 days old is also marked `STALE`,
whatever its status, and fails the run. The exit code is 1 when anything fails,
else 0. `ok` means the words are still on the page, not that the value is still
right ([below](#what-verification-does-not-prove)).

## The monthly job

The workflow runs on Ubuntu with Node 22: on every pull request that changes
`data/`, on the 1st of each month at 06:17 UTC, and on demand from the Actions
tab. Monthly fits how rarely the cited texts change (a few times a year, usually
published weeks before they apply) and the owner's aim of fixing a failure within
two weeks. Run it yourself when you need the answer for a given day.

It passes `--skip-host www.gesetze-im-internet.de`, because that site drops
connections from GitHub's runners while the other hosts answer. The German
sources there show as `skipped` in CI and are checked from another network on
the same cadence.

Each run saves `verification.json` as the build artifact `verification`. A failed
scheduled run opens an issue titled "Source check failed" with the label
`verify-sources`, or comments on the open one, with a link to the run and each
failing source with its error or affected claims. A failed pull-request run shows
only as a failed check.

## When it fails

Start from the issue, which names each failing source and, for a missing quote,
the claim and pinpoint. The artifact or a local run gives the missing piece.

### A quote is missing

1. Open the source URL, go to the pinpoint, and look for the quote. The reported
   piece is the first one not found.
2. Decide what happened:
   - The law was amended. Read the new text, then update the `quote`,
     `translation` and, if needed, `value` and `pinpoint`. If you cannot yet tell
     what the amendment means, say so in `unverified`.
   - The page moved or was restructured. Update the `url`, and the `pinpoint` if
     the numbering changed.
   - The quote was wrong to begin with. Correct it against the source.
3. Set `retrievedAt` to the day you read it, run `npm test` and
   `npm run verify-sources`, and open a pull request that links the issue. Close
   the issue once the fix is merged and the next run passes.

### A fetch failed

1. Run it again, or re-run the workflow; public sites have short outages.
2. If it still fails, open the URL in a browser. If the site is down, wait and
   comment on the issue. If the page moved, update the `url` and check every
   quote that cites it. If it opens in a browser but not for the script, look for
   the same document at another official URL that serves plain HTML.
3. Switch to `verify: "manual"` only when no official URL can be fetched by a
   script, and say why in the `note`. Every re-check then costs a person's time.

### A manual source is due

Manual sources never fail the run, so the reminders are the list at the end of
each run and the 365-day `STALE` rule. Open the URL, confirm every citing quote at
its pinpoint, set `retrievedAt` to today (or follow
[A quote is missing](#a-quote-is-missing)), and open a pull request saying which
source you re-checked by hand.

The script never updates `retrievedAt`, for `quote` sources either. After a
passing run, someone still updates the dates of the sources it confirmed, or the
age rule fails within the year.

## What verification does not prove

- That the value is right. The load rules check that each number and date in a
  value appears in its citations, not that it is the right one; review does that.
- That the quote still supports the value. Another provision can change what the
  same words mean.
- That the law has not changed elsewhere. An amendment to a provision nobody
  quotes is invisible.
- That a manual source is current, or that the page is not outdated or
  superseded.

For those, read the source and its amendment history. Known gaps are in each
file's `unverified` list.
