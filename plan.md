# Plan: Manage Server Configuration Options for construct3-chef and c3-domain-manager

## Branch
`feat/manage-server-config-options`

## Summary
Expose `domain-config.json` as an audited requirement in the plugin contract, make
`evaluateFile`/`evaluateConfig` importable for testing, add corresponding tests,
document the cross-tool config wiring in `docs/c3/`, and record the deliberate
bare-`server` MCP launch decision in the CHANGELOG. No `plugin.json` launch-arg
change; no agent edits; versions stay pinned (chef 0.6.0, domain-manager 0.3.0).

## Context (settled decisions)
- **Q1**: `domain-config.json` is required (always was); the *new* thing is its
  location is configurable via `--config`. The plugin launches the server with no
  `--config`, so the default `<root>/domain-config.json` is in effect → audit checks
  the default location as a required `files` expectation.
- **Q3**: `plugin.json` passes bare `server`; Claude Code launches plugin MCP servers
  with cwd = workspace root, so both servers resolve config from cwd. Burbank
  (genvid-holdings/burbank) proves this. *Not* hardcoding paths is what preserves
  per-repo configurability. The CLI-only flags get upstream feature-request drafts.
- **Q4**: `domain-config.json` content is project-specific DDD domains → the plugin
  docs document only that the files exist + are configurable + the `extracted/`
  coupling, never the schema.
