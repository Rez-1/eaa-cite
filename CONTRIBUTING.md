# Contributing

Thank you for helping. This project has one maintainer, who reviews every change
and decides what is merged. Issues are the place for questions and support.

## Ways to help

- Report a wrong or outdated value in the data.
- Add a jurisdiction: research an EU member state's transposing law.
- Fix a bug or improve the code.
- Improve the docs.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Data changes

Changes to `data/` follow their own process and review, written for people who
do not write code: [docs/contributing-data.md](docs/contributing-data.md).

## Set up for development

Install from source with Chromium, as in [docs/install.md](docs/install.md).

## Run the tests

```bash
npm test            # vitest
npm run typecheck   # tsc, no output files
npm run build       # compiles to dist/
```

Most tests need nothing installed. These launch Chromium and need
`npx playwright install chromium` once:

- `test/scan.browser.test.ts`
- `test/test-shop.test.ts`
- the `scan_html with a real browser` block in `test/mcp.test.ts`

No test needs the internet. The test shop is served on `127.0.0.1`, and the
fixtures are loaded with every network request blocked.

Two commands do need the internet and are not part of `npm test`:

```bash
npm run verify-sources   # fetches every official source
npm run try -- --w3c     # also scans W3C's demo site
```

`npm run try` rewrites `examples/RESULTS.md`. Commit the new file only if your
change is meant to alter the results.

## Code changes

### Style

- TypeScript with `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` (see `tsconfig.json`). ESM only.
- Shapes that come from outside the code (data files, tool inputs, model output)
  are Zod schemas.
- Comments explain why the code is the way it is. Look at `src/dataset/load.ts` or
  `src/scan/scanner.ts` for the tone.
- Keep logic pure where it can be, so it is tested without a browser or the
  network. `mapToClauses`, `resolveConformance` and `findQuote` are examples.
- Fixed legal wording, such as the conformance sentences in
  `src/standards/harmonisation.ts`, is tested by comparing whole strings. A change
  to that wording must change the test too, so it shows in review.

### Adding a rule to the loader

The structural rules for a jurisdiction file are the `RULES` list in
`src/dataset/load.ts`. Each rule is a named function that returns a list of
problems; an empty list means the rule holds. To add one:

1. Add a function to `RULES` with a comment saying why the rule exists.
2. In `test/dataset.test.ts`, under `loading`, copy a shipped file with
   `copyOf`, break it the way the rule forbids, and check the problem with
   `problemsLoading`.
3. Run `npm test` to confirm every shipped file still loads.

A rule that depends on judgement (quote length) belongs in the `editorial rules
on the shipped data` block of `test/dataset.test.ts`, not in the loader. A rule
that depends on the date (source age) belongs in `scripts/verify-sources.ts`, so
no test starts failing on its own as time passes.

### Recording a decision

A change that settles a design question someone could reasonably argue the other
way needs an ADR in [`docs/adr/`](docs/adr/). Examples: what the data model can
represent, what a tool may claim, what is left out on purpose.

Follow the existing files: the next number and a title that states the decision
(`0007-<decision-in-a-few-words>.md`), a first paragraph saying what was decided
and where it lives in the code, then the reasons and the alternatives considered.
Keep it short.

## Pull requests

1. Open an issue first for anything larger than a small fix, so the approach can
   be agreed before you write it.
2. Fork the repo, make the change, and run the three commands in
   [Run the tests](#run-the-tests).
3. Open a pull request against `main`.

CI (`.github/workflows/ci.yml`) runs on every pull request: `npm ci`, Chromium
install, `npm run typecheck`, `npm test`, `npm run build`, and `npm run demo` to
check the server starts and answers over stdio. A pull request that touches
`data/` also runs `verify-sources` ([docs/verification.md](docs/verification.md#the-monthly-job)).

In the description, say what changed and why, what you ran, and for data
changes which sources you checked.

Commit messages follow the existing history: a subject line in the imperative
that says what the change does ("Check citations when data loads"), then a body
explaining why.

Contributors are credited in the Contributors section of
[CHANGELOG.md](CHANGELOG.md). Code is under the MIT licence ([LICENSE](LICENSE))
and data under CC BY 4.0 ([DATA-LICENSE](DATA-LICENSE)).

## Domain terms

Use the terms defined in [CONTEXT.md](CONTEXT.md) in code, docs and issues: a
jurisdiction (not a country), a claim (not a rule or field), a citation (not a
reference), a harmonisation status (never "harmonised" on its own). If a change
needs a new term, add it to `CONTEXT.md` in the same pull request.
