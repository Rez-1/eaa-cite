import { appendFile, readFile } from "node:fs/promises";
import type { TokenUsage } from "./cost.js";

export type Outcome = "ok" | "refusal" | "schema_invalid" | "api_error";

/** One row per call to runStructured, whatever happened. */
export type RunRecord = {
  id: string;
  task: string;
  model: string;
  /** Optional grouping for a per-scope cap: a customer, a job, an audit. */
  scope?: string;
  /** The run that started this one, when tasks call tasks. */
  parentRunId?: string;
  /** What the task was given and what it returned, for the audit log. */
  input?: unknown;
  output?: unknown;
  startedAt: string;
  durationMs: number;
  attempts: number;
  outcome: Outcome;
  usage: TokenUsage;
  costMicros: number;
  error?: string;
};

/**
 * Which runs to add up. Both fields optional; together they mean AND.
 * `since` is inclusive: a run that started exactly at `since` counts.
 * `scope` matches exactly, and a query with a scope never counts unscoped runs.
 */
export type SpendQuery = { since?: Date; scope?: string };

/**
 * Where runs are recorded and spend is read back from. The caps are only as
 * good as this: a ledger that loses rows lets spend through. A database
 * adapter answers `spent` with one SUM; ledgerContract (ledger.contract.ts)
 * is the test every adapter must pass.
 */
export interface SpendLedger {
  /** Micro-USD spent by the runs matching the query. */
  spent(query: SpendQuery): Promise<number>;
  record(run: RunRecord): Promise<void>;
}

/** The SpendQuery rule, for adapters that hold their runs in memory. */
export function sumSpent(runs: readonly RunRecord[], query: SpendQuery): number {
  const since = query.since?.getTime();
  return runs
    .filter((r) => (since === undefined || Date.parse(r.startedAt) >= since) && (query.scope === undefined || r.scope === query.scope))
    .reduce((total, run) => total + run.costMicros, 0);
}

/** For tests and short-lived processes. */
export class MemoryLedger implements SpendLedger {
  readonly runs: RunRecord[] = [];

  async spent(query: SpendQuery): Promise<number> {
    return sumSpent(this.runs, query);
  }

  async record(run: RunRecord): Promise<void> {
    this.runs.push(run);
  }
}

/**
 * Append-only JSON Lines file: one run per line, readable with `jq`. Enough for
 * a single process; it rereads the file on every check, and a service with
 * several writers wants a database table with the same columns.
 */
export class JsonlLedger implements SpendLedger {
  constructor(private readonly path: string) {}

  private async runs(): Promise<RunRecord[]> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    return text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as RunRecord);
  }

  async spent(query: SpendQuery): Promise<number> {
    return sumSpent(await this.runs(), query);
  }

  async record(run: RunRecord): Promise<void> {
    await appendFile(this.path, JSON.stringify(run) + "\n");
  }
}
