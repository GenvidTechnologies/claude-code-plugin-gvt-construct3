# Changelog

All notable changes to the `genvid-c3` plugin are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
