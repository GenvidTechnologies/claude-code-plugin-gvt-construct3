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

Placed at the **workspace root**. This file is **required** by c3-domain-manager; the server errors on startup without it. Its content is your project's DDD domain topology (domains, shared subdomains, overrides, relationships) — that schema is project-specific and documented in c3-domain-manager's own `domain-architecture.md`, not here.

## Why the Bundled Servers Work With No Launch Flags

The plugin declares both servers in `plugin.json` as bare `server` invocations:

```json
"construct3-chef": { "command": "npx", "args": ["-y", "@genvid/construct3-chef@0.10.2", "server"] }
"c3-domain-manager": { "command": "npx", "args": ["-y", "@genvid/c3-domain-manager@0.5.0", "server"] }
```

No `--project-dir`, `--config`, or `--extracted` flags are passed. This works because Claude Code launches plugin-declared MCP servers with cwd set to the workspace root, and both servers resolve configuration from cwd:

- construct3-chef's `--project-dir` defaults to cwd, so it finds `construct3-chef.config.json` (if present) and the `.c3proj` file at the workspace root.
- c3-domain-manager looks for `<cwd>/domain-config.json` by default.

A consumer therefore configures each server simply by dropping those files at the workspace root — no plugin edit or local MCP server override required.

## The `extracted/` Coupling

Both servers center on the same `extracted/` tree:

- **construct3-chef** WRITES to `extractedDir` (default `extracted/`): the DSL representation of event sheets, extracted TypeScript, layout summaries, and indexes. This is the read surface that other tools (and agents) consume.
- **c3-domain-manager** writes its domain index to `extracted/domain-index/` (resolved from its `--extracted` flag, which defaults to `extracted/`).

They must point at the **same tree**. The defaults agree out of the box. If you override one without matching the other — for example, setting `extractedDir: "build/extracted"` in `construct3-chef.config.json` but leaving c3-domain-manager at its default — c3-domain-manager will index a tree that construct3-chef never populated. This is a silent misconfiguration: both servers start without error, but the domain index will be stale or empty.

**Recommendation:** keep the default `extracted/` unless you have a strong reason to change it. If you do change it, change both.

## Non-Root C3 Project Limitation

The zero-flags story depends on cwd equalling the workspace root. In a monorepo where the C3 project lives in a **subdirectory**, the cwd-relative lookups miss — `project.c3proj`, `construct3-chef.config.json`, and `domain-config.json` are not at cwd — and the bundled plugin's static `plugin.json` args cannot express a per-repo project directory without hardcoding (which would break other consumers).

There is currently no env-var or config-file override for `--project-dir`, `--config`, or `--extracted`; upstream support is tracked but not yet available.

**Workaround today:** keep the C3 project at the workspace root. The reference consumer (genvid-holdings/burbank) does exactly this: `project.c3proj`, `domain-config.json`, and `extracted/` all live at the repo root, no `construct3-chef.config.json` override, both servers launched bare via the plugin.

## External References

- **construct3-chef CLI and config fields** (`--project-dir`, `extractedDir`, all other options): `construct3-chef://docs` → `cli.md`, "Configuration file" section.
- **c3-domain-manager domain topology schema** (`domains`, `sharedSubdomains`, `overrides`, `relationships`): c3-domain-manager's `domain-architecture.md`.
