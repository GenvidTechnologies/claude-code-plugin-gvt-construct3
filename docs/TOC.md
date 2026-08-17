# Documentation Map

Index of the docs in this repo. genvid plugin agents and skills consult this to discover where project knowledge lives.

## Project overview

- [README.md](../README.md) — what the `gvt-construct3` plugin provides, install steps, the agent/skill inventory, and knowledge boundaries.
- [CLAUDE.md](../CLAUDE.md) — guidance for Claude Code working in this repo: commands, architecture, and the three knowledge boundaries.
- [plugin/CONVENTIONS.md](../plugin/CONVENTIONS.md) — the gvt-construct3 plugin's own convention contract (what a *consuming* repo must provide). Distinct from gvt-dev's conventions.

## Process

- [docs/issue-triage.md](issue-triage.md) — issue triage conventions (flat label set, required fields, upstream-deferral / `blocked-upstream` policy, mutation recipes) consumed by `/gvt-dev:triage-issues`.

## Maintainer procedures (dev workspace, not shipped)

- [docs/tool-surface-reconciliation.md](tool-surface-reconciliation.md) — C3-specific reconciliation anchors (agent allow-lists, package names, surface counts) + burbank cross-check; defers the procedure to the `/gvt-dev:reconcile-mcp-pin` skill. Run on every chef/dm pin bump.
- [docs/grounding-in-chef-behavior.md](grounding-in-chef-behavior.md) — how to ground new gvt-construct3 skills/platform-docs in chef's actual source via `npm pack` (vs. inferring from memory/READMEs).

## Decision Records

Architecture and compromise decisions for the dev workspace and plugin design. See the ADR for full rationale; the issue linked in each record carries the original context.

- [docs/decisions/0001-three-knowledge-boundaries.md](decisions/0001-three-knowledge-boundaries.md) — C3 platform reference (here) vs. tooling reference (chef's docs) vs. project facts (consuming repo): the three homes for C3 knowledge. *(backfilled, decided 2026-06-02)*
- [docs/decisions/0002-data-driven-audit-contract.md](decisions/0002-data-driven-audit-contract.md) — The audit contract is data-driven (`metadata.expects`, "add an entry, don't hard-code"); the frontmatter parser is minimal and hand-rolled, not a YAML lib. *(backfilled, decided 2026-06-02)*
- [docs/decisions/0003-two-agent-capability-split.md](decisions/0003-two-agent-capability-split.md) — `c3-explorer` (haiku, read-only, hard `tools:` allow-list) vs. `c3-implementer` (opus, mutations); the allow-list is a functional constraint, not docs. *(backfilled, decided 2026-06-02)*
- [docs/decisions/0004-plugin-subfolder-split-and-git-subdir.md](decisions/0004-plugin-subfolder-split-and-git-subdir.md) — `plugin/` shipped-artifact vs. repo-root dev-workspace split, and the `git-subdir` marketplace source it forced. *(backfilled, decided 2026-06-04)*
- [docs/decisions/0005-non-rooted-c3-project-support.md](decisions/0005-non-rooted-c3-project-support.md) — Why `plugin.json` stays bare (no `--project-dir`); why `metadata.expects.files` gains a per-entry `base: project|repo` field for project-root vs. repo-root resolution. (#26)
- [docs/decisions/0006-detect-discovery-ambiguity.md](decisions/0006-detect-discovery-ambiguity.md) — A second bespoke audit check mirrors `resolveRootFolder`'s ambiguous-root discovery and reports it as a new advisory `warning` severity (exit code unchanged). (#47)
- [docs/decisions/0007-verifying-the-resolverootfolder-mirror.md](decisions/0007-verifying-the-resolverootfolder-mirror.md) — How to discharge the ADR 0006 mirror obligation on a `c3-domain-manager` bump: diff the adapter *and* prove the `@genvidtech/mcp-utils` range can't move, rather than trusting release notes. (#60)
- [docs/decisions/0008-recording-verification-provenance-in-docs-c3.md](decisions/0008-recording-verification-provenance-in-docs-c3.md) — `docs/c3` docs declare their verification provenance so an *unmarked* section means "checked"; shipped docs cite the `construct3-sample` tag, never `path:line`, which drifts silently on a re-tag. (#63)
- [docs/decisions/0009-discharging-the-mirror-check-when-the-range-moves.md](decisions/0009-discharging-the-mirror-check-when-the-range-moves.md) — What to do when ADR 0007's part 2 fails: diff `resolveRootFolder.js` *and its import closure* between the reviewed and newly-resolvable `@genvidtech/mcp-utils` versions, and record the reviewed baseline. (#74)

## C3 platform reference (`plugin/docs/c3/`)

The canonical reference for how Construct 3 itself behaves — owned by this plugin and shipped in the `plugin/` subtree.

Each doc swept in [#63](https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/issues/63) carries a **verification provenance** note naming its ground truth (`construct3-sample@v0.4.0`) plus per-section *unverified* callouts; in those docs an unmarked section was confirmed against the sample or corrected to match it. `grep -rn construct3-sample plugin/docs/c3/` lists the whole inventory.

- [plugin/docs/c3/README.md](../plugin/docs/c3/README.md) — overview of the platform reference and why it lives here.
- [plugin/docs/c3/construct3-guide.md](../plugin/docs/c3/construct3-guide.md) — Construct 3 platform behavior; the *why* behind the platform gotchas.
- [plugin/docs/c3/event-sheet-architecture.md](../plugin/docs/c3/event-sheet-architecture.md) — event sheet JSON structure, the five event/action types, include composition, trigger ordering, and how behaviors attach (`behaviorTypes[]`) and event-sheet ACEs target a behavior instance.
- [plugin/docs/c3/layout-reference.md](../plugin/docs/c3/layout-reference.md) — layout/layer JSON, render order, the template/replica system and the two unrelated `"o"` short keys (scene-graph transform-opacity vs. template sync), global layers and the passive `overriden` shadowing mechanism, effect declaration and application, the `subLayers` key and the `subLayers()`/`allSubLayers()` runtime API, UID/SID constraints, and how navigation renders in the extracted DSL (the `navigation.targetPatterns` convention).
- [plugin/docs/c3/ace-reference.md](../plugin/docs/c3/ace-reference.md) — the ACE (action/condition/expression) metadata model: the `aces.json` structure for custom addons (category-keyed; params by `id`; expressions by `expressionName`) and why built-in plugins have no `aces.json`.
- [plugin/docs/c3/addon-package-reference.md](../plugin/docs/c3/addon-package-reference.md) — addon package layout, where properties are declared (editor ROOT `plugin.js`), and the `lang/*.json` localization structure; companion to `ace-reference.md`.
- [plugin/docs/c3/scripting-reference.md](../plugin/docs/c3/scripting-reference.md) — Construct 3 scripting API quick reference (`IRuntime`, system expressions, iteration conditions).
- [plugin/docs/c3/typescript-integration.md](../plugin/docs/c3/typescript-integration.md) — C3 TypeScript scripting: runtime access, async/concurrency model, local-variable scoping.
- [plugin/docs/c3/toolchain-config.md](../plugin/docs/c3/toolchain-config.md) — how the C3 toolchain (construct3-chef + c3-domain-manager) is wired into a repo: config-file locations, the `extracted/` coupling, and the cwd-resolution model.
