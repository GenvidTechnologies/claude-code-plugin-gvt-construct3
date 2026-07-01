# C3 Toolchain Configuration

> Part of the [C3 platform reference](README.md). Covers the cross-tool wiring between construct3-chef and c3-domain-manager — config-file locations, the `extracted/` coupling, and the cwd-resolution model. Field-level reference for each tool stays in that tool's own docs.

## The Two Config Files

### `construct3-chef.config.json` (optional)

Placed at the **C3 project root** (which is the workspace root for the standard single-project layout). This file is **optional**: a missing or malformed file falls back silently to defaults and never causes a server error.

Currently one field matters for cross-tool coordination:

| Field | Default | Meaning |
| ----- | ------- | ------- |
| `extractedDir` | `"extracted"` | Directory where construct3-chef writes its read surface (DSL files, extracted TypeScript, layout summaries, indexes). Must resolve inside the project root. |

For the authoritative list of all fields and the full CLI reference (`--project-dir`, etc.), see the `construct3-chef://docs` resource — specifically the `cli.md` "Configuration file" section.

### `domain-config.json` (required)

Placed at the **C3 project root** (which is the workspace root for the standard single-project layout, or the project subdirectory for non-rooted repos — see below). This file is **required** by c3-domain-manager; the server errors on startup without it. Its content is your project's DDD domain topology (domains, shared subdomains, overrides, relationships) — that schema is project-specific and documented in c3-domain-manager's own `domain-architecture.md`, not here.

## Why the Bundled Servers Work With No Launch Flags

The plugin declares both servers in `plugin.json` as bare `server` invocations:

```json
"construct3-chef": { "command": "npx", "args": ["-y", "@genvidtech/construct3-chef@0.11.2", "server"] }
"c3-domain-manager": { "command": "npx", "args": ["-y", "@genvidtech/c3-domain-manager@0.6.1", "server"] }
```

No `--project-dir`, `--config`, or `--extracted` flags are passed. This works because Claude Code launches plugin-declared MCP servers with cwd set to the workspace root, and both servers resolve configuration from cwd:

- construct3-chef's `--project-dir` defaults to cwd, so it finds `construct3-chef.config.json` (if present) and the `.c3proj` file at the workspace root.
- c3-domain-manager looks for `<cwd>/domain-config.json` by default.

A consumer therefore configures each server simply by dropping those files at the workspace root — no plugin edit or local MCP server override required. (When the C3 project lives in a *subdirectory* rather than at the workspace root, the servers resolve their real project root dynamically — see [Non-Rooted C3 Projects](#non-rooted-c3-projects-project-in-a-subdirectory) below.)

## The `extracted/` Coupling

Both servers center on the same `extracted/` tree:

- **construct3-chef** WRITES to `extractedDir` (default `extracted/`): the DSL representation of event sheets, extracted TypeScript, layout summaries, and indexes. This is the read surface that other tools (and agents) consume.
- **c3-domain-manager** writes its domain index to `extracted/domain-index/` (resolved from its `--extracted` flag, which defaults to `extracted/`).

They must point at the **same tree**. The defaults agree out of the box. If you override one without matching the other — for example, setting `extractedDir: "build/extracted"` in `construct3-chef.config.json` but leaving c3-domain-manager at its default — c3-domain-manager will index a tree that construct3-chef never populated. This is a silent misconfiguration: both servers start without error, but the domain index will be stale or empty.

**Recommendation:** keep the default `extracted/` unless you have a strong reason to change it. If you do change it, change both.

## Non-Rooted C3 Projects (project in a subdirectory)

Both servers resolve the C3 project root via `resolveRootFolder` (from `@genvidtech/mcp-utils`). The full field-level reference is in each server's own docs; what follows is the consumer contract.

### Precedence (high to low)

1. **Explicit `--project-dir <dir>` CLI flag** — absolute override.
2. **`C3_PROJECT_DIR` env var** — set in the workspace shell or a local `.mcp.json`.
3. **Auto-discovery** — check cwd itself (depth 0), then immediate child directories only (depth 1). Exactly **one** child containing `project.c3proj` wins; zero matches falls through to cwd; two or more is ambiguous (see divergence below).
4. **cwd fallback** — used when nothing above resolves.

### Auto-discovery zero-config path

If your repo has **exactly one** immediate child directory containing `project.c3proj` (e.g. `sample/project.c3proj`), both servers auto-resolve to that subdirectory with **zero consumer config**. The plugin's bare `plugin.json` launch args are intentional — they let this discovery work for every consumer without hardcoding a path.

A project nested **two or more levels deep** (e.g. `client/game/project.c3proj`) is **not** auto-discovered; it requires an explicit override (see below).

### Ambiguity divergence

When two or more child directories each contain `project.c3proj`:

- **construct3-chef** warns to stderr and falls back to cwd.
- **c3-domain-manager** exits with an error.

Resolve ambiguity with an explicit `--project-dir` or `C3_PROJECT_DIR`.

### Consumer escape hatches for deep or ambiguous layouts

**Option A — set `C3_PROJECT_DIR` in the workspace shell.** Both servers read it before discovery. Set it in your shell profile or in a `.envrc` (direnv), pointing at the absolute path of the C3 project subdirectory.

**Option B — workspace-root `.mcp.json` that replaces the server entry.** Claude Code's MCP config has no field-merge — a same-name entry fully overrides the plugin-declared one. Add a workspace-root `.mcp.json` that repeats the full server invocation plus `--project-dir`:

```json
{
  "mcpServers": {
    "construct3-chef": {
      "command": "npx",
      "args": ["-y", "@genvidtech/construct3-chef@0.11.2", "server", "--project-dir", "game"]
    }
  }
}
```

Precedence across config levels: **local > project > user > plugin-declared**. A workspace-root `.mcp.json` is the "local" level and takes priority.

### Why `--project-dir` is not added to `plugin.json`

`${CLAUDE_PROJECT_DIR}` is the repo root — adding `--project-dir ${CLAUDE_PROJECT_DIR}` would merely restate the cwd default and, worse, suppress auto-discovery for every consumer. The static manifest also cannot read a consumer's `.genvid-agent.json` `paths.c3project`. The plugin stays bare so that single-project-subdir auto-discovery and explicit overrides both work correctly.

### The `extracted/` coupling under a non-rooted layout

Both servers resolve `extracted/` relative to **their own project root**. If you override the project root for one server (via `--project-dir` or `C3_PROJECT_DIR`) but not the other, the two `extracted/` trees diverge silently — construct3-chef writes to one path, c3-domain-manager indexes another.

**Override identically for both servers.** This is the non-rooted analogue of the "change both extracted dirs" warning above.

## External References

- **construct3-chef CLI and config fields** (`--project-dir`, `extractedDir`, all other options): `construct3-chef://docs` → `cli.md`, "Configuration file" section.
- **c3-domain-manager domain topology schema** (`domains`, `sharedSubdomains`, `overrides`, `relationships`): c3-domain-manager's `domain-architecture.md`.
