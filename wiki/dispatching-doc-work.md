---
type: practice-note
title: Dispatching documentation work
description: >-
  tech-writer fabricates plausible concrete detail beyond its source, so classify by payload rather than genre — prose can be dispatched, but symbols, paths, field names and schemas are authored inline, and an ADR is not exempt for reading like prose.
tags: [agents, tech-writer, documentation, dispatch, verification]
status: stable
stale_after: 2027-09-17
generated: { by: process:run-retro, at: 2026-09-17T00:00:00Z }
---
# Dispatching documentation work

`gvt-dev:tech-writer` is the plan pipeline's documentation implementer, and the
default assignment for any doc task. It is good at prose. It is **not** reliable
with concrete detail: handed a task whose payload is specific values, it will
invent plausible ones and render them fluently.

This matters more than an ordinary agent mistake because **no automated gate looks
at it.** Comment and document prose is not type-checked, not linted, and not
asserted on by any test, so a fabricated field name ships green. `plan-task` states
the general form of this — *an implementer's authored technical claims are output,
not report* — and this page is the local rule that follows from it.

## Classify by payload, not by genre

The question is never *"is this a document?"* — it is *"what is this document
made of?"*

| Payload | Route |
|---|---|
| Explanation, rationale, narrative, a rewritten section | **Dispatch.** This is what the agent is for. |
| Field names, JSON/YAML shapes, error strings, config keys | **Author inline.** |
| File paths, symbol names, function or tool names | **Author inline.** |
| A what-changed inventory, a list of what a PR touched | **Author inline**, or hand over the staged diff and verify every line. |

**Genre is not payload, and an ADR is the trap.** A decision record reads like
prose and invites the dispatch, but its load-bearing content is usually a set of
names — the symbols, versions, and paths the decision is *about*. Classify it by
what it contains, not by how it reads. The same widening covers **another repo's**
symbols: being outside this repo makes a name harder to check, not safer to guess.

## When you do dispatch

Three things make the difference, and they compose:

1. **Hand over the exact facts**, not a description of where to find them — the
   staged diff, the measured table, the enumerated list.
2. **Say explicitly not to over-claim**, and that an uncertain item should be
   reported as uncertain rather than smoothed into confident prose.
3. **Verify before committing.** Diff the rendered claims against the source data
   you supplied. A paraphrase can invert a boolean or drop a qualifier while
   reading perfectly well.

The third is not optional, and it is the one that gets skipped when the rest of the
work looks clean.

## The failure is silent and reads well

The recurring shape: a fabricated detail is *plausible*. It matches the
surrounding naming convention, it sits in the right place, and it is the kind of
thing that would exist. So nothing about it prompts a second look — which is
exactly why the rule has to be applied at dispatch time, by classifying the
payload, rather than caught at review time by noticing something odd.

Rationale prose is the sharpest case. It exists to steer a future reader, so an
inverted reason argues *for* the change it was written to prevent.

## Related

- [Working with the code reviewer](/working-with-code-review.md) — the sibling
  rule for the other agent whose silence and confidence both need checking.
- [Doc inventories, ADRs, and the changelog](/doc-inventories.md) — what a new doc
  or section obliges elsewhere, including the descriptions that go stale with it.
- [Agent capability envelopes](/agent-capability-envelopes.md) — the same
  don't-ask-an-agent-for-what-it-cannot-do reasoning, applied to this plugin's own
  two C3 agents.
