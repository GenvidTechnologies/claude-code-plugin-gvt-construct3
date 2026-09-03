---
type: practice-note
title: Verifying a pledged acceptance criterion
description: >-
  How a criterion's own check goes wrong — a grep standing in for coverage, a recount standing in for a diff, and a hand-guessed mutation standing in for a discriminating one — with the measurement that settles each.
tags: [verification, acceptance-criteria, testing, coverage]
status: stable
generated: { by: process:plan-task, at: 2026-09-02T00:00:00Z }
---
# Verifying a pledged acceptance criterion

A pledged criterion is graded twice — by the validator and by the code reviewer —
and it is written into a tracker issue where it outlives the branch. That makes a
*wrong check* nearly as expensive as a wrong row: both produce a confident verdict
nobody re-derives. The three failures below all came from one session (#96) and all
have the same shape — **a cheap proxy standing in for the measurement the row
actually asserts.**

Sibling pages: [Doc inventories, ADRs, and the changelog](doc-inventories.md) covers
scoping an *absence* criterion; this page covers checking a criterion once it exists.

## A grep is not a coverage measurement

`grep` answers *"is this symbol named here?"*. A criterion about whether code is
**exercised** needs `node --test --experimental-test-coverage`, and the two answers
diverge whenever a symbol is reached indirectly.

The #96 case: triage recorded that `parseYaml` had *"zero coverage — never imported,
never reached by name"*, and an acceptance criterion was built on it — mutate
`parseYaml`, since the existing suite is blind to it. But `frontmatter.mjs`'s
`extractFrontmatter` **calls** `parseYaml`, so every existing `extractFrontmatter`
test exercised it. The premise was false the moment it was written, and the probe it
specified would have reddened the pre-existing suite — exactly as vacuous as the
criterion it was introduced to replace.

**Never treat "grep finds no import" as "not covered."** Run coverage.

## A recount is not a diff

A row asserting *"X did not change"* is tempting to check by re-counting X and
comparing to a baseline. That check asserts over whatever corpus the count command
happens to sweep, which is rarely the corpus the row names.

The #96 case: the row pledged *"no `metadata.expects.mcp[].minVersion` change
(baseline: chef `1.2.0` ×4)"*. A `grep -rh 'minVersion: "1.2.0"' plugin/skills/*/SKILL.md`
returned **5**, because `create-c3-op/SKILL.md` also discusses the floor in prose.
Nothing had changed; the *check* swept whole files where the row asserts over
frontmatter entries.

**Check a no-change row with `git diff`, scoped to the paths the row names.** An
empty `git diff --stat <base>...HEAD -- <paths>` proves nothing moved, needs no
baseline, and cannot be thrown off by a prose mention. Reach for a count only when
the row genuinely asserts a quantity, and then match the count's corpus to the
row's — see `designer.md`'s rule that a baseline measured over a narrower (or wider)
corpus than the row asserts over is defective even when the measurement was correct.

## A guessed mutation is not a discriminating one

When a criterion demands a mutation that leaves the pre-existing suite **green**
while reddening the new tests, the mutation has to be *found*, not proposed.
Reasoning about which branch "looks untested" fails quietly, because the interesting
branches are usually reachable by some path you did not think of.

The #96 case: two hand-picked mutations both turned out non-discriminating. Removing
`parseBlock`'s comment-skip changed nothing, because a comment line has no colon and
falls through the no-colon branch anyway. Coverage then named the surface in one
shot — `config-resolve.mjs:17-18`, uncovered by the pre-existing suite and closed
exactly by the new tests:

```
                              pre-existing suite      mirrored tests
guard at config-resolve.mjs:16 disabled   175 pass / 0 fail    15 pass / 2 fail
```

**Diff the coverage report with and without the new tests.** The lines that move from
uncovered to covered *are* the discriminating surface; anything else is a guess.

## Two things this does not license

**Coverage is not the criterion.** A line can be executed without being asserted on.
Coverage tells you where a mutation *can* be detected; whether it *is* detected still
needs the red→green transition run.

**An uncovered line is not automatically a gap to close.** It may be unreachable. In
#96, `frontmatter.mjs:79-81` resisted every targeted test because `parseArray`'s
blank/comment skip cannot execute — its only call site passes a non-blank index, and
inside the loop `i` advances only through `parseBlock`, whose return sites are all
non-blank or past end-of-input. The right move was to exclude it **by name** with the
proof recorded, file it upstream where the code is owned
([gvt-dev#471](https://github.com/GenvidTechnologies/claude-code-plugin-gvt-dev/issues/471)),
and stop the criterion at the achievable figure — not to chase 100%, and not to
delete the dead branch locally, which would have broken a byte-identity another issue
depends on. See [ADR 0014](decisions/0014-mirrored-tests-stay-byte-identical.md).
