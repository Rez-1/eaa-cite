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
  startedAt: string;
  durationMs: number;
  attempts: number;
  outcome: Outcome;
  usage: TokenUsage;
  costMicros: number;
  error?: string;
};

/**
 * Where runs are recorded and spend is read back from. The caps are only as
 * good as this: a ledger that loses rows lets spend through.
 */
export interface SpendLedger {
  /** Micro-USD spent since `since`, optionally within one scope. */
  spentSince(since: Date, scope?: string): Promise<number>;
  /** Micro-USD spent in a scope, all time. */
  spentInScope(scope: string): Promise<number>;
  record(run: RunRecord): Promise<void>;
}

function sum(runs: readonly RunRecord[]): number {
  return runs.reduce((total, run) => total + run.costMicros, 0);
}

/** For tests and short-lived processes. */
export class MemoryLedger implements SpendLedger {
  readonly runs: RunRecord[] = [];

  async spentSince(since: Date, scope?: string): Promise<number> {
    return sum(this.runs.filter((r) => Date.parse(r.startedAt) >= since.getTime() && (scope === undefined || r.scope === scope)));
  }

  async spentInScope(scope: string): Promise<number> {
    return sum(this.runs.filter((r) => r.scope === scope));
  }

  async record(run: RunRecord): Promise<void> {
    this.runs.push(run);
  }
}

/**
 * Append-only JSON Lines file: one run per line, readable with `jq`. Enough for
 * a single process; a service with several writers wants a database table with
 * the same columns.
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

  async spentSince(since: Date, scope?: string): Promise<number> {
    return sum((await this.runs()).filter((r) => Date.parse(r.startedAt) >= since.getTime() && (scope === undefined || r.scope === scope)));
  }

  async spentInScope(scope: string): Promise<number> {
    return sum((await this.runs()).filter((r) => r.scope === scope));
  }

  async record(run: RunRecord): Promise<void> {
    await appendFile(this.path, JSON.stringify(run) + "\n");
  }
}
