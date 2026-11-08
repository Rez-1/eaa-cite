# Command line

`eaa-cite` runs four commands from a terminal: scan a page, read a
jurisdiction's obligations, compare one claim across jurisdictions, and check a
jurisdiction file before a pull request. Each command calls the same function
the MCP tools use (see [tools.md](tools.md)), so the answers match.

## Run it

From a clone, after the steps in [install.md](install.md):

```bash
npm run build
node dist/cli/main.js --help
```

During development, `npm run cli -- <command>` runs the TypeScript source
directly. The package declares the `eaa-cite` bin, so after `npm link` you can
type `eaa-cite <command>` anywhere.

Every command takes `--json` to print its result as JSON instead of text.

| Exit code | Meaning |
|---|---|
| 0 | Done |
| 1 | The answer is bad news: `scan` found clause 9 failures, or `check-data` found a file that does not load |
| 2 | The command could not run: wrong arguments, an unknown jurisdiction or claim, or a scan that failed (unreachable page, refused redirect, missing Chromium) |

So `eaa-cite scan` can gate a CI step: it exits 1 when anything fails.

## scan

```bash
node dist/cli/main.js scan https://shop.example/
node dist/cli/main.js scan page.html
```

A URL is scanned in headless Chromium. A local file is scanned as HTML in an
offline browser context, so its external stylesheets, images and scripts do
not load: a contrast result can differ from the live page, and the report's URL
reads `about:blank (inline HTML)`, not the file name. The same rules apply as for the
[`scan_url`](tools.md#scan_url) tool, including the redirect rule for private
addresses.

```
about:blank (inline HTML)  (axe-core 4.14.0)

Failing: 4 of 50 clause 9 criteria
  9.1.1.1   Non-text Content                     image-alt (1)
  9.1.4.3   Contrast (Minimum)                   color-contrast (1)
  9.3.1.1   Language of Page                     html-has-lang (1)
  9.4.1.2   Name, Role, Value                    button-name (1), label (1)

Not checked by axe: 43 criteria need a person.
```

The full output ends with the caveat every scan carries: a clean scan is not a
clean audit. How to read the groups is in [results.md](results.md#read-a-scan-report).

## obligations

```bash
node dist/cli/main.js obligations se              # every claim
node dist/cli/main.js obligations se penalties    # one claim
```

The code is `EU`, `SE`, `DE` or `ES`, in any case. Each value is printed
with every citation: pinpoint, quote, translation and source URL.

```
Sweden: Lag (2023:254) om vissa produkters och tjänsters tillgänglighet
Harmonisation status: not_cited (from the EU-level check, oldest source 2026-11-08)

penalties: Orders to comply (32–34 §§), which may carry a conditional fine (35 §, no amount stated), and an administrative penalty fee (37–40 §§). | currency SEK, maxFine 10000000
  Lag (2023:254) 39 § första stycket
    "Sanktionsavgiften ska bestämmas till lägst 10 000 kronor och högst 10 000 000 kronor."
    = The administrative penalty fee shall be set at no less than SEK 10,000 and no more than SEK 10,000,000.
    https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2023254-om-vissa-produkters-och-tjansters_sfs-2023-254/ (retrieved 2026-11-08)
```

Without a claim, the output ends with the file's list of things that could
not be confirmed.

## compare

```bash
node dist/cli/main.js compare transitionalSelfServiceTerminals
```

One claim for every published jurisdiction, with the first citation of each,
then the jurisdictions with no value for it. `--help` lists the claim ids.

## check-data

```bash
node dist/cli/main.js check-data my-edits/es.json
node dist/cli/main.js check-data draft.json --as DE
```

Runs the schema and the load rules from [data-format.md](data-format.md#load-rules)
on a jurisdiction file. The file is checked as the jurisdiction its name
gives (`es.json` as Spain) unless `--as` says otherwise.

```
data/jurisdictions/es.json loads: ES, 9 claims, 16 citations, 3 sources.
```

A file that does not load gets every problem at once, one line each, and exit
code 1. This includes the official-host rule. Quote length is checked by
`npm test`, and source age by `npm run verify-sources`.
