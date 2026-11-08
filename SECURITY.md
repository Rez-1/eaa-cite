# Security policy

## Supported versions

Only the latest tagged release gets fixes. Until the first release is tagged,
fixes go to the `main` branch.

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

The two scan tools behave differently on the network:

| Tool | What it can reach |
|---|---|
| `scan_url` | Loads any `http` or `https` URL it is given in headless Chromium, including `localhost` and private network addresses. A scan that starts at a public address follows up to 10 redirects and refuses to navigate to a private address. The page loads its own resources as a normal browser would. |
| `scan_html` | Loads the markup it is given and blocks every network request the markup makes. |

The rules for `scan_url` are in `src/scan/scanner.ts`:

- `assertScannableUrl` refuses every scheme except http and https, including
  `file:`, `data:` and `javascript:`. It is applied to the start URL and to every
  redirect target.
- The scan's starting host decides the rest. If it is private (`localhost`, 0.0.0.0/8, loopback, the RFC 1918 ranges, carrier-grade NAT (100.64.0.0/10), link-local, `::`, IPv6 unique-local and link-local, IPv4 written inside IPv6, or a name
  that resolves to one), the scan may go anywhere. Scanning a local dev server is the
  main use.
- If the starting host is public, each navigation of the page itself is checked,
  and one to a private address stops the scan with `BlockedNavigationError`.
- The check covers the page's own navigations only. Images, scripts, frames and
  requests made by the page's scripts are not checked.
- The check resolves the name separately from Chromium, so a name whose DNS
  answer changes between the two lookups can get past it.

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

- `scan_url` loading a private address it was given directly, or a public page
  loading resources from a private address. This is the documented behaviour
  above.
- Errors in the legal data. Report those as a data correction instead; see
  [docs/contributing-data.md](docs/contributing-data.md).
- Vulnerabilities in dependencies (Chromium, Playwright, axe-core, the MCP SDK)
  that do not depend on how this project uses them. Report those upstream.
