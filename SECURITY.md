# Security policy

## Supported versions

The project is pre-release: there are no tagged versions. Fixes go to the `main`
branch.

## Report a vulnerability

Use GitHub's private vulnerability reporting: on
[github.com/Rez-1/eaa-cite](https://github.com/Rez-1/eaa-cite), open the Security
tab and choose "Report a vulnerability". Do not open a public issue.

Include:

- what an attacker can do, and what they need first
- steps or input that reproduce it (the tool or function called, and its arguments)
- the commit or tag you tested, your Node version and OS, and the MCP client if
  one is involved

Reports are acknowledged within 7 days.

## What the scanner does

`scan_url` loads any http or https URL in headless Chromium, including
`localhost` and private network addresses. A scan that starts at a public
address may not navigate to a private one. `scan_html` runs markup in an offline
browser context, and the test suite checks each refused request type against a
local server. The full rules are in [docs/tools.md](docs/tools.md#scan_url); the
code is `src/scan/scanner.ts` and `src/scan/privateHost.ts`.

Known gaps in those rules:

- The redirect rule covers the page's own navigations only. Images, scripts,
  frames and requests made by the page's scripts are not checked.
- The check resolves the name separately from the fetch, so a name whose DNS
  answer changes between the two lookups (DNS rebinding) can get past it.
- There is no limit on how many scans run at once. Each uses its own browser
  context in one shared Chromium.

A scan report contains text the page controls: selectors built from its ids and
classes (cut to 120 characters) and its final URL. An assistant should treat the
report as data, not instructions; the report's own caveat says so.

The lookup tools and the two resources read only the checked-in data and make no
network requests.

## Running the server safely

- The server runs with the permissions of the user who starts it, and so does the
  Chromium it launches.
- An assistant connected to the server can ask `scan_url` to load any URL,
  including one it read in a web page or a document. That includes private
  addresses given directly, such as local admin pages or services on your
  network.
- Run the server only where everything it can reach over the network is fine to
  load. On a shared or remote host, put it in a container or network that cannot
  reach internal services or cloud metadata addresses.
- If you only scan markup you already have, `scan_html` needs no network access.
  Scans run the page's scripts in Chromium, so treat markup from strangers as you
  would any untrusted page.

## In scope

- `scan_url` or `scan_html` reaching something this page says they cannot, such
  as a non-http scheme, a navigation from a public start to a private address
  other than through the gaps listed above, or a network request from `scan_html`
- reading local files or running code on the host through any tool or resource
- a crafted input that crashes the server or makes it hang
- the scripts in `scripts/` and the workflows in `.github/workflows/`

## Out of scope

- `scan_url` loading a private address it was given directly, a public page
  loading resources from a private address, DNS rebinding, or many scans run at
  once. These are documented above.
- Errors in the legal data. Report those as a data correction instead; see
  [docs/contributing-data.md](docs/contributing-data.md).
- Vulnerabilities in dependencies (Chromium, Playwright, axe-core, the MCP SDK)
  that do not depend on how this project uses them. Report those upstream.
