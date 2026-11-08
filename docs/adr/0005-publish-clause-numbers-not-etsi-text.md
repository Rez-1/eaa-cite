# Publish clause numbers, not ETSI's text

`data/en-301-549-v3.2.1-clause9.json` holds, for each of the 50 clause 9
criteria: the EN clause number, the WCAG number, the level, the W3C name of the
criterion, the WCAG link and the page of the EN PDF the clause is on. It does
not hold ETSI's requirement sentences.

`scripts/build-criteria.ts` reads the full EN text to prove each pairing. It
parses clause 9.1 to 9.4, checks every requirement names the WCAG criterion its
number implies, and joins the result to the WCAG Recommendation, throwing on any
disagreement. The sentences are then dropped. The names come from W3C, whose
document licence permits reuse with attribution. ETSI publishes the standard for
free download, which is a different thing from permission to republish it.

The file records the URL, size and SHA-256 of both documents it was built from.
The EN PDF hash has not changed since the table was first extracted in September
2026.
