# Examples

A small online shop with known defects, used to check that scans report what they
should.

## The test shop

[`test-shop/`](test-shop/) holds five static pages:

| Page | Template | What is planted |
|---|---|---|
| `index.html` | home | missing `lang`, missing title, unnamed icon link, image without alt, low contrast, a rotating banner with no pause, focus outline removed |
| `product.html` | product | zoom disabled, images without alt, low contrast, unlabelled select, icon-only button, keyboard-unreachable colour swatches, a video with no captions, focus outline removed |
| `cart.html` | cart | invalid `lang`, unlabelled field, broken table `headers`, empty icon link, image button without alt, focus outline removed |
| `checkout.html` | checkout | unlabelled fields, invalid `autocomplete`, custom checkbox without `aria-checked`, untitled iframe, required fields shown only in red, an error shown only as a red border, focus outline removed |
| `product-fixed.html` | product (fixed) | nothing: `product.html` with every defect repaired |

Each defect has a `PLANTED` comment in the markup next to it, naming the axe rule
and WCAG criterion, or saying that axe has no rule for it:

```html
<!-- PLANTED image-alt (1.1.1): hero image with no alt. -->
<!-- PLANTED, not detectable by axe (2.2.2): banner text rotates every 2 s with no pause control. -->
```

`promo.mp4` is left out on purpose. The server returns 404 for it.

## expected.json

[`test-shop/expected.json`](test-shop/expected.json) says what a scan of each page
should report. It was written from the `PLANTED` comments before the first scan,
so the scan is checked against a prediction made in advance.

For each page it records:

| Field | Meaning |
|---|---|
| `failing` | axe rule id, mapped to the EN clauses it must be filed under |
| `needsReview` | EN clauses axe should mark as undecided |
| `notDetectable` | planted defects axe has no rule for, by WCAG number |

| `needsReviewUnplanted` | needs-review clauses the first scan found that nobody planted (checkout's 9.2.4.1, Bypass Blocks) |

`expected.json` is itself checked against the pages: each page's `failing`,
`needsReview` and `notDetectable` must match its `PLANTED` comments exactly, so
neither file can drift from the other.

A page matches when every expected rule fails under every expected clause, no
other rule fails, every expected needs-review clause appears, the needs-review
clauses nobody planted are exactly `needsReviewUnplanted`, and no
`notDetectable` criterion is reported as failing. The comparison is in
[`test/testShop.ts`](../test/testShop.ts), shared by `npm test` and `npm run try`.

## Run it

Both commands need Chromium (`npx playwright install chromium`). They run the
server from source with `tsx`, so no build is needed.

```bash
npm run try
```

Serves the test shop on `127.0.0.1`, starts the MCP server over stdio as an MCP
client would, and scans each page with `scan_url`. It then calls
`compare_jurisdictions` for penalties and `conformance_statement` for DE. It
prints the results, writes them to [`RESULTS.md`](RESULTS.md), and exits 1 if any
page does not match `expected.json`. It needs no network.

```bash
npm run try -- --w3c
```

Does the same, then also scans W3C WAI's
[Before and After Demonstration](https://www.w3.org/WAI/demos/bad/). That site
publishes four pages (home, news, tickets, survey) twice: once with known
barriers ("before") and once repaired ("after"). There is no `expected.json` for
it. The output is a table of failing criteria and instances for each page before
and after, and the list of what still fails after the repair. This needs network
access to `www.w3.org`.

Both commands overwrite `RESULTS.md`.

The same test-shop comparison also runs in `npm test`
([`test/test-shop.test.ts`](../test/test-shop.test.ts)).

## Results

[`RESULTS.md`](RESULTS.md) is generated, not written by hand. The checked-in copy
was made with `npm run try -- --w3c` on 2026-11-08: every page matched
`expected.json`, every defect planted without an axe rule was listed as not
checked by axe, and each W3C "after" page had no clause 9 failures.

How to read the results: [docs/results.md](../docs/results.md).
