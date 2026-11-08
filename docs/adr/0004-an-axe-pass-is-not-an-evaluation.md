# An axe pass is not an evaluation of a criterion

`mapToClauses` (`src/scan/map.ts`) sorts an axe result into `failing`,
`needsReview` and `notCheckedByAxe`. It has no `passed` list, and every scan
result from the MCP server carries a caveat saying why.

axe passing its rules for 1.3.1 on a page means those rules found nothing. It
does not mean the page's structure and relationships were evaluated. Criteria
such as 1.3.2, 1.4.10, 1.4.13 and the 2.2.x group are found by no axe rule at
all. A list of passed criteria would read as "these are fine", and an agent
summarising the result would repeat it.

`notCheckedByAxe` lists the clause 9 criteria no axe rule touched on the page.
On the clean fixture in `test/fixtures/`, that is most of them. Failures that map
to no clause 9 criterion (best-practice rules, WCAG 2.2 additions) go in
`outsideClause9` so nothing axe reported disappears.

In the private audit system this came from, the same rule is a gate: an audit
cannot be delivered until a person has recorded how each criterion was
evaluated, and axe results count as context, never as that record.