- **Q5**: document the `extracted/` coupling; do not auto-validate it (the audit's
  evaluators are presence-only, can't compare a JSON value against a CLI flag).
- Test seam = export helpers + run-guard. chef config = omit from audit.
  CONVENTIONS.md = unchanged (audit is the single source of truth).

## Ground truth
- construct3-chef: optional `construct3-chef.config.json` at project root; field
  `extractedDir` (default `extracted/`). CLI-only `--project-dir` (default cwd). No env.
- c3-domain-manager: required `domain-config.json` at project root. CLI-only
  `--config`/`--extracted` (default cwd / `extracted/`; `none` = ephemeral). No env.
- `extracted/` coupling: chef writes its read-surface to `extractedDir`;
  domain-manager writes `extracted/domain-index/` to `--extracted`. Defaults agree.
- Burbank: `project.c3proj` + `domain-config.json` + `extracted/` all at repo root;
  no `construct3-chef.config.json`; launches both via the plugin with bare `server`.

## Validation command (from .genvid-agent.json)
```
cd plugin && claude plugin validate . && node --test skills/audit-c3-conventions/scripts/test/*.test.mjs
```
Run after the P-step and after each F-step.

---

## Tasks

### Task 1 (P) — Make `evaluateFile`/`evaluateConfig` exportable and audit.mjs safely importable
Agent: `genvid-dev:ts-implementer`. Behavior-preserving refactor of
`plugin/skills/audit-c3-conventions/scripts/audit.mjs`:
1. Add optional `repoRoot = REPO_ROOT` param to `evaluateFile`/`evaluateConfig`;
   use it in place of the hardcoded `REPO_ROOT` join inside each body.
2. `export` both functions.
3. Import `pathToFileURL` from `node:url`; replace the bare top-level `main().catch(...)`
   with `if (import.meta.url === pathToFileURL(process.argv[1]).href) { main().catch(...) }`.

`main()` keeps calling the evaluators with no third arg (default → `REPO_ROOT`), so the
CLI path is unchanged.

Validation: full command; all existing tests pass; importing audit.mjs has no side effects.
Commit: `refactor: export evaluateFile/evaluateConfig and guard main() in audit.mjs`

### Task 2 (F) — Add `domain-config.json` file expectation + evaluator tests
Agent: `genvid-dev:ts-implementer`.
- **SKILL.md**: under `metadata.expects`, add a `files:` array (after `tools:`, before
  `mcp:`) with one entry: `path: domain-config.json`, no `required:` key (defaults true →
  error), one-line `reason`. No chef-config entry.
- **audit.test.mjs**: `import { evaluateFile, evaluateConfig } from '../audit.mjs'`; add
  tests using a tmp fixture dir: file present→ok; required-missing→error (detail lacks
  "(optional)"); optional-missing ({required:false})→info (detail has "(optional)");
  config key-present in custom `in:` target→ok; missing-key→error (detail includes
  "path broke at"); `in:` file absent→error/"not found"; import-side-effect guard assertion.

Validation: full command; all tests pass.
Commit: `feat: add domain-config.json file expectation to audit contract + evaluator tests`

### Task 3 (F) — New doc `toolchain-config.md` + README row & carve-out
Agent: `genvid-dev:ts-implementer`.
- **New `plugin/docs/c3/toolchain-config.md`** covering only: (a) the two config files
  exist + are configurable; (b) why bare `server` works (cwd = workspace root); (c) the
  `extracted/` coupling (defaults agree; divergence → domain-manager indexes a tree chef
  never populated); (d) non-root project limitation + links out to `construct3-chef://docs`
  cli.md and domain-manager `domain-architecture.md`. MUST NOT restate the domain schema.
- **`plugin/docs/c3/README.md`**: add one table row for `toolchain-config.md`; add a
  one-line scope carve-out after the intro (this doc covers cross-tool toolchain wiring
  that neither tool's own docs own; field reference stays in each tool's docs).

Validation: full command (no regressions; doc is prose).
Commit: `docs: add toolchain-config.md for cross-tool config wiring + README entry`

### Task 4 (F) — CHANGELOG entry
Agent: `genvid-dev:ts-implementer`. In `plugin/CHANGELOG.md` `[Unreleased]`, add an
`### Added` sub-heading (before `### Changed`): the new doc; the audit requirement +
exported/tested helpers; and a prose note that MCP launch args are intentionally bare
`server` (servers resolve config from workspace cwd; consumers configure per-repo by
dropping config files at the root; non-root subdir support needs upstream env-var support,
tracked separately). Keep Keep-a-Changelog style (no `### Notes` heading).

Validation: full command.
Commit: `docs: record domain-config requirement and bare-server decision in CHANGELOG`

---

## Final gate
Run the full validate command. Expected: `claude plugin validate .` exits 0; all tests
(existing + new) pass; no `main()` side-effect on import.

## Risks
- Run-guard refactor must not change CLI behavior → default `repoRoot` param keeps
  `main()`'s call sites unchanged; validate immediately after Task 1.
- Required `domain-config.json` fires on chef-only repos → accepted (plugin bundles both
  servers); the `reason` string explains it.
- Single-line `reason` constraint → the frontmatter parser has no multiline scalars.
- Non-root cwd assumption → documented in the doc; upstream issues are the real fix.
- `evaluateConfig` negative-case detail → assert `.includes('path broke at')`, not a
  hardcoded key name (audit.mjs emits `key not found (path broke at "...")`).

---

## Appendix: Upstream issue drafts (NOT filed — human action)

### Draft 1 — genvid-holdings/construct3-chef
**Title:** Allow `--project-dir` to be set via env var or config so a bundled MCP plugin can target a non-root project

**Problem:** The `genvid-c3` plugin declares construct3-chef in `plugin.json` as
`{ "command": "npx", "args": ["-y", "@genvid/construct3-chef@0.6.0", "server"] }`.
Claude Code launches it with cwd = workspace root; `--project-dir` defaults to cwd, which
works when the C3 project is at the root. For a C3 project in a monorepo subdir, the static
`args` array can't express a per-repo non-root project dir without hardcoding an absolute
path (which breaks every other consumer).

**Ask:** An env var (e.g. `CONSTRUCT3_CHEF_PROJECT_DIR`) or auto-discovered config key that
overrides the `--project-dir` default. Precedent: `extractedDir` is already config-file-driven
via `construct3-chef.config.json`; extend the same pattern to the project dir.

**Cross-link:** companion issue in c3-domain-manager for `--config`/`--extracted`.

### Draft 2 — genvid-holdings/c3-domain-manager
**Title:** Allow `--config` and `--extracted` to be set via env var so a bundled MCP plugin can target non-default locations

**Problem:** Same shape. The plugin declares c3-domain-manager as
`{ "command": "npx", "args": ["-y", "@genvid/c3-domain-manager@0.3.0", "server"] }`.
Claude Code launches with cwd = workspace root; the server resolves `domain-config.json`
from `<cwd>/domain-config.json` and the extracted tree from `<cwd>/extracted/`. For a C3
project in a subdir, both default paths are wrong, and the static `args` array can't express
per-repo overrides without hardcoding.

**Ask:** Env vars (e.g. `C3_DOMAIN_CONFIG`, `C3_DOMAIN_EXTRACTED`) read by `server` before
applying defaults, so consumers set them per-repo without touching the shared plugin manifest.

**Cross-link:** companion issue in construct3-chef for `--project-dir`.
