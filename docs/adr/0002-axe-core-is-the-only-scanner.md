# axe-core is the only scanner

The scan tools run axe-core and nothing else. Pa11y and Lighthouse were
considered and left out.

Pa11y runs HTML_CodeSniffer or axe, and Lighthouse's accessibility category is
axe. Running all three re-reports most of the same violations under three rule
vocabularies, which means duplicate findings and colliding rule ids for whoever
reads the output.

`src/mcp/server.ts` takes the scanner as an injected dependency, so a second
engine is one more implementation of `Scanner`. Add one when there is a class of
defect axe misses and the other engine catches, not before.

This ADR exists mainly so the omission is not read as an oversight.
