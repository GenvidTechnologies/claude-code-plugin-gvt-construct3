# Changelog

All notable changes to the `genvid-c3` plugin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-06-11

### Added
- `c3-explorer` and `c3-implementer` now document c3-domain-manager's
  **`validate-editor`** MCP tool (new at `0.4.0`). It is `READ_ONLY` — an
  editor-strictness diagnostic that re-walks `eventSheets/` fresh (never the
  cached domain index) and reports what the C3 editor would reject. Added to
  `c3-explorer`'s `tools:` allow-list + "read & report" body (next to
  `validate-boundaries`), and to `c3-implementer`'s "Domain-config maintenance"
  section as a post-mutation editor-strictness check complementing
  `validate-project`. (c3-domain-manager#13, adopts `@genvid/c3source` 1.4.0
  `validateForEditor`.)
- `c3-explorer` can now call chef's **`navigation-graph`** MCP tool (added to its
  `tools:` allow-list and "MCP Tools Available" body list). It renders the layout
  navigation graph (every `System.go-to-layout` / configured nav call in the
  extracted DSL) as a `from sheet → target layout → line` table, or a PlantUML
  diagram via `format: "plantuml"`. The tool is `READ_ONLY`, so it belongs on the
  read-only explorer; it is not part of the recipe-mutation flow, so it is not
  added to `c3-implementer`. (`navigation-graph` was CLI-only at `0.7.0`;
  construct3-chef#85 exposes it as an MCP tool at `0.8.0`.)

### Changed
- Bumped the pinned `c3-domain-manager` MCP server `0.3.0` → `0.4.0`.
  **Tool-surface reconciliation run** (`registerTool` diff, 12 → 13 tools): the
  only surface change is the added `validate-editor` tool above — no tools were
  renamed or removed. The enriched cross-domain dependency graph
  (`domain-health` / `validate-boundaries` / `context-map` now also account for
  event-variable references, not just `include` edges — c3-domain-manager#14) is
  richer output with the same one-line tool purposes, so the agent descriptions
  are unchanged. The `c3-domain-manager` minimum-version floor in
  `CONVENTIONS.md` / `audit-c3-conventions` is unaffected — this is a pin bump,
  not a floor bump. Also swept the now-stale `@0.3.0` pinned-version strings in
  the `c3-explorer` / `c3-implementer` bodies and the
  `docs/c3/toolchain-config.md` example to `@0.4.0`.
- Bumped the pinned `construct3-chef` MCP server `0.7.0` → `0.8.0`. **Tool-surface
  reconciliation run** (`registerTool` diff, 28 → 29 tools): the only surface
  change is the added `navigation-graph` tool above — no tools were renamed or
  removed. The other `0.8.0` changes are runtime/behavioral and need no agent
  edits: single-block tool responses (`txId` folded into the success block,
  errors as a single `Error:` block — construct3-chef#80), `list-event-sheets` /
  `list-layouts` pagination (#82), and `validateForEditor` editor-strictness
  validation (#86). The `construct3-chef` minimum-version floor in
  `CONVENTIONS.md` / `audit-c3-conventions` stays `≥ 0.4.0` — this is a pin bump,
  not a floor bump.
- Corrected stale pinned-version strings in the agent/doc prose that still read
  `@0.6.0` after the `0.7.0` bump: `c3-explorer` and `c3-implementer` bodies and
  the `docs/c3/toolchain-config.md` example now read `@0.8.0`.

## [1.2.0] - 2026-06-05

### Added
- `author-navigation-patterns` skill (`/genvid-c3:author-navigation-patterns`):
  helps a user author and validate a construct3-chef `navigation.targetPatterns`
  / `definitionMarkers` convention for a project that routes navigation through a
  wrapper function. Inspects the extracted DSL, proposes a one-capture-group
  regex, previews captures/skips with a bundled helper, and validates against
  `construct3-chef navigation-graph`. Declares `construct3-chef` `minVersion
  0.7.0` in its `metadata.expects` (the config surface landed there), so
  `audit-c3-conventions` reports the requirement with no audit-script change.
- `docs/c3/layout-reference.md` now documents how navigation renders in the
  extracted DSL (built-in `System.go-to-layout` forms, wrapper call sites, and
  the call-site-vs-definition-line distinction) — the platform knowledge the new
  skill links to.

### Changed
- Bumped the pinned `construct3-chef` MCP server `0.6.0` → `0.7.0` (adds the
  configurable `navigation.targetPatterns` / `definitionMarkers` convention,
  construct3-chef#43). The MCP tool surface is **unchanged** between the two
  versions (verified via `registerTool` diff), so the `c3-explorer` /
  `c3-implementer` allow-lists need no edits. The `construct3-chef`
  minimum-version floor in `CONVENTIONS.md` / `audit-c3-conventions` stays
  `≥ 0.4.0` — this is a pin bump, not a floor bump.
- `c3-explorer` now enumerates the **full read-only tool surface** of both
  pinned servers (`construct3-chef@0.7.0`, `c3-domain-manager@0.3.0`) in its
  `tools:` allow-list and body. Newly available reads: chef
  `read-event-sids`, `read-sid-registry`, `resolve-anchor`,
  `list-global-layers`, `get-state`, plus the non-mutating helpers
  `validate-project` / `generate-sids`; and c3-domain-manager
  `glossary-check`, `validate-boundaries`, `domain-health`, `context-map`.
  Because the agent's `tools:` is a hard allow-list, these reads were
  previously uncallable (issue #4).
- `c3-implementer` documents the construct3-chef template/layer mutation
  recipes added at `@0.6.0` (`extract-template`, `templatize-in-place`,
  `clone-replica-to-layouts`, `replace-instance-with-replica`,
  `remove-layer`, `generate-sids`) and the mutation-flow reads
  `read-event-sids` / `read-sid-registry` / `resolve-anchor` /
  `validate-project`. Adds a "Domain-config maintenance" section covering
  c3-domain-manager's `set-overrides` / `remove-overrides` / `regenerate`,
  flagging that domain *content* is project-specific (issue #4).

## [1.1.0] - 2026-06-04

### Added
- `docs/c3/toolchain-config.md`: new reference doc explaining how
  `construct3-chef` and `c3-domain-manager` resolve configuration from the
  workspace root (the cwd model), the `extracted/` coupling between the two
  servers, and the non-root-project limitation.
- `audit-c3-conventions` now requires `domain-config.json` at the workspace
  root. `c3-domain-manager` resolves this file from cwd with no `--config`
  arg, so consumers satisfy the check by placing it at the repo root. The
  `evaluateFile` and `evaluateConfig` audit helpers are now exported and
  covered by unit tests.
- The plugin's MCP server launch args are intentionally left as bare `server`
  (no `--project-dir` / `--config` / `--extracted`): both servers resolve
  their config from the Claude-Code-provided workspace cwd, so consumers
  configure per-repo by dropping config files at the root rather than the
  plugin hardcoding paths. Monorepo non-root-subdir support requires upstream
  env-var support in both servers (tracked separately).

### Changed
- The shipped plugin now lives in the repo's `plugin/` subfolder, separate from the
  dev workspace at the repo root. The marketplace entry uses a `git-subdir` source
  (`path: "plugin"`). Consumers are unaffected — `${CLAUDE_PLUGIN_ROOT}` still resolves
  to the installed plugin subtree.
- MCP servers are now declared in `plugin.json` (`mcpServers`) instead of a bundled
  `.mcp.json`, using the **scoped** package names `@genvid/construct3-chef@0.6.0` and
  `@genvid/c3-domain-manager@0.3.0`, pinned and launched via `npx -y … server`.

### Fixed
- `audit-c3-conventions` reachability probe now resolves servers by their scoped
  package name (`npx -y @genvid/construct3-chef --version`) instead of the bare bin
  name, which npx treated as a package name and 404'd.

## [1.0.0]

### Added
- Initial release: `c3-explorer` and `c3-implementer` agents, the
  `audit-c3-conventions` skill, the C3 platform reference (`docs/c3/`), and the
  bundled `construct3-chef` / `c3-domain-manager` MCP servers.
