import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { ledgerContract } from "./ledger.contract.js";
import { JsonlLedger, MemoryLedger } from "./ledger.js";

/** Both adapters shipped here pass the contract a third-party adapter must pass. */
const adapters = {
  MemoryLedger: () => new MemoryLedger(),
  JsonlLedger: async () => new JsonlLedger(path.join(await mkdtemp(path.join(tmpdir(), "ledger-")), "runs.jsonl")),
};

for (const [name, make] of Object.entries(adapters)) {
  describe(name, () => {
    for (const c of ledgerContract) it(c.name, () => c.run(make));
  });
}
