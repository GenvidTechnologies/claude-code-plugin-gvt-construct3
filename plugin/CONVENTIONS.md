# gvt-construct3 Plugin Conventions

This document is the contract between the `gvt-construct3` Claude Code plugin and the repositories that install it. Unlike a generic workflow plugin, `gvt-construct3` is **domain-specific**: it only applies to repositories that contain a **Construct 3 project** and have the **construct3-chef** and **c3-domain-manager** MCP servers available.

`gvt-construct3` is **independent of the `genvid-dev` plugin** — it ships its own convention contract and its own audit (`audit-c3-conventions`). It does not depend on genvid-dev being installed.

## What a consuming repo must provide

| Requirement | How it's satisfied | Checked by |
|-------------|--------------------|------------|
| **A C3-project marker** | `project.c3proj` at the repo root, **or** `.genvid-agent.json` with `features.c3: true`, **or** `.genvid-agent.json` `paths.c3project` pointing at the `.c3proj` file | `audit-c3-conventions` |
| **construct3-chef MCP server** | Launched as `npx -y @genvid/construct3-chef server`, version ≥ `0.4.0` | `audit-c3-conventions` |
| **c3-domain-manager MCP server** | Launched as `npx -y @genvid/c3-domain-manager server`, version ≥ `0.1.1` | `audit-c3-conventions` |

The plugin **declares both servers in its `plugin.json`** (`mcpServers`), so they start automatically when `gvt-construct3` is enabled. Bundled plugin servers may install as **"Pending approval"** — approve them once in Claude Code. If the consuming repo also wires these servers in its own `.mcp.json`, that is redundant but harmless.

## Optional, project-owned context the plugin's agents read at runtime

The genericized agents read project-specific conventions from the **consuming repo's `CLAUDE.md`** when present (they are not baked into the plugin):

- **Commit format** — the agents fall back to `{type}: Description` if the repo doesn't specify one.
- **Cross-domain / two-commit rules** — when a C3 change requires editing TypeScript modules, the agents hand back to the orchestrator; how the project splits those commits is read from its `CLAUDE.md`.
- **Project-specific C3 gotchas & provenance** — keep these in a project-owned doc (e.g. `docs/c3-project-gotchas.md`); the generic platform rules live in this plugin's `docs/c3/`.

## What the plugin provides

**Agents** (dispatched as `subagent_type: "gvt-construct3:<name>"`):

| Agent | Role |
|-------|------|
| `c3-explorer` | Read-only C3 recon (DSL, layouts, domain index, search). Cheap, `haiku`. |
| `c3-implementer` | C3 mutations via recipes, layout/sprite scaffolding, project sync. `opus`. |

**Skills** (invoked as `/gvt-construct3:<name>`):

| Skill | Purpose |
|-------|---------|
| `audit-c3-conventions` | Read-only validator: checks the C3-project marker, that `domain-config.json` is present at the C3 project root, and that both MCP servers are reachable at their minimum versions. |
| `author-navigation-patterns` | Authors and validates a construct3-chef `navigation.targetPatterns` / `definitionMarkers` convention for a project that navigates through a wrapper function: inspects the extracted DSL, proposes the capture-group regex, previews captures/skips, and validates against `navigation-graph`. Requires `construct3-chef ≥ 0.7.0` (declared in its own `metadata.expects`, above the baseline `≥ 0.4.0` floor). |
| `build-reference` | Produces construct3-chef's `c3-reference` cache (built-in plugin ACEs + layout/scripting/Expression concept chunks) so `search-docs` resolves built-ins, not just custom-addon ACEs. Requires `construct3-chef ≥ 0.9.0` (declared in its own `metadata.expects`). |
| `create-c3-op` | Authors and dry-run-validates a construct3-chef user-defined op (a parameterized recipe template): elicits typed params, places `{{PARAM}}` tokens, writes the op-file wrapper, and validates via `list-ops` + `apply-op --dry-run`. Authors the op wrapper only (recipe body defers to chef's docs + `c3-implementer`) and never runs a writing `apply-op`. Requires `construct3-chef ≥ 0.10.0` (declared in its own `metadata.expects`, above the baseline `≥ 0.4.0` floor). |

**Bundled docs** (`docs/c3/`): the canonical **C3 platform reference** — event-sheet architecture, layouts, scripting, TS integration, and `construct3-guide.md`. Agents reference these via `${CLAUDE_PLUGIN_ROOT}/docs/c3/*`.

**Bundled MCP servers** (`plugin.json` `mcpServers`): declares the `construct3-chef` and `c3-domain-manager` servers, pinned to their tested versions.

## Knowledge boundaries

`gvt-construct3` owns **C3 platform reference** (how Construct 3 itself behaves). It deliberately does **not** duplicate:

- **Tooling reference** (recipe format, generators, CLI, recipe gotchas) — that lives in `construct3-chef://docs`, versioned with the tool it describes.
- **Project-specific facts** (named layouts, file paths, commit format, project gotchas) — those live in the consuming repo.

## Forking and adapting

The plugin is generic across Construct 3 projects but specific to the C3 domain. If your org's C3 workflow differs, fork the repo and edit the agent/skill bodies directly. The contract above is intentionally small — a marker plus two MCP servers.
