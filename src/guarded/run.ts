import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { addUsage, costMicros, EMPTY_USAGE, formatMicros, type ModelRate, type TokenUsage } from "./cost.js";
import type { Outcome, SpendLedger } from "./ledger.js";

/**
 * A guarded call for structured output: spend caps checked before the call,
 * output validated against a Zod schema, a bounded number of retries, and a
 * ledger row for every outcome, including failures.
 *
 * The caps are code, not instructions in a prompt. They are read from the
 * ledger before each call, so no model output can talk its way past them.
 *
 * Extracted from a private system that runs LLM steps inside accessibility
 * audits. There, the ledger is a Postgres table and the scope is the audit.
 */

/** What runStructured needs from a model provider. See anthropic.ts for one. */
export interface ModelClient {
  complete<T>(request: {
    model: string;
    system: string;
    messages: readonly { role: "user" | "assistant"; content: string }[];
    schema: z.ZodType<T>;
    maxTokens: number;
  }): Promise<
    | { kind: "parsed"; output: unknown; usage: TokenUsage }
    | { kind: "unparsed"; reason: string; usage: TokenUsage }
    | { kind: "refusal"; category: string | null; usage: TokenUsage }
  >;
}

export type Task<TInput, TOutput> = {
  name: string;
  model: string;
  /**
   * Kept byte-stable so the provider can cache it. Anything that varies per
   * call (ids, dates, the input itself) belongs in `messages`.
   */
  system: string;
  schema: z.ZodType<TOutput>;
  messages: (input: TInput) => { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  /** Extra attempts when the output fails the schema. Default 1. */
  schemaRetries?: number;
};

export type Guard = {
  client: ModelClient;
  ledger: SpendLedger;
  rate: ModelRate;
  caps: {
    /** Micro-USD per UTC day across all tasks. */
    dailyMicros: number;
    /** Micro-USD per scope, all time. Only applied when a call passes a scope. */
    perScopeMicros?: number;
  };
  now?: () => Date;
};

export type Result<TOutput> = { output: TOutput; runId: string; usage: TokenUsage; costMicros: number; attempts: number };

export class SpendCapExceededError extends Error {
  constructor(
    readonly cap: "daily" | "scope",
    readonly spentMicros: number,
    readonly capMicros: number,
  ) {
    super(`${cap} spend cap reached: ${formatMicros(spentMicros)} of ${formatMicros(capMicros)}. No call was made.`);
    this.name = "SpendCapExceededError";
  }
}

export class ModelRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`The model declined the request (category: ${category ?? "unknown"})`);
    this.name = "ModelRefusalError";
  }
}

export class SchemaValidationError extends Error {
  constructor(
    readonly attempts: number,
    readonly lastProblem: string,
  ) {
    super(`Output failed the schema after ${attempts} attempt(s): ${lastProblem}`);
    this.name = "SchemaValidationError";
  }
}

function startOfUtcDay(date: Date): Date {
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

async function assertUnderCaps(guard: Guard, scope: string | undefined, now: Date): Promise<void> {
  const today = await guard.ledger.spent({ since: startOfUtcDay(now) });
  if (today >= guard.caps.dailyMicros) throw new SpendCapExceededError("daily", today, guard.caps.dailyMicros);
  if (scope !== undefined && guard.caps.perScopeMicros !== undefined) {
    const inScope = await guard.ledger.spent({ scope });
    if (inScope >= guard.caps.perScopeMicros) throw new SpendCapExceededError("scope", inScope, guard.caps.perScopeMicros);
  }
}

export async function runStructured<TInput, TOutput>(
  guard: Guard,
  task: Task<TInput, TOutput>,
  input: TInput,
  options: {
    /** Groups runs for the per-scope cap. */
    scope?: string;
    /** Extra fields for the ledger row, for an audit log. */
    record?: { input?: unknown; parentRunId?: string };
  } = {},
): Promise<Result<TOutput>> {
  const now = guard.now ?? (() => new Date());
  const started = now();
  await assertUnderCaps(guard, options.scope, started);

  const runId = randomUUID();
  const maxAttempts = 1 + (task.schemaRetries ?? 1);
  let usage: TokenUsage = EMPTY_USAGE;
  let attempts = 0;
  let lastProblem = "no attempt made";

  const record = async (outcome: Outcome, error?: string, output?: unknown): Promise<number> => {
    const cost = costMicros(guard.rate, usage);
    await guard.ledger.record({
      id: runId,
      task: task.name,
      model: task.model,
      ...(options.scope !== undefined ? { scope: options.scope } : {}),
      ...(options.record?.parentRunId !== undefined ? { parentRunId: options.record.parentRunId } : {}),
      ...(options.record && "input" in options.record ? { input: options.record.input } : {}),
      ...(output !== undefined ? { output } : {}),
      startedAt: started.toISOString(),
      durationMs: now().getTime() - started.getTime(),
      attempts,
      outcome,
      usage,
      costMicros: cost,
      ...(error !== undefined ? { error } : {}),
    });
    return cost;
  };

  while (attempts < maxAttempts) {
    attempts++;
    let response: Awaited<ReturnType<ModelClient["complete"]>>;
    try {
      response = await guard.client.complete({
        model: task.model,
        system: task.system,
        messages: task.messages(input),
        schema: task.schema,
        maxTokens: task.maxTokens ?? 4096,
      });
    } catch (error) {
      // Tokens already spent on earlier attempts are still recorded.
      await record("api_error", error instanceof Error ? error.message : String(error));
      throw error;
    }
    usage = addUsage(usage, response.usage);

    if (response.kind === "refusal") {
      await record("refusal", response.category ?? undefined);
      throw new ModelRefusalError(response.category);
    }

    if (response.kind === "parsed") {
      // Validate again here: a provider adapter that skips validation must not
      // be able to hand unchecked output to the caller.
      const checked = task.schema.safeParse(response.output);
      if (checked.success) {
        const cost = await record("ok", undefined, checked.data);
        return { output: checked.data, runId, usage, costMicros: cost, attempts };
      }
      lastProblem = checked.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    } else {
      lastProblem = response.reason;
    }
  }

  await record("schema_invalid", lastProblem);
  throw new SchemaValidationError(attempts, lastProblem);
}
