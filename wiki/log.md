# Wiki Log

Record of every `ingest` run: what changed, why, and which `raw/` source
drove it, grouped under `## YYYY-MM-DD` date headings (ISO 8601) with the
**newest date group first**. Entries are prose bullets, e.g. `* **Update**:
…`, `* **Creation**: …`, `* **Deprecation**: …` — the leading bold word is a
convention, not a requirement.

**Add newest first, never edit or remove a prior entry.** "Newest first"
means a new entry (and, if today isn't already the top group, a new
`## YYYY-MM-DD` heading) is *prepended* above everything else — the
insertion point moves from the bottom to the top, but prepending never
touches a prior entry's text, so the append-only guarantee holds exactly as
before. If a past entry itself needs correcting, add a new entry that says
so; never edit or remove the old one in place. See `docs/wiki-schema.md` for
the full maintenance schema.

## 2026-08-20

* **Update**: `verifying-against-construct3-sample.md` — two new traps, six and
  seven, from #76's retro. **Trap 6**: a destination doc's provenance note is part
  of the cost of moving a fact into it. The docs in this bundle do not all carry
  the same contract — `construct3-guide.md` carves out its runtime sections,
  `layout-reference.md` does not — so a fact correctly stated in one can become a
  false claim purely by relocation. #76's obvious fix (author the missing section
  in `layout-reference.md` and repoint the dead link at it) would have asserted
  sample verification of runtime input routing, which no on-disk project can
  observe. Recorded as [ADR 0011](../docs/decisions/0011-a-docs-provenance-note-is-part-of-the-move-cost.md).
  **Trap 7**: the sweep cannot see broken navigation — trap 5's shape a second
  time. The dead anchor `layout-reference.md#modal-layer-management-toggleinteractivelayers`
  shipped in `41c1816` and, per git history, its target heading has never existed
  in any revision; it was broken on arrival, not rotted. It survived #59, #63,
  #71, #72, #79 and #80, and — exactly as with the `generateUniqueSid` passage —
  both verification sweeps were **right** to pass it, because they check JSON
  shapes. Heading renamed five → seven traps, with its three referrers repointed
  in the same commit (`CLAUDE.md`, `wiki/index.md`, the page's own `description`).
  The description's claim that the traps "each shipped a wrong doc" was also
  corrected: trap 6 was caught one decision before shipping.

* **Update**: `doc-inventories.md` — two additions, both from #76. A subsection
  under the absence-criterion rule recording that **fixing one absence row
  manufactures confidence in the rest**: #76's criteria table scoped its
  `toggleInteractiveLayers` row correctly *and* gave it a positive control, then
  four rows later wrote the retired-anchor row tree-wide — the same defect the row
  above existed to prevent, in the same table, past planning review. Also notes
  that this variant surfaces late: that row's baseline was accurate when written,
  and only the plan's *own* CHANGELOG task falsified it, so no pre-execution gate
  can catch it. And a new section documenting `scripts/check-doc-anchors.mjs` —
  what it covers that the three referrer greps do not, and that it is deliberately
  not wired into `commands.validate`. Both stale the page's inventory description,
  which was updated in the same commit per the page's own rule.

## 2026-08-19

* **Update**: `knowledge-boundaries.md` — new section "Name chef's *capability*,
  never chef's *symbol*", recording [ADR 0010](../docs/decisions/0010-linking-out-generically-instead-of-naming-chef-symbols.md).
  The table said which repo owns a fact but never how a `docs/c3` doc should
  *refer* to the toolchain, and the founding import answered that by naming chef's
  internals. Driven by #69, which found `construct3-guide.md` instructing agents to
  call `generateUniqueSid()` and `initSidContext(path)` — both removed from chef
  when the SID singleton was retired. Records that naming the *correct* current
  symbol was considered and rejected, since the property that matters is whether a
  name can go wrong undetected, not whether it is right today.

* **Update**: `deferring-issues-upstream.md` — new opening section "First, check
  whether chef's docs already cover it". The page was written entirely around the
  under-filing failure (#32); #69 hit the opposite one, reasoning from "no chef
  *issue* covers this" to "chef's *docs* don't" — two different questions, and
  triage answers only the first. Eight of nine sites turned out to be already
  documented by chef; one needed filing (chef#196). Default is delete-and-link;
  filing is the exception.

* **Update**: `verifying-against-construct3-sample.md` — a **fifth trap**: a
  *toolchain* claim has no ground truth in this repo at all, and ADR 0008's
  marker-absence convention will imply it was checked anyway. The
  `generateUniqueSid` passage survived both #63's sweep and #71's follow-up, and
  both were right to pass it — they check C3 JSON shapes, and a chef symbol is not
  one. Heading renamed four → five traps, with its three referrers repointed in the
  same commit (`CLAUDE.md`, `wiki/index.md`, the page's own `description`).

* **Correction**: `doc-inventories.md` — the retired-token callout claimed the
  hygiene scan flags this page on every run. It does not: the scanners enumerate
  `docs/**.md` + repo-root `CLAUDE.md` only, so moving the rule into `wiki/`
  silenced the very finding it was engineered to keep alive. Text corrected to
  describe reality, and the general lesson (ask what tooling stops seeing a doc
  when it moves) recorded beside the deep-link rule. Filed upstream as
  gvt-dev#366.

## 2026-08-18

* **Update**: `doc-inventories.md` — the deep-link rule now requires three
  greps (anchor, bare-file, prose), not just the anchor grep. Driven by a defect
  in this session's own migration: the anchor grep returned clean while two
  bare-file/prose referrers went stale. A bare-file link still *resolves*, so no
  link checker flags it.

* **Creation**: `knowledge-boundaries.md`, `the-audit-contract.md`,
  `agent-capability-envelopes.md`, `verifying-against-construct3-sample.md`,
  `pin-bump-verification.md`, `doc-inventories.md`,
  `skill-authoring-conventions.md`, `working-with-code-review.md` — the initial
  migration of `CLAUDE.md`'s accumulated rule-bullets into the wiki tier, driven
  by `raw/claude-md-2026-08-18.md`. `CLAUDE.md` was slimmed to repo facts,
  commands, and a pointer index in the same pass; no rule was dropped, and the
  pre-migration text is preserved verbatim in the capture.
