# MCP setup

How to add the eaa-cite server to an MCP client. Install and build it first:
[install.md](install.md).

`dist/mcp/bin.js` is an MCP server that talks over stdio. Its six tools and two
resources are described in [tools.md](tools.md). It has been used with Claude
Desktop and Claude Code.

In every example below, replace `/absolute/path/to/eaa-cite` with the folder you
cloned into. Run `pwd` inside it to get the path.

## Claude Desktop

Open the config file from the app with Settings > Developer > Edit Config, or
open it directly. On macOS it is:

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

Add an `eaa-cite` entry under `mcpServers`. Keep any servers already there.

```json
{
  "mcpServers": {
    "eaa-cite": {
      "command": "node",
      "args": ["/absolute/path/to/eaa-cite/dist/mcp/bin.js"]
    }
  }
}
```

Quit Claude Desktop fully and open it again. The server is started when the app
starts, so a config change needs a restart.

If you manage Node with a version manager such as nvm, the app may not see the
same `node` your terminal does. Use the full path from `which node` as the
`command`, for example `"/Users/you/.nvm/versions/node/v22.12.0/bin/node"`.

## Claude Code

```bash
claude mcp add eaa-cite -- node /absolute/path/to/eaa-cite/dist/mcp/bin.js
```

Everything after `--` is the command Claude Code runs. Check it is registered:

```bash
claude mcp list
```

`claude mcp add` takes a `--scope` option:

| Scope | Who sees the server | Where it is stored |
|---|---|---|
| `local` (default) | You, in the current project only | Your Claude Code settings |
| `project` | Everyone who opens the project | `.mcp.json` in the project root, which you can commit |
| `user` | You, in every project | Your Claude Code settings |

For example, to have it in every project:

```bash
claude mcp add --scope user eaa-cite -- node /absolute/path/to/eaa-cite/dist/mcp/bin.js
```

A `project` entry with an absolute path only works for people whose clone is at
the same path.

To remove it: `claude mcp remove eaa-cite`.

## Other MCP clients

Any client that can start a stdio server needs the same two things:

| | |
|---|---|
| Command | `node` |
| Arguments | `/absolute/path/to/eaa-cite/dist/mcp/bin.js` |

No environment variables or working directory are needed. Only Claude Desktop
and Claude Code have been tried; other clients may work but are untested.

## Try it

Ask the assistant questions like these. It picks the tool; you can also name the
tool in the prompt.

| Prompt | Tool | What you should see |
|---|---|---|
| "What is the highest fine for breaking the EAA in Germany? Quote the law." | `get_obligations` | 100,000 EUR, citing BFSG § 37 Absatz 2, with the German quote and a translation |
| "Compare the transition period for self-service terminals across the jurisdictions you have." | `compare_jurisdictions` | EU 20 years, DE 15, ES 10, and Sweden listed as having no data |
| "What may my audit report for a Swedish shop say about EN 301 549?" | `conformance_statement` | Status `not_cited`, the fixed sentence, and that a presumption of conformity may not be claimed |
| "Explain WCAG 1.4.3 in EN 301 549 terms." | `explain_criterion` | Clause 9.1.4.3, Contrast (Minimum), level AA, with the EN PDF page |
| "Scan http://localhost:3000 for accessibility problems." | `scan_url` | Failing criteria by EN clause, criteria needing review, and the criteria axe did not check |
| "Check this HTML for accessibility problems: `<img src="a.png">`" | `scan_html` | 9.1.1.1 Non-text Content failing on `image-alt`, plus 9.2.4.2 Page Titled and 9.3.1.1 Language of Page, because a bare fragment has no title or `lang` |

For what the answers mean, see [results.md](results.md).

## Troubleshooting

### The server does not appear

- The path is wrong or relative. It must be the absolute path to
  `dist/mcp/bin.js`. Check with `ls /absolute/path/to/eaa-cite/dist/mcp/bin.js`.
- `dist/` was not built. Run `npm run build` in the clone.
- Node is too old, or the client found a different `node`. Run
  `node --version`; it must be 22 or later. In Claude Desktop, give the full path
  to `node` as above.
- `npm install` was not run, so the server cannot load its dependencies. The
  client's log shows an `ERR_MODULE_NOT_FOUND` error.
- The JSON in `claude_desktop_config.json` is invalid, for example a missing
  comma between servers.
- Claude Desktop was not fully restarted.

To see whether the server starts at all, run it by hand:

```bash
node /absolute/path/to/eaa-cite/dist/mcp/bin.js
```

It prints nothing and waits for input on stdin. That means it started. Stop it
with Ctrl+C. An error printed here is the same one the client gets.

### Scans fail

Scan errors come back as text starting `Scan failed:`.

- Chromium is not installed. The message is Playwright's launch error. Run
  `npx playwright install chromium` in the clone (add `--with-deps` on Ubuntu).
- The page took more than 30 seconds to reach its `load` event. The message is
  Playwright's timeout error. Check the page loads in a normal browser.
- The URL is not http or https. The message is
  `Only http and https URLs can be scanned, got "..."`. `file:` URLs are refused
  on purpose; serve the files over HTTP, or pass the markup to `scan_html`.
- The scan started at a public address and was sent to a private one. The
  message starts `Refused to load`. Start the scan at the private address
  directly if you mean to scan it ([tools.md](tools.md#scan_url)).

Every scan error is listed under [`scan_url` in tools.md](tools.md#scan_url).

### Where to find logs

The server writes errors to stderr. Each client keeps that output:

- Claude Desktop on macOS: `~/Library/Logs/Claude/`. `mcp.log` has connection
  events, and `mcp-server-eaa-cite.log` has the server's own stderr.
- Claude Code: run `/mcp` in a session to see each server's status, or start
  Claude Code with `claude --debug` to print MCP startup errors.
