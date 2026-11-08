import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Starts the server over stdio, the way an MCP client such as Claude Desktop
 * does, and calls three tools. `npm run demo`. The output is what the README
 * shows.
 */

const transport = new StdioClientTransport({ command: "npx", args: ["tsx", "src/mcp/bin.ts"], stderr: "inherit" });
const client = new Client({ name: "eaa-cite-demo", version: "0" });
await client.connect(transport);

const call = async (name: string, args: Record<string, unknown>): Promise<any> => {
  const result = (await client.callTool({ name, arguments: args })) as { content: { text: string }[] };
  return JSON.parse(result.content[0]!.text);
};

console.log("> get_obligations { country: \"DE\" }  (penalties only)\n");
const de = await call("get_obligations", { country: "DE" });
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
const cmp = await call("compare_jurisdictions", { claim: "transitionalSelfServiceTerminals" });
for (const row of cmp.rows) console.log(`  ${row.jurisdiction}: max ${row.value.maxYearsAfterFirstUse} years  (${row.citations[0].pinpoint})`);
console.log(`  no data: ${cmp.absent.join(", ")}`);

console.log("\n> scan_html { html: <test/fixtures/shop-with-defects.html> }\n");
const html = await readFile(new URL("../test/fixtures/shop-with-defects.html", import.meta.url), "utf8");
const scan = await call("scan_html", { html });
for (const c of scan.failing) console.log(`  ${c.enClause}  ${c.name.padEnd(26)} ${c.rules.map((r: any) => r.ruleId).join(", ")}`);
console.log(`  ${scan.summary.failing} failing, ${scan.summary.needsReview} need review, ${scan.summary.notCheckedByAxe} of ${scan.summary.ofCriteria} not checked by axe`);

await client.close();
