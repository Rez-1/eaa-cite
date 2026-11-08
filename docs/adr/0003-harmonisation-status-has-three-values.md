# Harmonisation status has three values and is recorded once, at EU level

Whether conformity with EN 301 549 gives a presumption of conformity under the
European Accessibility Act is one of `cited`, `not_cited` or `national_only`
(`src/standards/harmonisation.ts`). The answer is recorded once, in
`data/jurisdictions/eu.json`, with its citations and the date it was checked.
A member state takes that answer unless its own law names an EN 301 549 version,
in which case it is `national_only` and cites its own law (`resolveHarmonisation`
in `src/dataset/index.ts`).

## The trap

EN 301 549 v3.2.1 is a harmonised standard under the Web Accessibility Directive,
2016/2102, which covers public sector bodies. That citation does not carry over
to the EAA, 2019/882, which covers private-sector products and services. Someone
who searches "EN 301 549 harmonised" finds the WAD citation, records it in good
faith, and a report then claims a presumption of conformity nobody has.

A yes/no field invites exactly that. With three values, the WAD answer has no
slot to go into: it is evidence for `not_cited` under the EAA, and the dataset
cites the Commission's WAD page for that reason.

As of 2026-11-08 no standard is cited under 2019/882. The Commission's list of
harmonised standards has one accessibility entry, for public sector websites and
apps.

## Why `national_only` does not permit the presumption

The presumption of conformity is the Official Journal mechanism in Article 15(1)
of the directive. A national law naming a version makes that version govern in
that member state. Whether that also confers the presumption is a legal question
this code does not answer, so `conformanceStatement` claims it only for `cited`.

## Why Spain is not `national_only`

Ley 11/2023 points to UNE 139803 "or whichever replaces it" for websites, with no
edition. That is a reference to a national standard, not to a version of EN 301
549, so it is recorded as its own claim (`nationalStandardReference`) and does not
change Spain's status.

## Why the wording is fixed

The sentence a report prints for each status is a string literal, and the tests
compare whole strings. Changing what an audit report says about the law should
be a diff someone reads.
