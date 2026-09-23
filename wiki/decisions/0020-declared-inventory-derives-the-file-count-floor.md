---
type: decision-record
title: "0020. Test-Count Floors Are Calibrated Exact-Current, and the File-Count Floor Becomes a Declared Inventory"
description: >-
  Both suites' test-count floors are calibrated exact-current rather than carrying slack, one rule for both; the file-count floor is retired as a hand-written literal and derived from a declared per-suite `expect` inventory whose length is the floor, and a present-but-undeclared file is reported as a non-fatal advisory rather than failing the run.
tags: [decision, ci, testing, verification]
status: stable
generated: { by: process:plan-task, at: 2026-09-23T00:00:00Z }
---
# 0020. Test-Count Floors Are Calibrated Exact-Current, and the File-Count Floor Becomes a Declared Inventory

- **Status:** Accepted
- **Recorded:** 2026-09-23
- **Issue:** #128
- **Relates to:** #119 / ADR 0019 (the gate this amends), `wiki/the-npm-surface-and-ci-gate.md`
  § *When a test-count floor moves* (the practice-note section this record is cited from)

## Context

`scripts/ci/gate.mjs` pins two literals per suite: a file-count floor (`minFiles`) and a
pass-count floor (`minPass`). At the time ADR 0019 landed the gate, those were plugin
`10`/`197` and workspace `3`/`33`. A floor is meant to be a floor — `>=` — but a
hand-written `minFiles` literal is really a stand-in for a fact the repo already states
somewhere else: the glob's actual match count. Nothing forced the two to track each
other, and issue #128 is what happens when they don't: the workspace suite grows test
files over time, the literal floors sit still, and a floor that should read as "at least
this many" quietly reads as "however many there were when someone last edited this file"
instead.

## Decision

### 1. Exact-current calibration, one rule for both suites

Both suites are calibrated to their actual current counts, not to actual-plus-slack.
There is no separate policy for the plugin suite and the workspace suite — the same rule
governs both, and the difference between them (one ships, one doesn't) attaches to the
test file, not to the floor.

### 2. The file-count floor becomes a declared inventory, not a literal

Each `SUITES` entry gains an `expect: [...]` list naming every test file that suite is
supposed to contain. The file-count floor is no longer written anywhere as a number — it
is `expect.length`. Adding or removing a test file means editing `expect`; the count
follows.

**The single-home question, settled so it is not re-litigated:** the glob
(`fs.globSync`) is how the gate asks which files are actually present; the declared
`expect` list is what it's checking that answer against. The glob is the query; the
declared list is the expected answer. A `minFiles: 3` literal was the lossy, count-only
form of that same expected answer — it discarded which three files were meant and kept
only how many. This decision does not add a second home for the file set; it completes
the one that already existed in incomplete form.

### 3. A present-but-undeclared file is an advisory, never a failure

`>=` must keep meaning `>=`. A file present on disk but missing from `expect` (an
unlisted file) is reported — a `STALE …` line, printed after the suite's own `OK …`
line — but it is never fatal. A file declared in `expect` but absent from disk (a
missing file) is fatal, by name, because that is a real regression rather than
staleness. The same non-fatal treatment applies to a pass count that has climbed above
its pass-count floor: reported, never failing the run.

## Consequences

- **The residual cost is named, not hidden.** The declared `expect` list can itself go
  stale — a file added to a suite but never added to `expect`. That is reported on every
  run by the advisory line, and is never fatal, which is exactly what keeps `>=` intact:
  adding a test can never break the gate, whether or not the person who added it also
  remembered to declare it.
- **The plugin suite's floors were reviewed against this policy and already complied.**
  Measured 2026-09-23 with `node scripts/ci/gate.mjs`: the plugin suite reports `10`
  file(s) and `197` passing, against floors of `10` and `197` — zero slack on either
  number, so nothing about the plugin suite's floors needed to change to conform. The
  workspace suite's floors are conformed separately, as part of the same issue's wiring
  task.
- **This is the one place `197` and `33` are named as concrete numbers.** The wiki
  practice-note this record is cited from deliberately never repeats a floor's current
  value — see `wiki/the-npm-surface-and-ci-gate.md` § *When a test-count floor moves* —
  so a re-measurement updates this dated record rather than a second, silently drifting
  copy in prose.

## Compromise

- **Keep literals but pad them — declared slack** — rejected. Padding the workspace
  pass-count floor to, say, `40` instead of its actual `33` only postpones the drift
  issue #128 is about: someone still has to measure the actual count eventually, later
  and against a moving target rather than a fixed point. It also fails "apply it without
  re-measuring" on arrival, since the padded value has to be chosen by measuring
  something in the first place. Worse, drift stays invisible between measurements — a
  padded floor gives no signal that it has gone stale until the padding itself is
  exhausted, which is a weaker guarantee than the exact-current literal it would replace,
  since that literal at least fails loudly the moment it falls behind. And it buys no
  churn saving: all four literals (two suites × two floors) would still need editing by
  hand under either policy; slack does not reduce how often that editing happens, it only
  delays the first occurrence.

## Related

- #128 — the issue this record closes out.
- ADR 0019 — the gate this record amends; the pre-conformance literals quoted in
  *Context* are the ones that ADR's landing introduced.
- `wiki/the-npm-surface-and-ci-gate.md` § *When a test-count floor moves* — the
  practice-note section a contributor reads before touching a floor.
