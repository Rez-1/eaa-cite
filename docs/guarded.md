# eaa-cite/guarded

> This module is a sample. It has no stability promise: names, types and
> behaviour may change in any release.

## What it is

A wrapper for structured LLM calls with spend caps enforced in code. Before each
call it reads a ledger and refuses to call the model once a cap is reached. It
validates the output against a Zod schema, retries bad output a bounded number of
times, and writes a ledger row for every outcome, failures included.

It is separate from the dataset and the MCP server. None of the server's tools
call a model, and nothing in the package root imports this module. It is the
agent wrapper from the private audit system this repo came from
([case-study.md](case-study.md)), with the Postgres table replaced by the
`SpendLedger` interface.

The code is in [`src/guarded/`](../src/guarded/).

## Install

Set up the package as in [library.md](library.md#install-and-import), then
import from the second entry point:

```ts
import { runStructured, MemoryLedger, anthropicClient } from "eaa-cite/guarded";
```

You also need `zod` in your own project to write task schemas.

`@anthropic-ai/sdk` is an optional peer dependency, so npm does not install it
for you. You only need it if you use `anthropicClient`: the adapter imports the
SDK's Zod helper on its first call, so importing `eaa-cite/guarded` with a
different `ModelClient` never loads the SDK. In a clone set up with
`npm install` it is there anyway, as a dev dependency. Otherwise run
`npm install @anthropic-ai/sdk`.

## Run a structured call

A `Task` describes one kind of call. A `Guard` says which client, ledger, prices
and caps to use. `runStructured(guard, task, input, options?)` makes the call.

This example uses a fake client so it runs without an API key:

```ts
import { z } from "zod";
import { MemoryLedger, runStructured, type Guard, type ModelClient, type ModelRate, type Task } from "eaa-cite/guarded";

const classify: Task<string, { severity: "minor" | "serious" }> = {
  name: "classify-severity",
  model: "my-model-id",
  system: "Classify the accessibility defect as minor or serious.",
  schema: z.object({ severity: z.enum(["minor", "serious"]) }),
  messages: (defect) => [{ role: "user", content: defect }],
};

// Round numbers for the example. Pass your provider's current prices.
const rate: ModelRate = { inputPerMTok: 3, outputPerMTok: 15, cacheWriteMultiplier: 1.25, cacheReadMultiplier: 0.1 };

const fake: ModelClient = {
  async complete() {
    return {
      kind: "parsed",
      output: { severity: "serious" },
      usage: { inputTokens: 1000, outputTokens: 100, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    };
  },
};

const ledger = new MemoryLedger();
const guard: Guard = { client: fake, ledger, rate, caps: { dailyMicros: 5_000_000, perScopeMicros: 1_000_000 } };

const result = await runStructured(guard, classify, "Button has no accessible name", { scope: "audit-42" });
result.output; // { severity: "serious" }
result.costMicros; // 4500, which is 1000 * 3 + 100 * 15
result.attempts; // 1
ledger.runs[0].outcome; // "ok"
```

`Task<TInput, TOutput>`:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Written to the ledger row. |
| `model` | string | Passed to the client. |
| `system` | string | Keep it the same on every call so the provider can cache it. Put anything that varies in `messages`. |
| `schema` | `z.ZodType<TOutput>` | The output must pass it. |
| `messages` | `(input) => { role: "user" \| "assistant"; content: string }[]` | Builds the conversation from the input. |
| `maxTokens` | number, optional | Default 4096. |
| `schemaRetries` | number, optional | Extra attempts when output fails the schema. Default 1, so two attempts in all. |

`Guard`:

| Field | Type | Notes |
|---|---|---|
| `client` | `ModelClient` | See [Model clients](#model-clients). |
| `ledger` | `SpendLedger` | See [Ledgers](#ledgers). |
| `rate` | `ModelRate` | Prices for the model. |
| `caps.dailyMicros` | number | Micro-USD per UTC day, across all tasks. |
| `caps.perScopeMicros` | number, optional | Micro-USD per scope, all time. Only checked when the call passes a `scope`. |
| `now` | `() => Date`, optional | Clock, for tests. |

Options for `runStructured`:

| Field | Type | Notes |
|---|---|---|
| `scope` | string, optional | Groups runs for the per-scope cap: a customer, a job, an audit. |
| `audit.input` | unknown, optional | Stored on the ledger row, for an audit log. |
| `audit.parentRunId` | string, optional | Stored on the ledger row, when one task calls another. |

`Result<TOutput>` is `{ output, runId, usage, costMicros, attempts }`. `runId` is
a random UUID and is also the ledger row's `id`.

## Spend caps

The check runs before the request is built:

1. Sum the ledger's spend since the start of the current UTC day. If it is at or
   over `caps.dailyMicros`, throw `SpendCapExceededError` with `cap: "daily"`.
2. If the call has a `scope` and `caps.perScopeMicros` is set, sum all spend in
   that scope. If it is at or over the cap, throw with `cap: "scope"`.

When the check fails no model call is made and no ledger row is written. The
check happens once per `runStructured` call, not before each retry, so a call
that starts under the cap can finish over it by the cost of its retries.

Money is integer micro-USD (one millionth of a dollar). `costMicros(rate, usage)`
computes a run's cost:

```
inputTokens * inputPerMTok
+ cacheCreationInputTokens * inputPerMTok * cacheWriteMultiplier
+ cacheReadInputTokens * inputPerMTok * cacheReadMultiplier
+ outputTokens * outputPerMTok
```

rounded up, so the ledger may over-report spend but never under-reports it. USD
per million tokens equals micro-USD per token, so no conversion is needed.

`ModelRate` has `inputPerMTok` and `outputPerMTok` (USD per million tokens), and
`cacheWriteMultiplier` and `cacheReadMultiplier` (multipliers on the input rate).
The module ships no price table; the caller passes the prices. A cost counts the
tokens of every attempt in the call.

Other exports: `formatMicros(micros)` gives a string such as `$0.0045`;
`addUsage(a, b)` adds two `TokenUsage` values; `EMPTY_USAGE` is all zeros.
`TokenUsage` has `inputTokens`, `outputTokens`, `cacheCreationInputTokens` and
`cacheReadInputTokens`.

## Ledgers

```ts
interface SpendLedger {
  spent(query: SpendQuery): Promise<number>; // micro-USD
  record(run: RunRecord): Promise<void>;
}

type SpendQuery = { since?: Date; scope?: string };
```

`spent` adds up the `costMicros` of the runs that match. Both fields are
optional, and together they mean both. `since` is inclusive: a run that started
exactly at `since` counts. `scope` matches exactly, and a query with a scope
never counts runs without one. `sumSpent(runs, query)` applies this rule to an
array, for ledgers that hold their runs in memory.

The caps are only as good as the ledger. A ledger that loses rows lets spend
through.

Two ledgers are included:

| Ledger | Use |
|---|---|
| `new MemoryLedger()` | Tests and short-lived processes. Its rows are in `ledger.runs`. |
| `new JsonlLedger(path)` | An append-only JSON Lines file, one run per line, readable with `jq`. It rereads the file on every check and is meant for a single process. A missing file counts as empty. |

A `RunRecord` holds:

| Field | Type | Notes |
|---|---|---|
| `id` | string | The run id. |
| `task` | string | `task.name` |
| `model` | string | `task.model` |
| `scope` | string, optional | |
| `parentRunId` | string, optional | From `options.audit`. |
| `input` | unknown, optional | From `options.audit`. |
| `output` | unknown, optional | The validated output, on `ok` rows. |
| `startedAt` | ISO timestamp | |
| `durationMs` | number | |
| `attempts` | number | |
| `outcome` | `ok`, `refusal`, `schema_invalid` or `api_error` | |
| `usage` | `TokenUsage` | Summed over all attempts. |
| `costMicros` | number | |
| `error` | string, optional | The refusal category, the last schema problem, or the API error message. |

### Writing your own ledger

A service with several writers wants a database table with the same columns,
where `spent` is one `SUM` query. Every ledger should pass `ledgerContract`, a
list of test cases that throw on failure and do not depend on a test runner:

```ts
import { ledgerContract, sumSpent, type RunRecord, type SpendLedger, type SpendQuery } from "eaa-cite/guarded";

class ArrayLedger implements SpendLedger {
  private rows: RunRecord[] = [];
  async spent(query: SpendQuery) {
    return sumSpent(this.rows, query);
  }
  async record(run: RunRecord) {
    this.rows.push(run);
  }
}

// In vitest or jest:
for (const c of ledgerContract) it(c.name, () => c.run(() => new ArrayLedger()));
```

The factory you pass to `run` must return an empty ledger each time. Each case is
a `LedgerContractCase`: `{ name, run }`. The repo runs it against both included
ledgers in [`src/guarded/ledger.test.ts`](../src/guarded/ledger.test.ts).

## Model clients

### anthropicClient

```ts
import Anthropic from "@anthropic-ai/sdk";
import { anthropicClient } from "eaa-cite/guarded";

const client = anthropicClient(new Anthropic()); // reads ANTHROPIC_API_KEY
```

It calls `messages.parse` with the task's schema as the output format. The
system prompt carries a cache breakpoint, so repeated calls to one task pay the
cache-read rate for it. It checks `stop_reason` before the parsed output, because
a refusal comes back as HTTP 200 with empty or partial content:

| What came back | Returned to `runStructured` |
|---|---|
| `stop_reason` is `refusal` | `{ kind: "refusal", category }`, from `stop_details.category`, or `null` |
| No parsed output | `{ kind: "unparsed", reason: "no parsed output (stop_reason: <reason>)" }` |
| Parsed output | `{ kind: "parsed", output }` |

Each carries the token usage, with missing counts read as 0. Errors from the SDK
(network, rate limits, server errors) are thrown and become `api_error` rows.

### Another provider

Implement `ModelClient`:

```ts
interface ModelClient {
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
```

`runStructured` validates `output` against the schema again, so a client that
skips validation cannot hand unchecked output to the caller. Return `unparsed`
when the provider gave no usable output; it is retried like a schema failure.
Throw for transport errors.

## Errors

| Error | When | Message | Fields | Ledger row |
|---|---|---|---|---|
| `SpendCapExceededError` | A cap is reached before the call | `daily spend cap reached: $0.0045 of $0.0040. No call was made.` (or `scope spend cap reached: ...`) | `cap` (`"daily"` or `"scope"`), `spentMicros`, `capMicros` | none; no call was made |
| `ModelRefusalError` | The model declined | `The model declined the request (category: cyber)`, or `category: unknown` when none was given | `category` | `refusal`, with the category as `error` |
| `SchemaValidationError` | Output failed the schema, or was unparsed, on every attempt | `Output failed the schema after 2 attempt(s): severity: Invalid option: expected one of "minor"\|"serious"` | `attempts`, `lastProblem` | `schema_invalid`, with the last problem as `error` |
| The client's own error | `client.complete` threw | unchanged | | `api_error`, with the message as `error` |

A refusal is not retried. Rows for failed calls keep the tokens spent on earlier
attempts, so the cost of a failure still counts against the caps.

## Design

[ADR 0006: spend caps are code, not prompt instructions](adr/0006-spend-caps-are-code.md)
explains the choices. [`src/guarded/run.test.ts`](../src/guarded/run.test.ts)
shows each behaviour with a scripted client: the daily and per-scope caps,
retries, re-validation, refusals and API errors.
