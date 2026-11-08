# Every claim carries its citation

Each value in `data/jurisdictions/*.json` sits inside a claim, and a claim has at
least one citation: a source id, a pinpoint (article, paragraph, point), a
verbatim quote in the source's language, and an English translation when the
source is not in English. The Zod schema in `src/dataset/schema.ts` makes a value
without a citation unrepresentable. The tests in `test/dataset.test.ts` add the
rules a schema cannot express: every citation names a listed source, every source
is cited, quotes stay under 30 words, and nothing was retrieved more than a year
ago.

## Why a link per law is not enough

A link to the statute tells a reader where to start looking. It does not tell
them which of eighty paragraphs a fine of EUR 100,000 comes from, or whether the
number was in the text at all. Penalty amounts, exemption thresholds and
transition dates are the values people act on, and they are the values most
likely to be paraphrased wrongly or carried over from a neighbouring country.

## Why the quote is checked against the live page

`npm run verify-sources` fetches each source and looks for every quote that
cites it, piece by piece around any ellipsis. A missing quote means the text was
amended, the page moved, or the quote was wrong when it was written. All three
need a person, so the script exits non-zero and never edits the data. CI runs it
weekly.

Page hashes are printed but not compared. Consolidated statute pages change their
markup often, and a hash mismatch on a page whose quotes are all still present
says nothing about the law.

## Sources a script cannot read

The German federal gazette serves its PDFs through a JavaScript viewer with
session-bound links. Sources like that are marked `verify: "manual"` and listed
at the end of every verification run, so they are re-checked by a person, not
silently skipped.

## What is not recorded

Anything the research looked for and could not confirm from an official source
goes in the file's `unverified` list instead of a claim. For example, the Länder
treaty that founds Germany's market surveillance body is published in Land
gazettes, and no official federal page names it, so the dataset cites the body's
own description of itself and says so.
