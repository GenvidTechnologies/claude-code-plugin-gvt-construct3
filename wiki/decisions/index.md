# Decision records

Architecture and compromise decisions for the dev workspace and plugin design. See the
ADR for full rationale; the issue linked in each record carries the original context.

These are **historical records** — sweep the living docs, never the ADRs. A decision that
is genuinely reversed earns a superseding record rather than an edit in place.

Each row below mirrors its record's frontmatter `description` **verbatim**. When a later
record amends an earlier one, the annotation is **appended after** the mirrored text, never
spliced into it — editing the mirrored span would make this index misquote the record it
points at, and correcting it "properly" would mean editing an ADR in place. Neither is
available, so the amendment goes outside the quote.

> New records are **not** indexed automatically. Every `gvt-dev` self-indexer writes to a
> hard-coded `docs/TOC.md` and skips silently when it is absent, and the audit's orphan
> scan is inert against an `index.md`-named index — so nothing will tell you a row is
> missing here. Add it by hand.

* [0001. Three Knowledge Boundaries for C3 Knowledge](0001-three-knowledge-boundaries.md) - C3 platform reference (here) vs. tooling reference (chef's docs) vs. project facts (consuming repo): the three homes for C3 knowledge.
* [0002. Data-Driven Audit Contract + Minimal Frontmatter Parser](0002-data-driven-audit-contract.md) - The audit contract is data-driven (`metadata.expects`, "add an entry, don't hard-code"); the frontmatter parser is minimal and hand-rolled, not a YAML lib.
* [0003. Two-Agent Capability Split (Read-Only Explorer vs. Mutating Implementer)](0003-two-agent-capability-split.md) - `c3-explorer` (haiku, read-only, hard `tools:` allow-list) vs. `c3-implementer` (opus, mutations); the allow-list is a functional constraint, not docs.
* [0004. `plugin/` Artifact-vs-Workspace Split + `git-subdir` Marketplace Source](0004-plugin-subfolder-split-and-git-subdir.md) - `plugin/` shipped-artifact vs. repo-root dev-workspace split, and the `git-subdir` marketplace source it forced.
* [0005. Non-Rooted C3 Project Support](0005-non-rooted-c3-project-support.md) - Why `plugin.json` stays bare (no `--project-dir`); why `metadata.expects.files` gains a per-entry `base: project|repo` field for project-root vs. repo-root resolution.
* [0006. Detect `project.c3proj` Discovery Ambiguity in the Audit](0006-detect-discovery-ambiguity.md) - A second bespoke audit check mirrors `resolveRootFolder`'s ambiguous-root discovery and reports it as a new advisory `warning` severity (exit code unchanged).
* [0007. Verify the `resolveRootFolder` Mirror by Package Diff, Not Inspection](0007-verifying-the-resolverootfolder-mirror.md) - How to discharge the ADR 0006 mirror obligation on a `c3-domain-manager` bump: diff the adapter *and* prove the `@genvidtech/mcp-utils` range can't move, rather than trusting release notes.
* [0008. Record Verification Provenance in `docs/c3`, and Cite the Sample Tag — Never `path:line`](0008-recording-verification-provenance-in-docs-c3.md) - `docs/c3` docs declare their verification provenance so an *unmarked* section means "checked"; shipped docs cite the `construct3-sample` tag, never `path:line`, which drifts silently on a re-tag.
* [0009. Discharging the `resolveRootFolder` Mirror Check When the Range Actually Moves](0009-discharging-the-mirror-check-when-the-range-moves.md) - What to do when ADR 0007's part 2 fails: diff `resolveRootFolder.js` *and its import closure* between the reviewed and newly-resolvable `@genvidtech/mcp-utils` versions, and record the reviewed baseline.
* [0010. `docs/c3` Links Out to chef Generically and Never Names chef's Internal Symbols](0010-linking-out-generically-instead-of-naming-chef-symbols.md) - `docs/c3` refers to construct3-chef by *capability* and links to `construct3-chef://docs`; it never names chef's functions, modules, or MCP tools — not even correct ones, since a correct name can rot into confident wrongness undetected. **(Link form amended by [0013](0013-addressing-the-chef-docs-resource-by-server-and-uri.md) — the capability-not-symbol rule is unchanged.)**
* [0011. A `docs/c3` Doc's Provenance Note Is Part of the Cost of Moving a Fact Into It](0011-a-docs-provenance-note-is-part-of-the-move-cost.md) - A fact isn't relocated between `docs/c3` docs on topical fit alone; the target document's ADR 0008 provenance note (does it carve out runtime behaviour, or assert blanket sample verification?) is part of the move's cost.
* [0012. Retire `docs/` into the `wiki/` Bundle, Accepting the Audit-Tooling Residue](0012-retiring-docs-into-the-wiki-bundle.md) - `docs/` is retired into the `wiki/` bundle behind four `paths` overrides; the audit residue that no override can reach is accepted and named site by site rather than counted.
* [0013. Address the chef Docs Resource by Server and `docs:///` URI](0013-addressing-the-chef-docs-resource-by-server-and-uri.md) - A doc or agent body names chef's documentation resource as the pair (`construct3-chef` server, `docs:///<path>` URI) — never the malformed `construct3-chef://docs`, and never the `@server:protocol://resource` mention form, which only resolves in human-typed input.
* [0014. Mirrored Helper Tests Stay Byte-Identical; Local Additions Go in a Sibling File](0014-mirrored-tests-stay-byte-identical.md) - Test files mirrored from gvt-dev are copied verbatim and never appended to; coverage the mirror leaves open is closed in a separately-named sibling, so the mirror stays diffable against upstream. **(Rule that follows: a defect in mirrored code is filed upstream rather than patched locally.)**

* [0015. Discharging the `resolveRootFolder` Mirror When the Closure Diff Is *Not* Byte-Identical](0015-discharging-the-mirror-when-the-closure-diff-is-not-identical.md) - When ADR 0009's closure diff comes back dirty, decompose it into the discovery walk, the filtering policy, the narrowing wrapper and the closure boundary, and discharge on semantic equivalence of the mirrored surface; byte-identity is demoted from the pass condition to a fast path.

* [0016. The Residue Table Carries Invariants; Concrete Figures Live in One Dated Measurement](0016-residue-table-carries-invariants-not-figures.md) - The expected-audit-residue table states invariants and derivations rather than fixed counts; the one concrete measurement lives in a single dated worked example, so a re-measure updates one site instead of three.

* [0017. A Frontmatter `description` That Contradicts Its Own Body Is a Defect, Not a Reversal](0017-frontmatter-description-defect-not-reversal.md) - An index row misquoting its record is repaired on whichever side is wrong; when a record's own frontmatter description contradicts the body it summarizes, that is a metadata defect correctable in place, not a decision reversal earning a superseding record — and the licence extends to misstatement only, never to style.

* [0018. Hold the Version Floor Through a Purely-Additive Major Upstream Bump](0018-hold-the-floor-through-a-purely-additive-major-bump.md) - When a major upstream bump adds capability without removing, renaming, or repathing anything a pinned skill or agent depends on, the consumer floor stays at the pre-bump version rather than moving because semver crossed a major boundary.

* [0019. The npm Surface Ships in `plugin/` Only, and the Audit Stays Out of `commands.validate`](0019-npm-surface-shape-and-audit-stays-out-of-validate.md) - The manifest and committed lockfile live in plugin/ with an empty dependency set, whose CI gate is live while its host-install half stays armed and unfired; and audit-c3-conventions is deliberately not wired into commands.validate, because its target is the working directory and this repo can never be a valid target.

* [0020. Test-Count Floors Are Calibrated Exact-Current, and the File-Count Floor Becomes a Declared Inventory](0020-declared-inventory-derives-the-file-count-floor.md) - Both suites' test-count floors are calibrated exact-current rather than carrying slack, one rule for both; the file-count floor is retired as a hand-written literal and derived from a declared per-suite `expect` inventory whose length is the floor, and a present-but-undeclared file is reported as a non-fatal advisory rather than failing the run.
* [0021. The MCP Check Reads the Plugin's Own Pin and Probes the Pinned Spec from a Sealed Directory](0021-mcp-check-reads-the-plugin-pin-and-probes-sealed.md) - The audit's MCP expectation takes the server version from the plugin's own `plugin.json` pin instead of the consuming repo's `node_modules`, and probes reachability by running the exact pinned spec from a fresh temp directory holding an empty `package.json`, so neither the invoking directory nor its ancestors can change the verdict.

See the [wiki index](../index.md) for the rest of the bundle.
