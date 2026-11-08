# eaa-cite

What the European Accessibility Act requires in each jurisdiction, with every value
traced to the text it comes from, and how axe-core scan results map onto EN 301 549.

## Language

### The dataset

**Jurisdiction**:
The EU itself, for the directive, or one EU member state, for its transposition. One
jurisdiction file each in `data/jurisdictions/`.
_Avoid_: country (the EU is not one), market

**Jurisdiction file**:
The checked-in JSON for one jurisdiction, exactly as an editor writes it. Citations in it
name their source by id. Type: `JurisdictionFile`.

**Cited jurisdiction**:
A jurisdiction file after loading: the same content, with every citation's source filled
in. What every caller reads. Type: `CitedJurisdiction`.

**Claim**:
One fact about a jurisdiction's obligations, such as its penalties or its microenterprise
exemption: a typed value plus at least one citation. Claim ids come from the schema.
_Avoid_: rule, requirement, field

**Citation**:
Where a claim's value comes from: a source, a pinpoint, a verbatim quote, and an English
translation when the source is not in English. Once loaded, a **resolved citation** carries
its whole source.
_Avoid_: reference, footnote

**Source**:
One official document a citation quotes: a statute, a consolidated text, a gazette, a
Commission page, or an authority's own page. Each has a retrieval date and says whether a
script or a person re-checks it.

**Pinpoint**:
The place in a source a quote comes from, as precise as the text allows: "BFSG § 37 Absatz
2", "Article 32(2)".

**Unverified**:
Something the research looked for and could not confirm from an official source. Listed
per jurisdiction file, never written as a claim.

### Standards

**Harmonisation status**:
Whether conformity with EN 301 549 gives a presumption of conformity under the EAA:
`cited`, `not_cited` or `national_only`. Recorded once, in the EU file (ADR 0003).
_Avoid_: harmonised (on its own it is ambiguous between the EAA and the Web Accessibility Directive)

**Clause 9 criterion**:
One of the 50 WCAG 2.1 A and AA success criteria as EN 301 549 v3.2.1 numbers them, e.g.
9.1.4.3 for WCAG 1.4.3.

### Scanning

**Failing / needs review / not checked by axe**:
The three groups a scan result sorts clause 9 criteria into. There is no "passed" group
(ADR 0004).

## Relationships

- A **jurisdiction file** loads into a **cited jurisdiction**, or fails to load.
- A **claim** has one or more **citations**; each **citation** quotes one **source** at one **pinpoint**.
- Every **source** in a file is cited by at least one **citation**.
- The **harmonisation status** of a member state comes from the EU file, unless its own law names an EN 301 549 version.
