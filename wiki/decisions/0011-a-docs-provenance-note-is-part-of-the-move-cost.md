---
type: decision-record
title: "0011. A `docs/c3` Doc's Provenance Note Is Part of the Cost of Moving a Fact Into It"
description: >-
  A fact isn't relocated between `docs/c3` docs on topical fit alone; the target document's ADR 0008 provenance note (does it carve out runtime behaviour, or assert blanket sample verification?) is part of the move's cost.
tags: [decision, architecture]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-27T00:00:00Z }
---
# 0011. A `docs/c3` Doc's Provenance Note Is Part of the Cost of Moving a Fact Into It

- **Status:** Accepted
- **Recorded:** 2026-08-20
- **Issue:** #76
- **Extends:** ADR 0008

## Context

#76 removed a project-specific helper name (a `toggleInteractiveLayers` convenience
wrapper) from `construct3-guide.md`, and with it a dead cross-reference into
`layout-reference.md` that pointed at a section that was never written. The issue left
the resolution open: either delete the reference and state the underlying platform
mechanism directly in `construct3-guide.md`, or author a genuine layer-interactivity
section in `layout-reference.md` and repoint the anchor there. **The first option was
chosen.**

The mechanism itself is runtime input-routing behaviour: `System.set-layer-interactive`
blocks touch input on a layer, while `System.set-group-active(state=deactivated)` stops
every event in a group, including signal and timer handlers — a materially different
effect. Either doc could plausibly host this fact on topical grounds; `layout-reference.md`
covers layers, `construct3-guide.md` covers platform behaviour generally. Topic fit alone
does not settle where it belongs, and that is the point this ADR records.

The two docs carry different verification-provenance contracts under ADR 0008.
`construct3-guide.md`'s provenance note carries an explicit carve-out: its runtime-
behaviour sections (§5, §7) are "field knowledge no on-disk sample can observe."
`layout-reference.md`'s provenance note carries no such carve-out — it states that a
section marked `unverified` is a claim the sweep could not settle, and that everything
else was confirmed against `construct3-sample` or corrected to match it.

`construct3-sample` is an editor-validated *on-disk* C3 project. It structurally cannot
observe runtime input routing, in either direction — no static inspection of a project
file tells you what touch input does at runtime. Moving the layer-interactivity fact into
`layout-reference.md` unmarked would therefore assert sample verification of something
the sample can never verify.

Repairing that after the fact has no clean option. Amending `layout-reference.md`'s
provenance note to add a carve-out weakens the doc-level invariant ADR 0008 exists to
create. Adding an `unverified` callout instead runs into a direct rule conflict: ADR 0008
§1 lists "not observable from an on-disk project" among the forms a callout may take, but
the repo's own practice holds that a runtime/convention claim takes **no marker at all**,
and that adding one is a defect in both directions. Either branch hands whoever implements
the section an unresolved contradiction between two standing rules.

This is the same failure mode #72 surfaced: an acceptance criterion asked for an ADR 0008
marker on a section that was out of scope to verify, and implementing it verbatim would
have manufactured exactly the false confidence ADR 0008 exists to remove.

## Decision

**A fact is not relocated between `docs/c3` documents on topical fit alone. The target
document's provenance note is part of the cost of the move, and it is checked before the
move is made, not after.**

Concretely, for #76's site: the layer-interactivity mechanism stays in
`construct3-guide.md`, in the section whose provenance carve-out already covers it. That
section's number is retained — it stays §7, and only its title changes, to "Platform
Gotchas and Field Knowledge" — so the `(§5, §7)` citation inside the guide's own
provenance note stays true without needing an edit of its own.

The generalizable rule: before moving a claim into a document, read that document's
provenance note, not just its subject matter. A destination whose note asserts blanket
sample verification cannot silently absorb a claim the sample cannot verify — doing so
manufactures a verification claim the evidence does not support, even though the words
written would be true.

## Consequences

- `layout-reference.md` is untouched by this decision. Its clean provenance invariant —
  no carve-out, no exceptions — is preserved rather than complicated for one fact.
- No new inventory row, section, or anchor was needed in `layout-reference.md`; the
  dead cross-reference is simply gone, not replaced.
- `construct3-guide.md` keeps its §7 numbering through the title change, so nothing else
  that cites `(§5, §7)` needed to change alongside this fix.
- The next time a runtime-behaviour fact looks like it "belongs" in a sample-verified doc
  by subject matter, the check is the same: read the destination's provenance note first.
  If the destination's contract can't accommodate the fact's verification status without
  either weakening the contract or triggering ADR 0008's marker-conflict, the fact stays
  where its home document's provenance contract already covers it.
