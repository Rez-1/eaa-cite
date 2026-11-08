# Every claim carries its citation

Each value in `data/jurisdictions/*.json` sits inside a claim, and a claim has at
least one citation: a source id, a pinpoint (article, paragraph, point), a
verbatim quote in the source's language, and an English translation when the
source is not in English. The Zod schema in `src/dataset/schema.ts` makes a value
without a citation unrepresentable.

`parseJurisdictionFile` (`src/dataset/load.ts`) adds the structural rules a schema
cannot express, and a file that breaks them does not load: every citation names a
listed source, every source is cited, source ids are unique, non-English quotes are
translated, and the file declares the jurisdiction it is named for. Callers only
ever see citations with their source filled in.

Sources must be on an official host (`src/dataset/officialHosts.ts`), also a load
rule, because `verify-sources` fetches every source URL. Quote length (under 30
words) is judgement and stays a test. Age is checked by `verify-sources`, which
flags any source retrieved more than a year ago; a load check or a unit test on
the date would stop a published copy working a year after release.

## What a citation does and does not prove

The rules above prove that each value has a citation, that the citation's quote
is on the cited page, and that the source is official. They do not prove that
the value follows from the quote: a file whose maximum fine says 1 instead of
100,000 would still load if the quote is intact. Matching values to quotes is
review work, done by a person when a data change is merged
([docs/contributing-data.md](../contributing-data.md#review)). The README's
claim is that every value is tied to an article, not that a machine has checked
the value against it.

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
monthly.

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

## Why callers get the whole source

Every citation a caller reads, including MCP tool output, carries its full source:
kind, verification mode and the editor's note as well as title, URL and date. Some
of those notes are housekeeping ("the page is ISO-8859-1 encoded"), and trimming
them was considered. They stay, because others are legal caveats a reader needs
next to the quote: the MLBF source is noted as the authority describing itself, not
a provision designating it. Deciding per note which ones an agent may see would be
a judgement made in code, out of sight of whoever reads the answer.
