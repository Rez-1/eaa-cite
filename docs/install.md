# Install

eaa-cite is not published to npm. You install it by cloning the repository and
building it.

## Requirements

| | |
|---|---|
| Node | 22 or later (`engines` in `package.json`). Tested on Node 22. |
| npm | The version that comes with Node. |
| git | To clone the repository. |
| Disk | About 230 MB for `node_modules`. Chromium for scans adds roughly 600 MB on macOS. |
| Operating system | Tested on Ubuntu (in CI) and macOS. Other systems have not been tried. |

## Install from source

```bash
git clone https://github.com/Rez-1/eaa-cite
cd eaa-cite
npm install
npm run build
```

`npm run build` compiles `src/` into `dist/` with `tsconfig.build.json`, skipping
the test files. You get JavaScript and type declarations for every module,
including the server entry point at `dist/mcp/bin.js`.

The code reads its data from `data/` next to `dist/`, so keep the clone together.
Copying `dist/` somewhere on its own will not work.

## Install Chromium for scans

The two scan tools run axe-core in headless Chromium, installed through
Playwright:

```bash
npx playwright install chromium
```

On Ubuntu, add the system libraries Chromium needs. This is what CI runs:

```bash
npx playwright install --with-deps chromium
```

Everything except scanning works without Chromium. The lookups
(`get_obligations`, `compare_jurisdictions`, `conformance_statement`,
`explain_criterion`) never start a browser. A scan without Chromium fails with a
`Scan failed:` message; see [mcp-setup.md](mcp-setup.md#scans-fail).

## Check the install

```bash
npm run demo
```

This starts the server over stdio, the way an MCP client does, and calls three
tools. It needs Chromium for the last one. The output should look like this:

```
> get_obligations { country: "DE" }  (penalties only)

maxFine: 100000 EUR
  BFSG § 37 Absatz 2 (offences listed in § 37 Absatz 1)
  "Absatzes 1 Nummer 1, 7, 8, 9 und 10 mit einer Geldbuße bis zu hunderttausend Euro und in den übrigen Fällen … bis zu zehntausend Euro"
  = in the cases of paragraph 1 numbers 1, 7, 8, 9 and 10, a fine of up to EUR 100,000, and in the other cases up to EUR 10,000
  https://www.gesetze-im-internet.de/bfsg/__37.html (retrieved 2026-11-08)
harmonisation: not_cited (from eu, checked 2026-11-08)

> compare_jurisdictions { claim: "transitionalSelfServiceTerminals" }

  EU: max 20 years  (Article 32(2))
  DE: max 15 years  (BFSG § 38 Absatz 2)
  ES: max 10 years  (Ley 11/2023, disposición transitoria única, apartado 2)
  no data: SE

> scan_html { html: <test/fixtures/shop-with-defects.html> }

  9.1.1.1  Non-text Content           image-alt
  9.1.4.3  Contrast (Minimum)         color-contrast
  9.3.1.1  Language of Page           html-has-lang
  9.4.1.2  Name, Role, Value          button-name, label
  4 failing, 0 need review, 43 of 50 not checked by axe
```

The dates and quotes change when the data is updated. If the first two sections
print and the third fails, the server works and Chromium is missing.

`npm run demo` runs the server from `src/` with `tsx`, not the built
`dist/mcp/bin.js`. To check the built server your MCP client will run, add it to
the client and follow [mcp-setup.md](mcp-setup.md#try-it).

## Update

```bash
cd eaa-cite
git pull
npm install
npm run build
```

Then restart your MCP client so it starts the new server. If a Playwright update
needs a newer Chromium, run `npx playwright install chromium` again.

There are no tagged releases yet, so updating means pulling `main`.
[CHANGELOG.md](../CHANGELOG.md) records what changed, including the date the
data was retrieved.

## Uninstall

1. Remove the `eaa-cite` entry from your MCP client: delete it from
   `claude_desktop_config.json` for Claude Desktop, or run
   `claude mcp remove eaa-cite` for Claude Code. See [mcp-setup.md](mcp-setup.md).
2. Remove the Chromium that Playwright installed, from inside the clone:

   ```bash
   npx playwright uninstall
   ```

   This removes the browsers used by this Playwright version. Other projects on
   the machine may share them; `npx playwright uninstall --all` removes every
   Playwright browser. The cache lives in `~/Library/Caches/ms-playwright` on
   macOS and `~/.cache/ms-playwright` on Linux.
3. Delete the cloned folder.
