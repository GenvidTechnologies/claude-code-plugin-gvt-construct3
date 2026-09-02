---
type: decision-record
title: "0014. Mirrored Helper Tests Stay Byte-Identical; Local Additions Go in a Sibling File"
description: >-
  Test files mirrored from gvt-dev are copied verbatim and never appended to; coverage the mirror leaves open is closed in a separately-named sibling, so the mirror stays diffable against upstream.
tags: [decision, testing, audit]
status: stable
generated: { by: process:plan-task, at: 2026-09-02T00:00:00Z }
---
# 0014. Mirrored Helper Tests Stay Byte-Identical; Local Additions Go in a Sibling File

- **Status:** Accepted
- **Recorded:** 2026-09-02
- **Issue:** #96
- **Relates to:** #95

## Context

`plugin/skills/audit-c3-conventions/scripts/lib/frontmatter.mjs` and
`config-resolve.mjs` are copies of the same-named helpers in the `gvt-dev` plugin.
They are byte-identical to `gvt-dev` `v4.23.0` — verified by `sha256`
(`frontmatter.mjs` `6d8bb819eacd…`, 138 lines; `config-resolve.mjs`
`01ef96f1075a…`, 26 lines), with `diff -u` silent on both.

#96 mirrors `gvt-dev`'s two unit-test files for those helpers into this repo. The
files port with **no edits at all**: both repos place these tests at
`scripts/test/` importing `../lib/`, so the relative path is identical and the
upstream files run here unmodified (17 tests, 17 pass).

That byte-identity is not incidental. **#95 plans to delete both local helpers and
rewire this skill onto a published `@genvidtech/audit-core`**, at which point the
mirrored tests are intended to become that package's conformance suite. The
cheapness of #95 rests entirely on the local copies not having drifted from
upstream — a premise #95 records and this issue confirmed.

Mirroring alone leaves `frontmatter.mjs` at 90.58% line / 82.35% branch coverage.
#96's scope was widened at planning to close the reachable remainder, which raised
the question this record settles: **where do locally-authored test cases live?**

## Decision

**Files mirrored from `gvt-dev` are copied verbatim and never appended to.**
Coverage that the mirror leaves open is closed in a separately-named sibling file —
here, `frontmatter-branches.test.mjs` alongside the mirrored
`frontmatter.test.mjs`.

The rejected alternative was to append the new cases to `frontmatter.test.mjs`
itself. It closes exactly the same coverage and produces one fewer file.

## Consequences

**What this buys.** A mirrored file stays diffable against its upstream original
with a single `sha256` comparison. Whoever picks up #95 can confirm the
conformance-suite premise mechanically instead of reading a merged file and
guessing which cases came from where. A future upstream change to
`frontmatter.test.mjs` re-mirrors as a clean overwrite rather than a manual merge.

**What it costs.** One extra file per helper whose coverage we extend, and a
naming convention (`<helper>-branches.test.mjs`) that has to be honoured by
whoever adds the next case. The repo's test glob
(`skills/*/scripts/test/*.test.mjs`) picks up both without wiring, so there is no
configuration cost.

**A dead branch is reported upstream, never patched locally.** Closing the
remaining gap surfaced that `frontmatter.mjs:79-81` — the blank/comment skip at
the top of `parseArray`'s loop — is **unreachable**. `parseArray` has one call
site (line 57), which passes `peekNextNonBlank`'s index, non-blank by
construction; inside the loop `i` advances only through `parseBlock`, whose three
return sites are line 34 (`indent < baseIndent`, evaluated *after* the
blank/comment skip), line 40 (`startsWith('- ')`), and line 71 (`i ===
lines.length`, which exits the loop). So the loop-top line is always non-blank or
past the end.

Deleting the dead branch would fix the coverage figure and **break the
byte-identity above**, converting #95's cheap premise into a reconciliation. So
the rule that follows from this decision is: **a defect in mirrored code is filed
upstream, and the local copy is left alone.** `frontmatter.mjs:79-81` is
accordingly excluded from coverage expectations by name rather than chased, and
100% line coverage of that file is documented as unachievable while the mirror
holds. Filed upstream as
[`GenvidTechnologies/claude-code-plugin-gvt-dev#471`](https://github.com/GenvidTechnologies/claude-code-plugin-gvt-dev/issues/471).
