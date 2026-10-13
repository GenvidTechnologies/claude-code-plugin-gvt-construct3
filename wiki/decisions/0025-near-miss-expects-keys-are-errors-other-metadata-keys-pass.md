---
type: decision-record
title: "0025. A Near-Miss of expects Is an Audit Error; Other metadata Keys Pass Silently"
description: >-
  The audit reports a top-level `expects`, and any top-level or `metadata` key that is a near-miss of `expects` (case-insensitive, within edit distance 2 or starting with `expect`), as an error, because audit-core reads only `metadata.expects` and the block would otherwise give zero findings. Every other `metadata` key passes silently, so custom keys such as gvt-dev's `metadata.pillar` stay legal.
tags: [decision, audit]
status: stable
generated: { by: process:plan-task, at: 2026-10-13T00:00:00Z }
---
# 0025. A Near-Miss of expects Is an Audit Error; Other metadata Keys Pass Silently

- **Status:** Accepted
- **Recorded:** 2026-10-13
- **Issues:** #157 (raised by the #156 code review)
- **Extends:** the malformed-shape checks #156 added to `evaluateExpectsShape`; see
  [The convention contract and the audit](/the-audit-contract.md).

## Context

audit-core's walk reads a component's expectations from `metadata.expects` and nowhere
else (`expects: parsed.value.metadata?.expects ?? null`). #156 made the audit report a
`metadata.expects` that is the wrong shape, but a block in the wrong *place* never
reaches that check. On `7d8f037`, running the real `walkComponents` → `evaluateComponentFindings`
gave **zero findings** for each of a top-level `expects`, a top-level `expect`, and
`metadata.expect`, `metadata.Expects` and `metadata.expectations`. A component written that
way silently declares nothing.

The fix for the misplaced case is unambiguous. The misspelled case needs a rule for which
`metadata` keys to report, and the skill-authoring convention puts custom keys under
`metadata` on purpose. The gvt-dev ecosystem already uses one: `metadata.pillar`, checked
by gvt-dev's own `pillar-unknown` scan.

## Decision

`evaluateExpectsShape` reports one `kind: 'expects'` **error** for:

- a top-level key that is exactly `expects`;
- a top-level key, or a key under `metadata`, that is a **near-miss** of `expects`: not
  exactly `expects`, and, compared case-insensitively, either within Levenshtein distance 2
  of `expects` or starting with `expect`.

Every other `metadata` key passes silently. A well-formed `metadata.expects` beside a
near-miss is still evaluated, so the typo doesn't hide a real gap.

## Alternatives considered

- **Allow-list: `metadata` may hold only `expects`.** The simplest rule, but it makes every
  custom key an error and forbids the `metadata.pillar` pattern the convention invites.
  Rejected.
- **Near-miss as error, plus every other unknown `metadata` key at `info`.** Nothing is
  hidden, but each legitimate custom key adds a standing line to every consumer's audit
  output, which is noise the reader learns to skip. Rejected.
- **Edit distance alone, without the prefix clause.** Misses `expectations` (distance 5),
  the most natural long-form misnaming. The prefix clause was kept.

## Consequences

- A component that misplaces or misspells its expectations now fails the audit (exit 1)
  instead of passing with nothing declared.
- **Accepted false positives:** a legitimate key within distance 2 of `expects`, such as
  `metadata.exports`, is reported. The prefix clause reaches further than the distance
  clause: any key starting with `expect`, such as `metadata.expectedVersion`, is reported
  too. No component uses such a key. The remedy is to rename it.
- A component with **no frontmatter at all** still gives zero findings. That happens in
  audit-core's walk (0.3.0 returns `expects: null` with no error flag). It was noted in a
  comment on GenvidTechnologies/audit-core#19, which closed without addressing it, and is
  now tracked as GenvidTechnologies/audit-core#23.
- **Update 2026-10-13:** the no-frontmatter gap above is closed by audit-core 0.4.0
  (#160), which reports such a file as malformed with code `NO_FRONTMATTER`.
