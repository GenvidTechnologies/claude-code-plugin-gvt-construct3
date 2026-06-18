# 0005. Non-Rooted C3 Project Support

- **Status:** Accepted
- **Recorded:** 2026-06-18
- **Issue:** #26

## Context

Both bundled MCP servers (`construct3-chef`, `c3-domain-manager`) gained project-root resolution in their respective releases (chef 0.10.2, dm 0.5.0) via `resolveRootFolder` in `@genvid/mcp-utils`. The function supports an explicit `--project-dir` CLI flag, a `C3_PROJECT_DIR` env var, depth-1 auto-discovery of a single `project.c3proj` child directory, and a cwd fallback.

This raised two design questions for the plugin:

1. Should `plugin.json` be updated to forward `--project-dir` or `C3_PROJECT_DIR` so non-rooted consumers get the subdir automatically?
2. How should `audit-c3-conventions` resolve `expects.files` entries that belong to the C3 project root rather than the repo root, given the plugin's data-driven contract (add an `expects` field, don't hard-code checks)?

## Decision

### Decision A — `plugin.json` stays bare (no `--project-dir` added)

The static manifest cannot express a per-consumer project subdirectory. The two candidate approaches both fail:

- **`--project-dir ${CLAUDE_PROJECT_DIR}`** — `${CLAUDE_PROJECT_DIR}` is the repo root, which merely restates the cwd default and, critically, **suppresses auto-discovery** for every consumer. An explicit flag takes tier-1 precedence and prevents the depth-1 single-match path from running.
- **An `env` block forwarding `C3_PROJECT_DIR`** — the manifest still cannot compute the subdir from `.genvid-agent.json`'s `paths.c3project` at plugin-install time; a blank or empty-string forward risks suppressing discovery.

The server-side depth-1 single-match discovery handles the motivating case (one project in an immediate child directory) with zero consumer config. For deeper or ambiguous layouts, consumers use `C3_PROJECT_DIR` or a workspace-root `.mcp.json` that overrides the full server entry (Claude Code MCP config: same-name entry fully replaces; precedence local > project > user > plugin-declared). The plugin stays bare to keep these paths open for all consumers.

### Decision B — `base: project|repo` field (default `repo`) on `metadata.expects.files` entries

The audit script resolves `expects.files` entries relative to a base directory. Two bases are needed:

- `repo` (default) — the workspace / repo root, as before. Used for repo-level files such as `.genvid-agent.json`.
- `project` — the C3 project root, derived from `.genvid-agent.json` `paths.c3project` (falling back to repo root when absent). Used for files that live alongside the `.c3proj`, such as `domain-config.json` and `construct3-chef.config.json`.

Adding a `base:` field per entry keeps the contract data-driven (each component's frontmatter declares its own needs) and avoids encoding a file-name allow-list in `audit.mjs`. Four `expects.files` entries that reference C3-project-root files are annotated with `base: project`: `domain-config.json` in `audit-c3-conventions`, and `construct3-chef.config.json` in `author-navigation-patterns`, `build-reference`, and `create-c3-op`. Entries without `base:` continue to resolve against the repo root.

(The C3-project marker check — `project.c3proj` / `paths.c3project` — is a separate bespoke check in `audit.mjs`, not an `expects.files` entry, and is unaffected by this field.)

## Compromise

### Alternatives rejected for Decision A

**A2 — `env` block forwarding `C3_PROJECT_DIR` in `plugin.json`:** still cannot derive the subdir value from the static manifest; an empty forward would suppress auto-discovery, making things worse for the single-project-subdir case. Rejected for the same reason as the `--project-dir` approach.

### Alternatives rejected for Decision B

**B2 — hardcoded filename allow-list in `audit.mjs`:** not data-driven; the script would need updating every time a component adds a project-root `expects.files` entry, drifting out of sync with frontmatter. Violates the plugin's "add an `expects` entry, don't hard-code checks" principle.

**B3 — per-skill `base` (one base for all of a skill's `expects.files`):** too coarse. A skill may legitimately need both repo-root files (e.g. `CLAUDE.md`) and C3-project-root files (e.g. `project.c3proj`) in the same `expects.files` list. Per-entry `base:` handles this without forcing an artificial split.

## Consequences

- The auto-discovery zero-config path works for any consumer whose C3 project is a single immediate child directory — no plugin edit or `.mcp.json` override needed.
- Consumers with deeper or ambiguous layouts have two documented escape hatches: `C3_PROJECT_DIR` and a workspace-root `.mcp.json` entry override.
- `audit-c3-conventions` resolves project-root file checks against the actual C3 project directory when `.genvid-agent.json` declares `paths.c3project`, giving accurate audit results for non-rooted consumers.
- Future components that add `expects.files` entries for project-root files simply annotate them with `base: project` — no audit-script change required.
- The `base:` field becomes part of the data-driven contract documented in `plugin/CONVENTIONS.md`; any consumer or tooling author relying on audit frontmatter must account for it.
