# The system this came from

eaa-cite is the public part of a private system I am building: an accessibility
audit service for EU e-commerce sites, run by software agents and signed by one
person. The private repo holds the business. This page describes how it is built,
because most of the engineering is there.

## The constraint

Agents propose, a person disposes. Every report is signed by the owner, so the
number the design optimises is the owner's review minutes per audit. Model cost
is not that number: a cached analysis call costs a fraction of a dollar, and
spending more on models to save a minute of review is usually the right trade.
Every feature is argued in terms of what it does to review time.

## Pipeline

An audit moves through a state machine whose transitions are a table
(`states.ts`) and whose next step is decided in exactly one place (`machine.ts`).
Workers never decide what runs next; they report a result and the machine moves.

Work is queued in Postgres with pg-boss. Every job has a singleton key for its
unit of work (`audit.scan:<audit>:<page>`) under a policy that allows one queued
job per key, so re-enqueueing pending work is a no-op and a crash-and-retry
cannot double a scan. A queue's policy cannot be changed after it is created, so
a process refuses to start in production if a queue exists with the wrong one,
instead of running without deduplication.

Playwright runs in one process only, the browser worker: crawl, sample one page
per template, axe per page. Everything else can run without a browser.

## Findings are tiered by how they were produced

| Tier | Produced by | Review |
|------|-------------|--------|
| A | a scanner or probe with computed proof | accepted, spot-checked on a ladder |
| B | deterministic detection, model-written prose | the fix text is reviewed |
| C | model judgement | full human review, never auto-accepted |

The tier comes from provenance, never from a model's stated confidence.

Tier A spot checks start at 100% for a new check and fall per check as it earns
trust: 25% after 21 clean samples, 10% after 101, a floor of 5% after 301. The
floor is never zero, because a dependency upgrade can break a check silently. A
confirmed false positive sends the check back to 100%, quarantines it, and flags
every earlier audit it touched for a recall decision. A check's identity includes
its logic version, so changing what a check does makes it a new check with no
earned trust.

## Two gates on delivery

The transition to `delivered` is the one point every path to a signed report
passes through, so both gates sit there rather than in a CLI command or an
agent:

1. The audit's standards version carries a harmonisation status that a person
   verified, with the date and the source URL. This repo's ADR 0003 is the
   public version of that decision.
2. Every one of the 50 baseline criteria has a record from the owner saying how
   it was evaluated, manually or as not applicable. axe results are shown
   beside each criterion and never close one (ADR 0004 here).

## What moved into this repo

| Here | In the private system |
|------|----------------------|
| `src/criteria/` | the parser that seeds the versioned criteria table from the ETSI PDF and WCAG HTML |
| `src/standards/harmonisation.ts` | the status type and conformance wording behind the first delivery gate |
| `src/scan/` | the axe tag parser and the scan step of the browser worker |
| `src/guarded/` | the agent wrapper, with its Postgres ledger swapped for an interface |
| `docs/adr/` | rewritten from the private ADRs |

The dataset of cited obligations is new. The private system records one verified
answer per member state by hand; publishing it meant giving every claim its
article and quote.

## What did not

The state machine, queues and database schema; the agents and their prompts; the
review console; the tiering ladder's storage; anything about customers or
pricing.
