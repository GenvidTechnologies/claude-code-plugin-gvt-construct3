# Changelog

All notable changes to the `genvid-c3` plugin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **`build-reference` now sources built-in ACE *shape* from the C3 editor CDN's
  `allAces.json`** instead of heuristic manual-PDF table parsing — shape (kebab `id`,
  `scriptName`/`expressionName`, params **with real types**, `kind`) is now
  deterministic with full coverage. The manual PDF is demoted to **descriptions +
  concept chunks**, joined onto the CDN shape via a two-tier name match (exact
  normalized, then token-subset, e.g. `IsAnimPlaying` ↔ "Is playing"). Adds two
  reusable scripts alongside `build-index.mjs`: `fetch-aces.mjs` (download
  `plugins/` + `behaviors/` `allAces.json` for an editor `--rev`, or `--input` a
  local file offline) and `merge.mjs` (join descriptions onto CDN shape with a
  plugin-name alias map + per-objectClass coverage report). `manualVersion` now
  records the editor revision + manual pull date (e.g. `r476-4+manual-2026-06-11`).
  Shape is authoritative for 100% of built-in ACEs; description-join coverage stays
  best-effort and is reported honestly. (Closes #24.)

## [1.4.0] - 2026-06-15

### Added
- **`build-reference` skill** (`/genvid-c3:build-reference`): produces
  construct3-chef's `c3-reference` cache (`<extractedDir>/c3-reference/index.json`)
  so `search-docs` can resolve **built-in plugin ACEs, layout/scripting docs, and
  the Expression language** — coverage that needs the cache (custom-addon ACEs
  already work live). Reads the version-pinned C3 manual PDF (the only
  machine-reachable source for built-ins; construct.net is Cloudflare-challenge-
  walled, so its URLs serve only as `canonicalUrl` anchors), extracts built-in ACE
  tables + concept prose, and writes a schema-valid cache via a bundled assembler
  (`scripts/build-index.mjs` + `scripts/lib/reference-index.mjs`, 21 unit tests).
  The bundled validator mirrors chef's `ReferenceIndexSchema` as a *preview*;
  chef's own `search-docs` is the authoritative check. The cache holds
  `source:"builtin"` ACEs + chunks **only** — chef reads `addons/*/aces.json` live
  and merges it, so caching addon ACEs would double-count them. Declares
  construct3-chef `minVersion 0.9.0` in `metadata.expects`. (Closes #13;
  construct3-chef#87.)
- `docs/c3/ace-reference.md`: new platform-reference doc for the ACE
  (action/condition/expression) metadata model — the `aces.json` structure for
  custom addons (category-keyed; params keyed by `id`; expressions use
  `expressionName`; `$schema` skipped) and why built-in/system plugins have no
  `aces.json` (C3 is a webapp — no install). The durable platform knowledge the
  `build-reference` skill relies on, documented once per the chef-owns-tooling /
  plugin-owns-platform split.
- `c3-explorer` and `c3-implementer` now document construct3-chef's **`search-docs`**
  MCP tool (new at `0.9.0`). It is `READ_ONLY` — looks up C3 ACE (action/condition/
  expression) reference (parameter names/types, expression syntax, condition/action
  ids). Custom-addon ACEs are always available (read from the project's `addons/`);
  built-in plugins, layouts, scripting, and the Expression language light up when the
  `c3-reference` cache is present. Added to `c3-explorer`'s `tools:` allow-list +
  "read & list" body, and to `c3-implementer`'s "Reading" list. (construct3-chef#87.)
- `c3-explorer` and `c3-implementer` now document construct3-chef's **user-defined
  ops** surface (new at `0.10.0`, construct3-chef#89). `list-ops` is `READ_ONLY` —
  lists the project's parameterized recipe-template ops (from the `ops/` dir) with
  their params; added to `c3-explorer`'s `tools:` allow-list + "read & list" body and
  `c3-implementer`'s "Reading" list. `apply-op` and the dynamically-registered
  `op-<name>` tools (one per op file, hot-reloaded) are `MUTATE` — documented as a
  class in `c3-implementer`'s mutation lists (the names are not fixed; enumerate via
  `list-ops`), and deliberately kept off `c3-explorer`'s read-only allow-list.
- **`create-c3-op` skill** (`/genvid-c3:create-c3-op`): authors and dry-run-validates
  a construct3-chef **user-defined op** — a parameterized recipe template (one JSON
  file in the ops dir whose filename is the op name). Elicits typed params (flagging
  the `required:false`-without-`default`, `default`/`type`-mismatch, and typed
  whole-value-vs-embedded-vs-object-key substitution pitfalls), places `{{PARAM}}`
  tokens, and writes the op-file shell on confirmation, then validates via chef's
  `list-ops` + `apply-op --dry-run` (the sole authoritative checks — no bundled
  helper script). Authors the op **wrapper only**; the recipe body defers to chef's
  `recipe-reference.md` + the `c3-implementer` agent, and the skill never runs a
  writing `apply-op`. Declares construct3-chef `minVersion 0.10.0` in
  `metadata.expects` (the feature floor — ops landed in #89). (Refs #21.)
- The README **and shipped `CONVENTIONS.md`** skill tables now list
  `author-navigation-patterns`, `build-reference`, and `create-c3-op` (both
  previously omitted `build-reference` and `create-c3-op`).

### Changed
- Bumped the pinned `construct3-chef` MCP server `0.8.0` → `0.9.0`. **Tool-surface
  reconciliation run** (`registerTool` diff, 29 → 30 tools): the only surface change
  is the added `search-docs` tool above — no tools were renamed or removed. The
  `construct3-chef` minimum-version floor in `CONVENTIONS.md` / `audit-c3-conventions`
  stays `≥ 0.4.0` — this is a pin bump, not a floor bump. Also swept the now-stale
  `@0.8.0` pinned-version strings in the `c3-explorer` / `c3-implementer` bodies and
  the `docs/c3/toolchain-config.md` example to `@0.9.0`.
- Bumped the pinned `construct3-chef` MCP server `0.9.0` → `0.10.1`. **Tool-surface
  reconciliation run**: the static `dist/mcp/server.js` `registerTool` surface is
  unchanged (30 tools), but chef `0.10.0` (construct3-chef#89) adds the
  user-defined-ops surface registered in `dist/mcp/opsRegistry.js` (the `list-ops` +
  dynamic `op-<name>` tools above) — a `server.js`-only grep diffs empty even though
  the surface grew, so `docs/tool-surface-reconciliation.md`'s count anchor now records
  where the ops tools live and their `READ_ONLY`/`MUTATE` split. No tools renamed or
  removed. The `construct3-chef` floor in `CONVENTIONS.md` / `audit-c3-conventions`
  stays `≥ 0.4.0` — pin bump, not a floor bump. Swept the now-stale `@0.9.0`
  pinned-version strings in the `c3-explorer` / `c3-implementer` bodies and the
  `docs/c3/toolchain-config.md` example to `@0.10.1`. (#21; supersedes #18.)

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
