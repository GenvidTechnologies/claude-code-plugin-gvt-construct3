---
type: practice-note
title: Verifying docs/c3 against construct3-sample
description: How a C3 platform fact in plugin/docs/c3/ is proved against the editor-validated construct3-sample project, how its provenance is cited, and the seven traps that each shipped a wrong doc or came one decision from it.
tags: [docs-c3, verification, construct3-sample, provenance, adr-0008]
status: stable
stale_after: 2027-08-18
generated: { by: process:maintain-wiki, at: 2026-08-20T00:00:00Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-18.md
    title: CLAUDE.md as captured before the wiki migration
    last_modified: 2026-08-18
  - id: claude-md-upstream
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/CLAUDE.md
    title: CLAUDE.md in the repo (living version)
  - id: adr-0008
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/decisions/0008-recording-verification-provenance-in-docs-c3.md
    title: ADR 0008 in the repo (living version)
  - id: adr-0011
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/decisions/0011-a-docs-provenance-note-is-part-of-the-move-cost.md
    title: ADR 0011 in the repo (living version)
---

# Verifying docs/c3 against construct3-sample

`plugin/docs/c3/` exists so agents can author **raw** C3 JSON. A wrong shape
there doesn't merely fail to help — it actively produces the defect the doc was
written to prevent. So every structural claim is proved against
`GenvidTechnologies/construct3-sample`, an **editor-validated** project: every
shape in it was written by a real Construct 3 editor save.[^claude-md]

## Getting the ground truth

The sample is `gh`-reachable (tags `v0.1.0`–`v0.4.0`). Grab it **whole** rather
than making per-file API calls, then `grep -rn` the addon id across `project/`
to find *every* site of a fact at once — declaration, applied data, and the
`usedAddons` entry — instead of guessing which file holds it:

```bash
gh api repos/GenvidTechnologies/construct3-sample/tarball/v0.1.0 > s.tgz && tar xzf s.tgz
```

## Citing provenance

Cite the sample **tag** in shipped docs, never `path:line`
([ADR 0008](/decisions/0008-recording-verification-provenance-in-docs-c3.md)).
A line number points into a moving target and rots silently on a re-tag, and a
wrong citation inside a *verification* note is worse than no note at all. Put
the precise `sample@<tag> <path>:<line>` in the **commit message**, which is
frozen.

Each swept doc carries a provenance note that makes marker-*absence* meaningful
(unmarked ⇒ verified), so a fact you add must either be verified against the
sample or carry an `unverified` callout. `grep -rn construct3-sample plugin/docs/c3/`
lists the inventory.

If the evidence you need exists only on an untagged commit, **get it tagged
before writing the citation** — don't invent a second citation style. Issue #63
paused for `v0.4.0` rather than do that.

## Markers have a scope — and stating the rule without it authors a wrong marker

ADR 0008 §1 limits markers to **structural / JSON-shape claims only**. A
runtime, editor, or convention claim was never in scope to verify; the per-doc
note covers those sections instead.

So a **structural** fact takes a marker. A runtime/editor/convention claim takes
**no marker at all**, and adding one is a defect in both directions: it
contradicts the ADR, *and* it implies the unmarked remainder of that section was
sample-verified when the per-doc note says the opposite.

`construct3-guide.md`'s note names **§5 and §7** as "field knowledge no on-disk
sample can observe". `## 5. C3 Runtime Behavior` is therefore marker-free **by
design, not by omission**.

> **Precedent.** An acceptance criterion on #72 asked for an ADR 0008 marker at
> `construct3-guide.md:193`, inside §5 — following an earlier phrasing of this
> rule that omitted the scope restriction. Implementing it verbatim would have
> manufactured exactly the false confidence ADR 0008 exists to remove.

**Read the ADR before acting on an issue's instruction that cites it.** A
criterion naming a governing rule is a claim *about that rule*, and this repo's
"verify against the artifact it modifies" habit points at the doc being edited,
not at the rule being invoked.

## The seven traps

1. **A key that is present but empty proves the key is valid on that host, not
   what its populated shape is.** `"effectTypes": []` on layout roots confirms
   layouts carry effects, but the populated form was only observable on a layer.
   Don't promote an analogy to a verified example.

2. **An empty container never proves a *prohibition*.** The inverse of (1), and
   the one that actually shipped. An empty observed instance is not evidence
   that content is disallowed, cleared, or must stay empty — that needs positive
   evidence of the clearing behaviour. In #63, `layout-reference.md`'s "an
   overridden layer's `instances` MUST be empty / are cleared" had been read off
   a sample whose only overridden layer happened to be empty;
   `construct3-sample@v0.4.0` then supplied a counterexample retaining a fully
   populated instance.

   Note the **failure direction**: the claim licensed *deleting live data*, and
   one of its four sites had been authored by #59 itself — a wrong "must be
   empty" propagates forward into post-sample content unless someone greps for
   it. When a sweep meets a *"must be empty"* / *"is cleared"* / *"always
   empty"* claim, treat it as unverified until a populated counterexample is
   ruled out, not as confirmed by the first empty instance you find.

3. **The doc is a suspect, not the baseline.** #59 arrived as a proposal that
   contradicted `layout-reference.md`; the sample showed the *doc* had been
   wrong since `41c1816` (2026-06-02) — the wholesale "from chef" import that
   founded `plugin/docs/c3/` and was never verified against a real project.
   Facts added *since* the sample became reachable were verified against it
   (`event-sheet-architecture.md`'s behavior `sid` is byte-identical to
   `families/TextFamily.json`), so treat pre-sample content from that import as
   unverified until checked.

4. **A correction is not inventory-neutral.** A `docs/c3` content correction
   earns a `plugin/CHANGELOG.md` entry — see
   [Doc inventories and the changelog](/doc-inventories.md).

5. **A *toolchain* claim has no ground truth here at all — and the provenance
   note will imply it was checked anyway.** The four traps above are all about
   reading the sample correctly. This one is about a claim the sample can never
   speak to: `construct3-sample` cannot verify `generateUniqueSid()`, because
   that is not a C3 fact. No editor-validated project can observe another
   repo's exported symbols.

   So `construct3-guide.md`'s SID-generator passage — naming two chef functions
   that had already been **removed** — sat untouched through #63's verification
   sweep *and* #71's follow-up, and **both passed clean and were right to**:
   they were checking C3 JSON shapes, which is their whole job.

   The sharp part is the interaction with ADR 0008. The per-doc note makes
   marker-**absence** meaningful — unmarked ⇒ verified — so an unmarked
   chef-symbol claim reads as *checked* when it was never in scope to be
   checked. The trap is not merely "the sample is silent here"; it is "the
   doc's own provenance convention will assert otherwise."

   The remedy is structural rather than procedural: don't name the symbol, and
   the unverifiable claim stops existing. See
   [Name chef's capability, never chef's symbol](/knowledge-boundaries.md).

6. **A destination doc's provenance note is part of the cost of moving a fact
   into it.** Traps 1–5 are about whether a claim is true. This one is about
   where it is allowed to live: the docs in this bundle do **not** all carry the
   same provenance contract, so a fact that is correctly stated in one doc can
   become a false claim simply by being moved to another.

   `construct3-guide.md`'s note carves out its runtime sections — "the
   runtime-behaviour sections (§5, §7) are field knowledge no on-disk sample can
   observe". `layout-reference.md`'s note carries **no** such carve-out:
   everything unmarked there reads as confirmed against the sample.

   In #76 the obvious fix for a dead cross-reference was to author the missing
   section in `layout-reference.md` and repoint the link at it. The fact in
   question — `System.set-layer-interactive` blocks touch input where
   `System.set-group-active(state=deactivated)` stops every event in the group,
   signal and timer handlers included — is **runtime input routing**, which an
   on-disk project cannot observe in either direction. Moving it would have
   asserted sample verification of something the sample can never verify.

   Both repairs cost more than they look. Amending the destination's note
   weakens a doc-level invariant that is currently clean. Adding an `unverified`
   callout collides with the marker **scope** rule above — ADR 0008 §1 lists
   "not observable from an on-disk project" among its callout forms, while this
   page holds that a runtime claim takes no marker at all. Either branch hands
   the implementer an unresolved conflict between two standing rules.

   So: **read the destination's provenance note before moving a fact, not just
   its subject matter.** Topical fit is not the criterion. Recorded as
   [ADR 0011](/decisions/0011-a-docs-provenance-note-is-part-of-the-move-cost.md);
   the fact stayed in `construct3-guide.md` §7, whose carve-out already covered
   it, and `layout-reference.md` was left untouched.

7. **The sweep cannot see broken navigation — and marker-absence will imply it
   can.** This is trap 5's shape a second time, and the repetition is the point:
   the sample settles *shapes*, so every non-shape property of a doc is outside
   what "verified" ever meant. A link is not a shape.

   `construct3-guide.md` shipped a link to
   `layout-reference.md#modal-layer-management-toggleinteractivelayers` in the
   founding import `41c1816`. Git history shows **no revision of
   `layout-reference.md` has ever contained a heading of that name** — it was
   never a link that rotted; it was broken on arrival. It then survived #59,
   #63, #71, #72, #79 and #80, including **both** explicit verification sweeps —
   and, exactly as in trap 5, every one of those passes was **right**: they were
   checking C3 JSON shapes.

   Nothing else covered it either. The deep-link rule in
   [Doc inventories and the changelog](/doc-inventories.md) fires when *you*
   remove a heading; it says nothing about a referrer that never had a target.
   `gvt-dev:audit-conventions`' hygiene scan enumerates `docs/**.md` plus
   repo-root `CLAUDE.md`, so it does not see `plugin/docs/c3/` at all.

   #76 closed the gap with `scripts/check-doc-anchors.mjs` — dev-workspace,
   dependency-free, resolving every intra-repo link against real GitHub heading
   slugs. It is deliberately **not** wired into `commands.validate`; run it by
   hand when editing the bundle:

   ```bash
   node scripts/check-doc-anchors.mjs plugin/docs/c3/*.md plugin/agents/*.md
   ```

   The general form is worth carrying past links: **when a doc's provenance note
   makes absence meaningful, state what absence means.** Here it means the JSON
   shapes were checked — never that the prose is current, the links resolve, or
   the symbols exist.

[^claude-md]: CLAUDE.md, "Verify every `docs/c3` JSON shape against
`GenvidTechnologies/construct3-sample`".

## Related

- [Doc inventories and the changelog](/doc-inventories.md) — what else a `docs/c3` edit must touch.
- [The three knowledge boundaries](/knowledge-boundaries.md) — why a platform fact lives here at all.
- [Working with the code reviewer](/working-with-code-review.md) — a correct finding can carry a wrong remedy.
