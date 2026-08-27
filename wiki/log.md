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

## 2026-08-27

* **Migration**: `docs/` **retired entirely** into this bundle (#90), reaching the
  zero-`docs/` end state `construct3-chef` already occupies. 11 ADRs plus a new
  ADR 0012 moved to `wiki/decisions/`; `wiki-schema.md` to `wiki/wiki-schema.md`;
  `issue-triage.md` to `wiki/process/issue-triage.md`. `docs/TOC.md` was folded into
  `index.md` and deleted, along with `tool-surface-reconciliation.md` and
  `grounding-in-chef-behavior.md` whose content already lived here. Four
  `.gvt-agent.json` `paths` overrides plus `wiki/decisions/` in `hygiene.excludePaths`
  carry the contract; the audit holds at **exit 0, `required: 35 of 35`**.

* **Correction to the plan, caught by its own gate**: `tool-surface-reconciliation.md`
  was scheduled for a bare delete on the grounds that `pin-bump-verification.md` had
  absorbed it. The pre-delete gate found only 2 of its 9 count anchors had survived —
  the *historical series* (chef 36/34/30, `+list-ops` 37/35/31, dm 14/13) was absent,
  as were the pinned package names, the silent-zero warning and the burbank
  ground-truth cross-check. Worse, `pin-bump-verification.md` **pointed at the doomed
  file by path** as the place to refresh those totals. Deleting it would have destroyed
  the anchors and left a dangling instruction — the precise "breaks the one after"
  failure that passage exists to warn about. Migrated first, then deleted.

* **Correction, self-inflicted**: the `Expected audit residue` section added to
  `the-audit-contract.md` named the retired token literally while stating how many such
  citations exist — making itself the fifth and taking the audit from 4 to 5. It now
  describes them without naming the token. Caught within minutes by
  `scripts/audit-snapshot.mjs`, on that script's first real run.

* **Prose was swept by hand, not by regex.** A dry run of the mechanical sweep wanted to
  rewrite three statements that are *true about the past*: a note that an earlier sweep
  "skipped `docs/decisions/`" (it did — they were there then), a log entry recording
  which file a capture was taken from, and a rule naming a `docs/TOC.md` inventory list
  this migration deliberately dropped. Only dead links and `sources[].resource` URLs
  were automated.

* **Provenance for the three deleted sources is pinned, not dropped.** Their
  `sources[].resource` URLs now point at commit `9d77f5b` — the last commit where those
  files existed — rather than at `blob/main` (which would 404) or nowhere (which would
  erase provenance the content genuinely has).

* **Two predicted numbers were wrong and are recorded as findings rather than edited
  away**: broken-link came in at **75** against a predicted 57, and the scanned count at
  **18** against 17. Both grew from bundle-absolute links and an index this migration
  itself added; the residue table now carries the measured values. Acceptance criterion
  T13 was separately found **defective** — its `sed` frontmatter-stripper never worked —
  and was amended in the open on #90 after the underlying requirement was re-verified by
  other means and shown to hold.

## 2026-08-26

Bulk `ingest` of the whole dev-workspace `docs/` tree, **capture-first**: all 16
files under `docs/` (11 ADRs + 5 living docs) were first snapshotted byte-exact into
`raw/` as `*-2026-08-26.md`, then ingested from those immutable captures. Verified
byte-equal against their sources at capture time. `plugin/docs/c3/` was **excluded** —
it is a separate OKF bundle, hand-maintained against `construct3-sample`, and the
schema's two-bundles note forbids folding it in here.

* **Correction** (supersedes the capture-first framing in the entries below, which
  are left intact per this log's append-only rule): **the 16 `*-2026-08-26.md` captures
  were removed, and each page's `(id, id-upstream)` source pair collapsed to a single
  entry** keyed by the bare `id` — footnotes resolve against `sources[].id`, so the id
  had to survive — carrying the stable upstream URL as its `resource`. The captures
  were **unnecessary**: every one snapshotted a file already git-tracked in this repo,
  so git history already preserved what it said, and re-verification never needed a
  second on-disk copy. The justification given below ("the schema requires it")
  **overstated the contract**. `maintain-wiki`'s `SKILL.md` never mandates a `raw/`
  capture — its ingest step accepts a source named directly by the caller — and the
  two-entry rule it was read from (`wiki-schema.template.md`, copied into
  `docs/wiki-schema.md`) is worded *"write two entries **per capture**"*: it governs how
  a capture is cited, not whether a source must become one. Neither the skill, the
  template, nor OKF distinguishes an in-repo git-tracked source from an external one,
  so **no rule was violated in either direction** — the capture step was simply
  redundant work. `raw/claude-md-2026-08-18.md` was **kept**: it preserves CLAUDE.md's
  pre-migration text from before the 40 KB slim, which no longer exists in the working
  tree, so it is a genuine capture rather than a duplicate. No page content changed;
  the wiki pages authored below stand as written.

* **Creation**: `artifact-workspace-split.md` — from the ADR 0004 capture. The
  `plugin/` shipped-artifact vs. repo-root dev-workspace split, what each side owns,
  and why the subfolder layout *forced* the marketplace entry onto a `git-subdir`
  source with `path: "plugin"` (the two are one decision, not two). Carries **no
  `stale_after`**, per the schema's rule that a page restating a settled split changes
  only by a superseding ADR — the schema's decay policy names this page's topic
  explicitly. Records one **unresolved discrepancy** rather than papering over it: ADR
  0004 and this repo's `CLAUDE.md` both name the catalog
  `genvid-holdings/claude-code-marketplace`, while the installed `gvt-dev`
  `release-plugin` skill describes it as
  `GenvidTechnologies/claude-code-gvt-marketplace`. The page asserts the stable
  *mechanism* and tells the reader to resolve the repo name against the catalog before
  a `source.ref` bump.

* **Creation**: `grounding-in-chef-source.md` — from the
  `docs/grounding-in-chef-behavior.md` capture. The design-time motion (`npm pack` the
  pinned package, read `dist/`) as distinct from the maintenance motion in
  `pin-bump-verification.md`. Keeps the captured doc's three lessons — read the source
  not the README, ground the *ingestion path* not just the schema (chef's `aceLookup`
  concatenating live `aces.json` with the cache, no dedup), and "CLI-only" findings
  having a shelf life (`navigation-graph`, CLI-only through 0.7.0, promoted at 0.8.0).
  Two caveats are marked in-page as **workspace practice rather than claims from the
  capture**: pack into a fixed scratchpad instead of `mktemp -d`, and treat a silent
  zero as "the layout moved" rather than "the feature is absent".

* **Creation**: `issue-triage-conventions.md` — from the `docs/issue-triage.md`
  capture. The flat-label model, the deliberate absence of priority labels, `question`
  doubling as the needs-info signal, and the `blocked-upstream` lifecycle. It
  **deliberately does not restate the `gh` mutation recipes**: `/gvt-dev:triage-issues`
  executes those from the living doc, so a second copy would drift while looking
  authoritative. Closes with a workspace-practice note that a small, duplicate-free
  backlog is still worth triaging, since enrichment and staleness-detection are
  per-issue and do not shrink with backlog size.

* **Update**: `pin-bump-verification.md` — from the ADR 0007, ADR 0009 and
  `docs/tool-surface-reconciliation.md` captures. This closed the **sharpest gap found
  in the corpus**: the page cited ADR 0007 and told the reader to discharge the
  `resolveRootFolder` mirror obligation, but never stated what the two parts *were*,
  and said nothing about what to do when part 2 **fails** — which is ADR 0009's entire
  subject. Added: the two-part check (diff `dist/adapters/locations.js`; prove the
  `@genvidtech/mcp-utils` range cannot reach an unreviewed version), the ADR 0009
  escalation to a diff of `resolveRootFolder.js` **and its import closure**, the #74
  results table, and the **reviewed baseline `{0.5.1, 0.7.0}`** — state the check
  depends on, which "silently resets the check to its most expensive form" if it goes
  unwritten. Also added the rule that `c3-explorer`'s allow-list is **not** chef's
  `READ_ONLY` set (allow-list = annotated `READ_ONLY` − `validate-recipe` + `list-ops`
  + `generate-sids`, measured at chef 1.1.0), since reconciling them by set-equality
  silently widens a **haiku** agent's envelope; and the scope-rename split into
  functional / live-prose / historical-record categories. `stale_after` moved to
  **2027-02-26** (6 months) per the schema's rule for version-pinned content, and the
  index entry was refreshed because the `description` changed.

* **Provenance**: `knowledge-boundaries.md` — the ADR 0001 capture added as a source,
  and the existing ADR 0010 entry **repointed** from the living
  `../docs/decisions/0010-*.md` path to its immutable `../raw/` capture. Body
  unchanged: ADR 0001's operational test (a platform gotcha invisible to
  lint/typecheck belongs here; a recipe/tooling gotcha belongs to chef) was already
  present.

* **Provenance**: `the-audit-contract.md` — ADR 0002, 0005 and 0006 captures added as
  sources. Body unchanged; all three decisions were already reflected.

* **Provenance**: `agent-capability-envelopes.md` — ADR 0003 capture added as a source.

* **Provenance**: `verifying-against-construct3-sample.md` — ADR 0008 and 0011
  captures added as sources.

* **Provenance**: `doc-inventories.md` — the `docs/TOC.md` capture added as a source.
  `TOC.md` got **no page of its own**: it is an index, not durable insight, and a wiki
  page restating an index drifts on the next doc added. It lands here instead, as
  provenance for the page that already governs inventory drift.

* **Provenance**: `deferring-issues-upstream.md` — the `docs/issue-triage.md` capture
  added as a source, alongside a cross-link to the new triage page that owns the
  `blocked-upstream` label lifecycle.

* **Captured, no page**: `docs/wiki-schema.md` — snapshotted to
  `raw/docs-wiki-schema-2026-08-26.md` for provenance, but deliberately **not**
  authored into a `wiki/` page. It is the *normative schema governing this wiki*; a
  wiki page restating it would create a second, competing source of truth for the rules
  the wiki itself is maintained under, and the two could contradict with no tiebreak.
  It is already reachable from `wiki/index.md`. This is the one capture from this run
  that no page cites.

## 2026-08-21

* **Correction + Update**: `doc-inventories.md` — three facts from #70's
  session. **(1)** The "touches two *exhaustive* inventories" section
  undercounted: since #79 made `plugin/docs/c3/` an OKF bundle, each doc's own
  frontmatter `description:` is a *third* surface that drifts the same way as
  `plugin/docs/c3/index.md` and `docs/TOC.md` — #70 found and fixed all three
  gaps in `construct3-guide.md`, `typescript-integration.md`, and
  `layout-reference.md`. Heading and body renamed two → three; the adjacent
  "stales those descriptions" section updated to match the count. **(2)** New
  rule: the surfaces can contradict each other, not just individually go
  stale — #70 found `docs/TOC.md` naming `layout-reference.md`'s navigation
  content while `plugin/docs/c3/index.md` did not, with neither flagged.
  Reconcile each surface against the doc's own `##` headings, not against a
  sibling surface. **(3)** The retired-token callout's claim that `wiki/` "is
  not scanned at all" is now false: as of gvt-dev 4.19.0, `scanRetiredTokens`
  (only that scanner) unions in `wikiCandidateFiles(...)` and reaches
  `<wikiDir>/`, confirmed both by the installed `hygiene.mjs` and by a live
  `/gvt-dev:audit-conventions` run flagging this page's three deliberate
  `genvid-c3` citations at `info` severity — the fix for gvt-dev#366, which
  this page itself had filed. The citations themselves are untouched; only the
  claim about tooling behaviour was corrected.

## 2026-08-20

* **Update**: `verifying-against-construct3-sample.md` — two new traps, six and
  seven, from #76's retro. **Trap 6**: a destination doc's provenance note is part
  of the cost of moving a fact into it. The docs in this bundle do not all carry
  the same contract — `construct3-guide.md` carves out its runtime sections,
  `layout-reference.md` does not — so a fact correctly stated in one can become a
  false claim purely by relocation. #76's obvious fix (author the missing section
  in `layout-reference.md` and repoint the dead link at it) would have asserted
  sample verification of runtime input routing, which no on-disk project can
  observe. Recorded as [ADR 0011](/decisions/0011-a-docs-provenance-note-is-part-of-the-move-cost.md).
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
  never chef's *symbol*", recording [ADR 0010](/decisions/0010-linking-out-generically-instead-of-naming-chef-symbols.md).
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
