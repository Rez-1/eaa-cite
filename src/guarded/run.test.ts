import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { costMicros, type ModelRate, type TokenUsage } from "./cost.js";
import { JsonlLedger, MemoryLedger, type SpendLedger } from "./ledger.js";
import {
  ModelRefusalError,
  runStructured,
  SchemaValidationError,
  SpendCapExceededError,
  type Guard,
  type ModelClient,
  type Task,
} from "./run.js";

/** Test rates, not anyone's price list: round numbers so the arithmetic is checkable by eye. */
const RATE: ModelRate = { inputPerMTok: 3, outputPerMTok: 15, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 };
const usage = (input: number, output: number): TokenUsage => ({ inputTokens: input, outputTokens: output, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });

const task: Task<string, { severity: "minor" | "serious" }> = {
  name: "classify",
  model: "test-model",
  system: "Classify the severity.",
  schema: z.object({ severity: z.enum(["minor", "serious"]) }),
  messages: (text) => [{ role: "user", content: text }],
};

type Reply = Awaited<ReturnType<ModelClient["complete"]>> | Error;

/** Replies in order; counts calls so tests can assert none was made. */
function scripted(...replies: Reply[]): ModelClient & { calls: number } {
  const client = {
    calls: 0,
    async complete() {
      const reply = replies[client.calls++];
      if (!reply) throw new Error("unexpected extra call");
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return client;
}

function guard(client: ModelClient, ledger?: undefined, caps?: Guard["caps"]): Guard & { ledger: MemoryLedger };
function guard<L extends SpendLedger>(client: ModelClient, ledger: L, caps?: Guard["caps"]): Guard & { ledger: L };
function guard(client: ModelClient, ledger: SpendLedger = new MemoryLedger(), caps: Guard["caps"] = { dailyMicros: 1_000_000 }): Guard {
  return {
    client,
    ledger,
    rate: RATE,
    caps,
    now: () => new Date("2026-11-08T12:00:00Z"),
  };
}

describe("costMicros", () => {
  it("prices input, output and both cache directions", () => {
    // 1000 * 3 + 200 * 15 + 1000 * 3 * 1.25 + 10000 * 3 * 0.1
    expect(
      costMicros(RATE, { inputTokens: 1000, outputTokens: 200, cacheCreationInputTokens: 1000, cacheReadInputTokens: 10_000 }),
    ).toBe(3000 + 3000 + 3750 + 3000);
  });

  it("rounds up but not because of float noise", () => {
    expect(costMicros({ ...RATE, inputPerMTok: 0.1 }, usage(3, 0))).toBe(1); // 0.30000000000000004 -> 1
    expect(costMicros({ ...RATE, inputPerMTok: 1 }, usage(3, 0))).toBe(3);
  });
});

describe("runStructured", () => {
  it("returns validated output and records the run with its cost", async () => {
    const g = guard(scripted({ kind: "parsed", output: { severity: "serious" }, usage: usage(1000, 100) }));
    const result = await runStructured(g, task, "Button has no name", { scope: "audit-1" });
    expect(result).toMatchObject({ output: { severity: "serious" }, attempts: 1, costMicros: 4500 });
    expect(g.ledger.runs).toEqual([expect.objectContaining({ id: result.runId, outcome: "ok", scope: "audit-1", costMicros: 4500 })]);
  });

  it("refuses to call the model once the daily cap is reached, and records nothing", async () => {
    const client = scripted();
    const g = guard(client, new MemoryLedger(), { dailyMicros: 4500 });
    await g.ledger.record({ id: "x", task: "t", model: "m", startedAt: "2026-11-08T01:00:00Z", durationMs: 1, attempts: 1, outcome: "ok", usage: usage(0, 0), costMicros: 4500 });

    await expect(runStructured(g, task, "text")).rejects.toBeInstanceOf(SpendCapExceededError);
    expect(client.calls).toBe(0);
    expect(g.ledger.runs).toHaveLength(1);
  });

  it("does not count yesterday's spend against today's cap", async () => {
    const g = guard(scripted({ kind: "parsed", output: { severity: "minor" }, usage: usage(1, 1) }), new MemoryLedger(), { dailyMicros: 100 });
    await g.ledger.record({ id: "y", task: "t", model: "m", startedAt: "2026-11-07T23:59:59Z", durationMs: 1, attempts: 1, outcome: "ok", usage: usage(0, 0), costMicros: 10_000 });
    await expect(runStructured(g, task, "text")).resolves.toMatchObject({ output: { severity: "minor" } });
  });

  it("applies the per-scope cap only to that scope", async () => {
    const ledger = new MemoryLedger();
    await ledger.record({ id: "z", task: "t", model: "m", scope: "audit-1", startedAt: "2026-11-01T00:00:00Z", durationMs: 1, attempts: 1, outcome: "ok", usage: usage(0, 0), costMicros: 50 });
    const caps = { dailyMicros: 1_000_000, perScopeMicros: 50 };

    await expect(runStructured(guard(scripted(), ledger, caps), task, "t", { scope: "audit-1" })).rejects.toMatchObject({ cap: "scope" });
    await expect(
      runStructured(guard(scripted({ kind: "parsed", output: { severity: "minor" }, usage: usage(1, 1) }), ledger, caps), task, "t", { scope: "audit-2" }),
    ).resolves.toBeDefined();
  });

  it("retries output that fails the schema, then succeeds, charging both attempts", async () => {
    const g = guard(
      scripted(
        { kind: "parsed", output: { severity: "catastrophic" }, usage: usage(1000, 100) },
        { kind: "parsed", output: { severity: "minor" }, usage: usage(1000, 100) },
      ),
    );
    const result = await runStructured(g, task, "text");
    expect(result.attempts).toBe(2);
    expect(result.usage).toMatchObject({ inputTokens: 2000, outputTokens: 200 });
    expect(result.costMicros).toBe(9000);
  });

  it("re-validates output an adapter claims is parsed", async () => {
    // An adapter that forgets to validate must not hand garbage to the caller.
    const g = guard(scripted({ kind: "parsed", output: { severity: 3 }, usage: usage(1, 1) }, { kind: "parsed", output: null, usage: usage(1, 1) }));
    const error = await runStructured(g, task, "text").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SchemaValidationError);
    expect(g.ledger.runs[0]).toMatchObject({ outcome: "schema_invalid", attempts: 2 });
  });

  it("records a refusal with its category and does not retry it", async () => {
    const client = scripted({ kind: "refusal", category: "cyber", usage: usage(500, 0) });
    const g = guard(client);
    await expect(runStructured(g, task, "text")).rejects.toBeInstanceOf(ModelRefusalError);
    expect(client.calls).toBe(1);
    expect(g.ledger.runs[0]).toMatchObject({ outcome: "refusal", error: "cyber", costMicros: 1500 });
  });

  it("records the input, output and parent run when asked", async () => {
    const g = guard(scripted({ kind: "parsed", output: { severity: "minor" }, usage: usage(1, 1) }));
    await runStructured(g, task, "Button has no name", { audit: { input: "Button has no name", parentRunId: "run-0" } });
    expect(g.ledger.runs[0]).toMatchObject({ input: "Button has no name", output: { severity: "minor" }, parentRunId: "run-0" });
  });

  it("records an API error, keeping the tokens spent on earlier attempts", async () => {
    const g = guard(scripted({ kind: "unparsed", reason: "max_tokens", usage: usage(1000, 0) }, new Error("overloaded")));
    await expect(runStructured(g, task, "text")).rejects.toThrow("overloaded");
    expect(g.ledger.runs[0]).toMatchObject({ outcome: "api_error", error: "overloaded", attempts: 2, costMicros: 3000 });
  });
});

describe("JsonlLedger", () => {
  it("appends one line per run and sums them back", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), "ledger-")), "runs.jsonl");
    const ledger = new JsonlLedger(file);
    expect(await ledger.spent({})).toBe(0);

    const g = guard(scripted({ kind: "parsed", output: { severity: "minor" }, usage: usage(1000, 0) }), ledger);
    await runStructured(g, task, "text", { scope: "s" });

    expect((await readFile(file, "utf8")).trim().split("\n")).toHaveLength(1);
    expect(await ledger.spent({ scope: "s" })).toBe(3000);
    expect(await ledger.spent({ since: new Date("2026-11-08T00:00:00Z"), scope: "other" })).toBe(0);
  });
});
