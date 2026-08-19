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
