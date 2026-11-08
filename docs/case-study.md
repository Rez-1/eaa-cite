# The system this came from

eaa-cite is the public part of a private system I am building: an accessibility
audit service for EU e-commerce sites, run by software agents and signed by one
person. The private repo holds the business and is not published. This page says
what that system needs from the code here, and which parts moved.

The rule there is that agents propose and a person disposes. Every report is
signed by the owner, so designs are judged by how many minutes of review they
save, not by model cost. Two checks guard the step that delivers a signed report:

1. The audit's EN 301 549 version carries a harmonisation status a person
   verified, with its date and source. This repo's
   [ADR 0003](adr/0003-harmonisation-status-has-three-values.md) and
   `conformanceFor` are the public version.
2. Each of the 50 clause 9 criteria has a record from the owner saying how it was
   evaluated. axe results are shown beside each criterion and never close one
   ([ADR 0004](adr/0004-an-axe-pass-is-not-an-evaluation.md)).

| Here | In the private system |
|------|----------------------|
| `scripts/lib/criteriaSource.ts` | the parser that seeds the criteria table from the ETSI PDF and WCAG HTML |
| `src/standards/harmonisation.ts` | the status type and conformance wording behind the first check |
| `src/scan/` | the axe tag parser and the scan step of the browser worker |
| `docs/adr/` | rewritten from the private ADRs |

The spend-capped agent wrapper was split out into its own package. The dataset
of cited obligations is new: the private system records one verified
answer per member state by hand, and publishing it meant giving every claim its
article and quote.

Not moved: the audit state machine, job queues and database schema; the agents
and their prompts; the review console; how findings are tiered and spot-checked;
anything about customers or pricing.
