import assert from "node:assert/strict";
import type { RunRecord, SpendLedger } from "./ledger.js";

/**
 * The behaviour every SpendLedger adapter must have, as plain cases that throw
 * on failure. Not tied to a test runner, so importing eaa-cite/guarded never
 * loads one. Register them in your runner:
 *
 *   for (const c of ledgerContract) it(c.name, () => c.run(() => new MyLedger()));
 *
 * `makeLedger` must return an empty ledger each time it is called.
 */
export type LedgerContractCase = { name: string; run: (makeLedger: () => SpendLedger | Promise<SpendLedger>) => Promise<void> };

// Ids are unique across cases, as a database adapter's primary key requires.
let n = 0;
const row = (startedAt: string, costMicros: number, scope?: string): RunRecord => ({
  id: `contract-${++n}`,
  task: "contract",
  model: "test",
  ...(scope !== undefined ? { scope } : {}),
  startedAt,
  durationMs: 1,
  attempts: 1,
  outcome: "ok",
  usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
  costMicros,
});

export const ledgerContract: readonly LedgerContractCase[] = [
  {
    name: "an empty ledger has spent nothing",
    async run(make) {
      const ledger = await make();
      assert.equal(await ledger.spent({}), 0);
      assert.equal(await ledger.spent({ since: new Date(0), scope: "any" }), 0);
    },
  },
  {
    name: "a recorded run is counted straight away",
    async run(make) {
      const ledger = await make();
      await ledger.record(row("2026-11-08T10:00:00.000Z", 250));
      assert.equal(await ledger.spent({}), 250);
    },
  },
  {
    name: "since is inclusive",
    async run(make) {
      const ledger = await make();
      await ledger.record(row("2026-11-07T23:59:59.999Z", 1));
      await ledger.record(row("2026-11-08T00:00:00.000Z", 10));
      await ledger.record(row("2026-11-08T12:00:00.000Z", 100));
      assert.equal(await ledger.spent({ since: new Date("2026-11-08T00:00:00.000Z") }), 110);
    },
  },
  {
    name: "scope matches exactly and never counts unscoped runs",
    async run(make) {
      const ledger = await make();
      await ledger.record(row("2026-11-08T10:00:00.000Z", 1, "audit-1"));
      await ledger.record(row("2026-11-08T10:00:00.000Z", 10, "audit-10"));
      await ledger.record(row("2026-11-08T10:00:00.000Z", 100));
      assert.equal(await ledger.spent({ scope: "audit-1" }), 1);
      assert.equal(await ledger.spent({}), 111);
    },
  },
  {
    name: "scope and since together mean both",
    async run(make) {
      const ledger = await make();
      await ledger.record(row("2026-11-01T10:00:00.000Z", 1, "audit-1"));
      await ledger.record(row("2026-11-08T10:00:00.000Z", 10, "audit-1"));
      await ledger.record(row("2026-11-08T10:00:00.000Z", 100, "audit-2"));
      assert.equal(await ledger.spent({ since: new Date("2026-11-08T00:00:00.000Z"), scope: "audit-1" }), 10);
    },
  },
];
