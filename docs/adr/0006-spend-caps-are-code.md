# Spend caps are code, not prompt instructions

`runStructured` (`src/guarded/run.ts`) reads the ledger and refuses to call the
model once the daily cap, or the cap for the call's scope, is reached. The check
runs before the request is built, so no model output can affect it. Every call
writes a ledger row whatever happens: success, refusal, output that fails the
schema, or an API error. Rows for failed calls keep the tokens spent on earlier
attempts. A call refused by a cap writes no row: no model was called.

The limit holds for calls made one after another. Calls started at the same
moment each read the same spend before any of them records its cost, so
together they can pass the cap. Holding it under concurrency needs a ledger that
reserves an estimated cost before the call; that is not built, and the owner
decides whether it is needed.

## Why

A loop that retries on bad output, or an agent that decides it needs another
pass, spends money in proportion to how wrong things are going. A prompt asking
it to be economical is a request. A check against a ledger is a limit.

## Choices inside it

Money is integer micro-USD. Small calls cost a fraction of a cent, so cents round
them to zero, and summed floats drift.

Prices are passed in by the caller. A library that ships a price table
under-reports spend the day the table goes stale, and nothing fails when it
does.

Output is validated against the Zod schema in `runStructured` even when the
provider adapter says it parsed it. An adapter that skips validation cannot hand
unchecked output to the caller.

A refusal is not retried. The same request is likely to be refused again, and
each retry is charged.

The Anthropic adapter (`src/guarded/anthropic.ts`) puts a cache breakpoint on the
system prompt and checks `stop_reason` before reading the parsed output, because
a refusal comes back as HTTP 200 with empty or partial content.

The MCP server in this repo does not use this module: none of its tools call a
model. It is here because it is the part of the private system that is useful on
its own.
