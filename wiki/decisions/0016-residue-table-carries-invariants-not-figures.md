---
type: decision-record
title: "0016. The Residue Table Carries Invariants; Concrete Figures Live in One Dated Measurement"
description: >-
  The expected-audit-residue table states invariants and derivations rather than fixed counts; the one concrete measurement lives in a single dated worked example, so a re-measure updates one site instead of three.
tags: [decision, audit, documentation]
status: stable
generated: { by: process:plan-task, at: 2026-09-15T00:00:00Z }
---
# 0016. The Residue Table Carries Invariants; Concrete Figures Live in One Dated Measurement

- **Status:** Accepted
- **Recorded:** 2026-09-15
- **Issue:** #106

## Context

`wiki/the-audit-contract.md` § *Expected audit residue* tells a maintainer what a clean
audit run of this repo still prints, so that known cost is not mistaken for regression.

The page has argued since it was written that **a fixed count is the wrong baseline** — the
broken-link total moves whenever anyone adds or removes an intra-wiki link, so pinning a
number guarantees false alarms on legitimate edits. What actually holds is a one-to-one
correspondence between warnings and raw `](/…)` matches.

It nonetheless carried fixed counts in three places, and they disagreed:

- the table's broken-link row (`— 76 today`)
- the prose two paragraphs below it (`76 warnings, 78 raw matches`)
- a worked example added later by #107, reporting `79 / 81 / scanned 19 / exit 0` and
  calling it *"the 4.24.0 baseline"*

By the time #106 was planned the document asserted both the 4.22.0 figures and the 4.24.0
figures at once, under a header claiming the whole table was measured at 4.22.0. Each site
was individually defensible when written; together they made the page self-contradictory,
and a re-measure had to find and update all three or make the contradiction worse.

A second, independent failure pushed the same way. The table's `scanned` row was
accompanied by a caveat that the figure "was not independently derivable" and should be
treated as opaque. That was false: the figure is one per `.md` under `wiki/` outside
`hygiene.excludePaths`, plus `CLAUDE.md`. The earlier count that produced the caveat had
included only top-level `wiki/*.md` and missed `wiki/process/`. Because the number looked
unexplainable, its last move — 18 to 19 — was attributed to the gvt-dev version bump, when
in fact `9f1e107` had added a wiki page. **An unexplained figure invites a wrong causal
story**, and the table is where that story gets repeated.

## Decision

**The residue table states invariants, derivations and causes. It does not carry fixed
counts. Exactly one dated worked example carries the concrete measurement.**

Concretely:

- A row whose value moves with the corpus states the **rule** it follows — *"one per
  intra-wiki bundle-absolute link"*, *"one per `.md` under `wiki/` outside
  `hygiene.excludePaths`, plus `CLAUDE.md`"* — not the number that rule currently yields.
- A row whose value is genuinely stable (`retired-token 8`, `exit 0`) keeps its number,
  because for those the number *is* the invariant.
- The concrete pair lives once, in the dated worked example, tied to the PR that measured
  it. A re-measure updates that one site.
- Where a figure's stability is the point, state the **offset** rather than the operands:
  the warning count runs two short of the raw count because two matches are backticked
  prose examples. That survives every corpus change; `76` and `78` did not.

## Consequences

**A re-measure now touches one site, not three.** This is the direct win, and it removes the
class of defect #106 existed to clean up.

**The at-a-glance number is gone from the table.** This is a real cost, named rather than
waved away: a maintainer skimming the table can no longer eyeball "is 79 about right?"
without reading down to the worked example. Accepted because the eyeball check was the
mechanism by which three sites drifted apart in the first place, and because the page's
`stale_after` already assumes periodic re-measurement.

**An unexplained figure is now a defect, not a caveat.** The previous handling — document
the opacity and instruct readers to trust the measured value — reads as rigor but
suppresses the question. A figure that cannot be derived should be derived, and if it truly
cannot be, the reason belongs in the table alongside it.

**Inert checks must say why they are inert.** The same edit recorded that three 4.24.0
content scans fire zero times here because `AUDITING_PLUGIN_SOURCE` gates them off, not
because this repo conforms. A zero with no cause reads as a pass; two of those three carry
`error` severity and would move the exit code if the gate ever opened.

## Alternatives considered

**Refresh the numbers in place (76 → 79, 78 → 81).** Smallest diff, preserves the eyeball
check, touches nothing #107 landed. Rejected: it perpetuates exactly the rot the page argues
against, leaves three sites to update on the next bump, and the `scanned` finding above is a
live demonstration of where that ends — a stale figure that acquired a wrong causal story.

**Keep numbers everywhere but date each one.** Honest about staleness, and cheaper to read
than a derivation. Rejected as a half-measure: it still requires three coordinated edits per
re-measure, so the sites can still drift apart between bumps — only now each one carries a
date asserting it was correct at a moment that may no longer apply to its neighbours.
