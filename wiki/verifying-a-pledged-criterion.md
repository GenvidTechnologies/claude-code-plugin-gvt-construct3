---
type: practice-note
title: Verifying a pledged acceptance criterion
description: >-
  How a criterion's own check goes wrong — a grep standing in for coverage, a recount standing in for a diff, a diff read with context standing in for its changed lines, a hand-guessed mutation standing in for a discriminating one, a token count standing in for the sites it means, and a line range standing in for an anchor — with the measurement that settles each.
tags: [verification, acceptance-criteria, testing, coverage]
status: stable
generated: { by: process:plan-task, at: 2026-09-02T00:00:00Z }
---
# Verifying a pledged acceptance criterion

A pledged criterion is graded twice — by the validator and by the code reviewer —
and it is written into a tracker issue where it outlives the branch. That makes a
*wrong check* nearly as expensive as a wrong row: both produce a confident verdict
nobody re-derives. The failures below all have the same shape — **a cheap proxy
standing in for the measurement the row actually asserts.** Each section names the
session it came from; they are not all from one, and the list is meant to grow.

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

## A diff read with context is not a diff of changed lines

The remedy above sends you to `git diff` — and there is a trap one step inside it.
An *empty* diff is unambiguous, but a **partial** no-change row is not: *"this file
changed, but the part the row protects did not."* Checking that means reading the
diff's **lines**, and by default `git diff` prints three lines of unchanged context
on either side of every hunk. A `grep` over that output counts context as evidence.

The #112 case: the row pledged *"the `0015` row in `wiki/decisions/index.md` is
byte-unchanged"*, while the same commit deliberately edited the `0014` row two lines
above it. The check —

```bash
git diff -- wiki/decisions/index.md | grep -c '0015-discharging'    # -> 1
```

— returned **1**, which reads as a violation. The hit was a context line: the
protected row sits inside the hunk created by the change beside it. The true answer
was **0**.

This is the false-**red** direction, and it is self-concealing in a specific way:
the closer the protected text sits to the edit, the likelier it is to be pulled in
as context — so the check fails hardest exactly where the row matters most. A row
protecting something *far* from the change quietly passes and never exposes the bug.

**Ask for changed lines only, and strip the file headers:**

```bash
git diff --unified=0 <base>...HEAD -- <path> \
  | grep '^[+-]' | grep -v '^\(+++\|---\)' > changed.txt
grep -c '<the protected token>' changed.txt      # 0 means untouched
```

`--unified=0` removes context; the second `grep -v` removes the `+++`/`---` header
lines, which otherwise look like changed lines to any `^[+-]` filter.

**Then run the positive control**, because this check's passing answer is `0` and so
is a dead check's — the failure shape [the sweep-breadth
rule](doc-inventories.md#a-discovery-sweep-must-be-as-broad-as-the-defect-class-it-describes)
warns about, pointed at a single row. Edit the protected text on purpose, confirm the
count goes non-zero, and revert:

```bash
sed -i 's/<protected phrase>/<altered>/' <path>   # must make the count non-zero
```

A no-change row whose check has never returned non-zero has not been verified; it
has been asserted.

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

## A token count is not a site check

A row that means *"these N specific places moved"* is tempting to check by counting
the new token across the files those places live in. The count is a proxy for the
sites, and it breaks the moment anything **else** in those files legitimately gains
the same token — including a later task in the very same plan.

The #120 case: R1 pledged that the five hard chef pin sites read `2.0.0`, checked as
*"`grep -c "2\.0\.0"` across the four pin files returns 5."* Task 3 of the same plan
then unified the `txId` prose and wrote *"Both `construct3-chef` (since `@2.0.0`)…"*
into `plugin/agents/c3-implementer.md:88` — a sixth occurrence that is **not** a pin
site. The measured total was 6 against a pledged 5. Nothing was wrong with the work;
the row simply could not tell a pin site from a sentence.

Note this is the **same collision the absence-row rule already guards against**,
arriving from the opposite direction. `plan-task` tells you to re-run every *absence*
row against the mentions later tasks will legitimately add — and that screen was run
here, and worked. Nobody extended it to a row pinning a token's **exact count**, which
is vulnerable identically: any row fixing an occurrence total over a corpus a later
task will write to is jointly unsatisfiable with that task. Filed upstream as
[gvt-dev#464](https://github.com/GenvidTechnologies/claude-code-plugin-gvt-dev/issues/464),
where the first instance was a page tally; a version string behaves the same way.

**Assert per-site, not per-corpus.** `grep -c 'construct3-chef@2\.0\.0' <each file>`
against its own expected number pins the sites themselves and is indifferent to prose
elsewhere in the file. The paired *absence* half — `grep -c "1\.2\.0"` totalling 0
across those files — needs no such care, because no later task had reason to
reintroduce the old version.

## A line range is not an anchor

A row that means *"this anchor now carries the current value"* cannot be checked by
printing fixed line numbers. Any insertion above them shifts the target, so the check
fails on a **correct** execution — and, worse, the range silently starts describing
whatever moved into it.

The #120 case: R9 pledged the wiki count anchors were refreshed *"in place"*, verified
by `sed -n '270,275p;350,354p;404,417p'`. Both halves were wrong when written. The page's
own convention is **additive** — `pin-bump-verification.md:363` records the dm `0.10.1`
re-probe as a new row beside `0.9.0`'s rather than replacing it, and that predates the
branch — so "in place" contradicted the pattern the task was meant to follow, and would
have destroyed the historical chain that makes a delta legible. The line ranges then
could not survive the additive edit that actually happened.

**Address an anchor by its content, not its coordinates** — `grep -n 'holds 26'`, not
`sed -n '270,275p'`. And before pledging *how* an edit lands, read how the target file
already records the same kind of fact; a criterion that prescribes an edit **mechanism**
can contradict the file's own convention, which is a defect no amount of careful
execution can satisfy.

Both #120 rows were **defective, not decayed** — unsatisfiable when written rather than
overtaken by drift, the distinction `planner.md` draws as *"a decayed row was right once,
a mismarked row never was."* Both were amended in the open on the issue, carrying the
original wording, the defect, and the evidence, per ADR-0017: a pre-committed target may
move, but never silently.

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
