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
