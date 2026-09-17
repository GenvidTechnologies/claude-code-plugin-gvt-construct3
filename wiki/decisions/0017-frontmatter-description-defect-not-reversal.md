---
type: decision-record
title: "0017. A Frontmatter `description` That Contradicts Its Own Body Is a Defect, Not a Reversal"
description: >-
  An index row misquoting its record is repaired on whichever side is wrong; when a record's own frontmatter description contradicts the body it summarizes, that is a metadata defect correctable in place, not a decision reversal earning a superseding record — and the licence extends to misstatement only, never to style.
tags: [decision, documentation, wiki]
status: stable
generated: { by: process:plan-task, at: 2026-09-15T00:00:00Z }
---
# 0017. A Frontmatter `description` That Contradicts Its Own Body Is a Defect, Not a Reversal

- **Status:** Accepted
- **Recorded:** 2026-09-15
- **Issue:** #112
- **Relates to:** ADR 0015 (the record whose description was corrected)

## Context

`wiki/decisions/index.md:9-13` requires each index row to mirror its record's
frontmatter `description` **verbatim**, with any later amendment appended *after* the
mirrored span rather than spliced into it. The stated reason is that a row which is not
a verbatim mirror makes the index **misquote the record it points at**.

#112 found two rows in violation and prescribed the same repair for both: restore the
row to mirror the record. For ADR 0014 that was right. For ADR 0015 it was backwards.

ADR 0015's body decomposes the mirror obligation into four numbered axes — the
discovery walk, the filtering policy, **the narrowing** (which internally mentions *"the
error message text"*), and **the closure boundary**. Its index row names the closure
boundary. Its own frontmatter `description` instead names *"the error rendering"*,
which is not an axis at all; it is a sub-detail of axis 3. The row was right and the
record's own summary was wrong.

Both texts were introduced in the **same commit** (`c2cadc2`), so neither is the later
revision of the other. Git provenance cannot adjudicate this; only the body can. The
description was **never** true of the record it summarizes — it is *born wrong*, not
*decayed*.

That left a rule with no branch for this case. `doc-inventories.md` § *ADRs are
historical records — don't retroactively rewrite them* says to leave `wiki/decisions/`
untouched **when a rename or refactor lands**, and to add a **superseding** record **if
a decision is genuinely reversed**. `CLAUDE.md` states the
same rule more tersely. A summary that contradicted its own body on the day it was
written is neither of those things, and the three available instincts were all bad:
mirror the wrong text verbatim and propagate the misstatement into the index; leave the
row divergent and let the convention #112 exists to enforce stay broken; or spend a
superseding decision record on a summary defect.

## Decision

**A record's frontmatter `description` is metadata *about* the decision, not the
decision. When it contradicts the body it summarizes, it is a defect, and it is
corrected in place.**

This is not an exception to the historical-record rule — it is outside its scope. That
rule protects **decisions** from being rewritten so the repo cannot retroactively
pretend it decided something else. Correcting a description changes no decision; it
makes the summary agree with a body that has not moved.

Two limits keep this from widening:

1. **Misstatement only, never style.** The licence covers a description that names a
   different element than the body, asserts something the body does not decide, or
   inverts a condition. It does **not** cover wording, markup, or tone. Concretely: ADR
   0014's row backticks `` `gvt-dev` `` where its frontmatter does not, and the repair
   for that is to **drop the backticks from the row**, not to add them to the record.
2. **The body is the authority.** The correction is derived from the record's own body,
   never from an index row, an issue, or a maintainer's recollection. Where the *body*
   is the wrong artifact, this record does not apply and a superseding record is still
   the route.

When an index row and its record disagree, establish which side is wrong **before**
choosing a repair. The convention's phrasing — *"restore the row to mirror the
record"* — presumes the record is right, and that presumption is what failed here.

## Consequences

- **The repair side is no longer assumed.** A divergence is a question about which
  artifact is wrong, answered by reading the record's body, rather than a mechanical
  instruction to rewrite the row.
- **The class is now mechanically detectable.** `scripts/check-index-mirrors.mjs`
  compares every row in `wiki/decisions/index.md` and `wiki/index.md` against its
  target's frontmatter `description`. It reports *that* a pair disagrees; it cannot say
  which side is wrong, which is exactly the judgement this record governs.
- **A verbatim-mirror convention destroys an independent witness.** This defect was
  visible only because the row disagreed with the description. Once every row mirrors
  its description exactly, a description that misstates its own body is invisible to
  the checker — the two will agree perfectly while both misquote the record. The 14
  other records were spot-checked by hand for this at the time of writing (0 defects),
  and that is the only method available.
- **The licence is narrow by construction.** Limit 1 means the most tempting edits —
  markup and phrasing — stay forbidden, so the historical-record rule keeps its force
  in every case it was actually written for.

## Compromise

- **Mirror the wrong description verbatim into the index** — rejected. It satisfies the
  convention's letter while producing exactly the harm the convention's own stated
  rationale names: an index that misquotes the record it points at.
- **Supersede ADR 0015** — rejected. Nothing about 0015's decision is reversed or
  amended; all four axes stand as written. A superseding record would assert a change
  that did not happen, and would set the precedent that any summary defect earns one.
- **Leave the row divergent and annotate it** — rejected. It preserves an accurate index
  at the cost of the convention #112 exists to enforce, and the annotation would have to
  explain that the record's own summary is untrustworthy without fixing it.
- **Treat the whole frontmatter block as freely editable** — rejected as too wide. The
  `description` is corrigible because it is a *claim about the body*, checkable against
  it. `status`, `title`, and the `generated` stamp are not, and limit 1 keeps them out.

## Related

- ADR 0015 — the record whose `description` was corrected under this rule.
- ADR 0014 — the sibling divergence, repaired on the *row* side under the same
  read-the-body-first test.
- [Doc inventories, ADRs, and the changelog](../doc-inventories.md) — the living-doc
  home of the historical-record rule this record scopes.
