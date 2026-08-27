# 0004. `plugin/` Artifact-vs-Workspace Split + `git-subdir` Marketplace Source

- **Status:** Accepted
- **Originally decided:** 2026-06-04 (`56bdeb0` relocate into `plugin/` (#2); `d374da3` release v1.1.0 with the `git-subdir` source)
- **Recorded:** 2026-06-18 (backfilled — predates the `docs/decisions/` convention)

## Context

The repo is two things at once: it **ships** the `genvid-c3` plugin, and it is itself a **dev workspace** that *consumes* the `genvid-dev` plugin (`.genvid-agent.json`, `docs/TOC.md`, this `CLAUDE.md`, future CI). Originally the shipped artifact lived at the repo root, so consumer-side dev files and shipped files shared one namespace — the genvid-c3 contract (`CONVENTIONS.md`) was indistinguishable from genvid-dev's root-level conventions, and a `genvid-dev:audit-conventions --fix` at the root could touch shipped files.

## Decision

**Split the repo in two on purpose:**

- **`plugin/`** — the shipped artifact. `plugin/.claude-plugin/plugin.json` is the manifest; everything a consumer installs lives under here (`plugin/agents/`, `plugin/skills/`, `plugin/docs/c3/`, `plugin/CONVENTIONS.md`, `plugin/CHANGELOG.md`). `${CLAUDE_PLUGIN_ROOT}` resolves to `plugin/`.
- **repo root** — the dev workspace that consumes genvid-dev. `.genvid-agent.json` (`paths.plugin_root`, `commands.validate`, `repo.*`) and `docs/TOC.md` make the genvid-dev workflow skills operate here without colliding with what ships.

**Because the artifact is in a subfolder, the marketplace entry uses a `git-subdir` source with `path: "plugin"`** (in the `genvid-holdings/claude-code-marketplace` catalog), rather than a plain `url` source. The two are causally linked: the subfolder split *forced* the `git-subdir` form, so they are one decision. The `url`→`git-subdir` migration shipped at v1.1.0; steady-state releases are now a single-value `source.ref` bump.

## Compromise / Alternatives rejected

- **Flat repo (artifact at root)** — rejected: dev-workspace consumer files collide with shipped files, the two convention contracts blur, and a root `--fix` can mutate the artifact. The split makes "what ships" unambiguous.
- **`url` marketplace source** — not viable once the artifact moved into `plugin/`; the catalog must point at the subtree, which is exactly what `git-subdir` + `path: "plugin"` expresses.

## Consequences

- All plugin checks run inside `plugin/` (`commands.validate` does `cd plugin && …`).
- Releases are cross-repo (`genvid-dev:release-plugin` ≥ 2.8.0 honors `paths.plugin_root`, operates on `plugin/.claude-plugin/plugin.json` + `plugin/CHANGELOG.md`, and keeps the marketplace entry on its `git-subdir` source).
- A root-level `genvid-dev:audit-conventions --fix` only touches workspace files, never the plugin.
- This repo is in genvid-dev MIGRATED state (it has `.genvid-agent.json`), so the audit `--fix` does not run the greenfield scaffolder here.
