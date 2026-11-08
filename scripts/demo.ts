import { readFile } from "node:fs/promises";
import { connectStdio } from "./lib/mcpClient.js";

/**
 * Starts the server over stdio, the way an MCP client such as Claude Desktop
 * does, and calls three tools. `npm run demo`. The output is what the README
 * shows.
 */

const client = await connectStdio("eaa-cite-demo");

console.log("> get_obligations { country: \"DE\" }  (penalties only)\n");
const de = await client.call("get_obligations", { country: "DE" });
const p = de.claims.penalties;
console.log(`maxFine: ${p.value.maxFine} ${p.value.currency}`);
for (const c of p.citations) {
  console.log(`  ${c.pinpoint}`);
  console.log(`  "${c.quote}"`);
  console.log(`  = ${c.translation}`);
  console.log(`  ${c.source.url} (retrieved ${c.source.retrievedAt})`);
}
console.log(`harmonisation: ${de.harmonisation.status} (from ${de.harmonisation.basis}, checked ${de.harmonisation.checkedAt})`);

console.log("\n> compare_jurisdictions { claim: \"transitionalSelfServiceTerminals\" }\n");
const cmp = await client.compare("transitionalSelfServiceTerminals");
for (const row of cmp.rows) console.log(`  ${row.jurisdiction}: max ${row.value.maxYearsAfterFirstUse} years  (${row.citations[0]!.pinpoint})`);
console.log(`  no data: ${cmp.absent.join(", ")}`);

console.log("\n> scan_html { html: <test/fixtures/shop-with-defects.html> }\n");
const html = await readFile(new URL("../test/fixtures/shop-with-defects.html", import.meta.url), "utf8");
const scan = await client.call("scan_html", { html });
for (const c of scan.failing) console.log(`  ${c.enClause}  ${c.name.padEnd(26)} ${c.rules.map((r) => r.ruleId).join(", ")}`);
console.log(`  ${scan.summary.failing} failing, ${scan.summary.needsReview} need review, ${scan.summary.notCheckedByAxe} of ${scan.summary.ofCriteria} not checked by axe`);

await client.close();
