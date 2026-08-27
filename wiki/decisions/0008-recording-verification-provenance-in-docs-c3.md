---
type: decision-record
title: "0008. Record Verification Provenance in `docs/c3`, and Cite the Sample Tag — Never `path:line`"
description: >-
  `docs/c3` docs declare their verification provenance so an *unmarked* section means "checked"; shipped docs cite the `construct3-sample` tag, never `path:line`, which drifts silently on a re-tag.
tags: [decision, architecture]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-27T00:00:00Z }
---
# 0008. Record Verification Provenance in `docs/c3`, and Cite the Sample Tag — Never `path:line`

- **Status:** Accepted
- **Recorded:** 2026-07-29
- **Issue:** #63

## Context

`plugin/docs/c3/` exists so agents can author **raw Construct 3 JSON**. A wrong shape there does not merely fail to help — it produces the defect the doc was written to prevent. The whole reference was founded by one commit (`41c1816`, 2026-06-02), a wholesale import adapted from a production project and from construct3-chef's reverse-engineering, at a time when no editor-validated C3 project was reachable to check it against. None of it was verified.

#59 proved one of those facts wrong after it had shipped for ~8 weeks. #63 swept the remaining 1,336 import-era lines against `GenvidTechnologies/construct3-sample` and found **six** more wrong facts, one of which had also been restated as an operational instruction in the `c3-implementer` agent.

The sweep exposed a structural problem the corrections alone do not solve: **a reader could not tell a verified claim from an unchecked one.** That is the condition that let #59's error survive, and correcting six facts without addressing it would simply reset the clock. Two questions had to be answered — how a doc records what was verified, and how a correction points at its evidence.

## Decision

### 1. Every swept doc declares its provenance, and marker *absence* is meaningful

Each doc carries a **verification provenance** note naming the ground truth (`construct3-sample@<tag>`), plus per-section *unverified* callouts in three distinct forms: construct absent from the sample, key present but empty, and not observable from an on-disk project.

The note states an **invariant**, not a status report: in a doc carrying it, a section with no unverified callout was confirmed against the sample or corrected to match it. This makes the *absence* of a marker a positive claim rather than the silence that caused #63. Every marker and note contains the literal string `construct3-sample`, so `grep -rn construct3-sample plugin/docs/c3/` returns the complete inventory.

Markers cover **structural / JSON-shape claims only**. A runtime, editor, or convention claim was never in scope to verify, so this sweep cannot leave it "looking verified"; the per-doc note covers those sections instead. Marking them would have touched ~630 lines and become the restructuring the issue put out of scope.

### 2. Shipped docs cite the sample **tag**; commit messages cite `tag path:line`

| Where | Cite | Why |
| --- | --- | --- |
| Branch commit message | `sample@v0.4.0 layouts/Main Layout.json:457` | The commit is frozen and the tag pins the line. Drift is impossible by construction. |
| `CHANGELOG.md` / squash body | tag + path, no line | A path survives a re-tag far better than a line. |
| **Shipped `plugin/docs/c3/*.md`** | **tag only — never `path:line`.** Point at a grep instead. | See below. |

An in-doc `Main Layout.json:457` is a pointer into a moving target. When the sample is re-tagged the line silently becomes wrong, and a consumer reading the installed plugin has no way to notice. A *wrong* citation in a verification note is worse than none, because it manufactures exactly the false confidence this reference is trying to remove.

The repo already has this failure mode on record: `docs/tool-surface-reconciliation.md`'s hardcoded count anchors, whose diagnosis in `CLAUDE.md` is that leaving them stale *"doesn't break the bump that made them wrong, it breaks the one after — that failure mode is invisible at the time you cause it."* The same file's rule preferring "skills include…" over "N skills exist" is the same principle. A tag plus a grep-able identifier is stable across re-tags; a line number is not.

## Consequences

- A future contributor adding a fact to `docs/c3` inherits a stated obligation from the doc being edited, not only from `CLAUDE.md`: verify against the sample, or add a marker.
- The verification state of the whole reference is machine-enumerable with one grep.
- Precise evidence is not lost — it lives in the commit message, where it cannot drift.
- **Cost:** the provenance note is uniform across all swept docs. That uniformity is load-bearing (it is what makes marker-absence informative), so a doc swept later must gain the note, or the invariant weakens to "some docs were checked".
- **The tag must exist before a citation is written.** #63 paused mid-execution for `construct3-sample@v0.4.0` to be cut rather than citing an untagged commit or inventing a second citation style.
- This ADR governs recording and citation only. The rule about *what the sample can prove* — including that an empty container never establishes a prohibition, the error that shipped here — lives in `CLAUDE.md` alongside the other verification traps.
