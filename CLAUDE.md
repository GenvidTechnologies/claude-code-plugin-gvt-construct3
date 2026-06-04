# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is the **`genvid-c3` Claude Code plugin** — not application code. It packages Construct 3 (C3) domain knowledge for Claude Code: two agents, one audit skill, the canonical C3 platform reference (`docs/c3/`), and a bundled `.mcp.json` declaring the `construct3-chef` and `c3-domain-manager` MCP servers. It is **independent of the `genvid-dev` plugin** and installs on its own.

The plugin itself lives at the repo root (`.claude-plugin/plugin.json` is the manifest). It is distributed through the [`claude-code-marketplace`](https://github.com/genvid-holdings/claude-code-marketplace) catalog (marketplace name `genvid-plugins`).

### Dual identity — this repo wears two contracts

Don't "resolve" the apparent contradiction below; it's intentional:

1. As the **genvid-c3 plugin**, this repo *owns* the genvid-c3 convention contract in [`CONVENTIONS.md`](CONVENTIONS.md) — what a *consuming* C3 project must provide. The plugin is independent of genvid-dev.
2. As a **repo developed with Claude Code**, it *also consumes* the genvid-dev plugin's contract: `.genvid-agent.json` (`commands.validate`, `repo.default_branch`, `repo.host`) and `docs/TOC.md` exist so the genvid-dev workflow skills (audit, plan-task, rebase, release-plugin, etc.) work here.

⚠️ **Do NOT run `genvid-dev:audit-conventions --fix --apply` in this repo.** In greenfield/legacy mode its scaffolder overwrites the repo-root `CONVENTIONS.md` with genvid-**dev**'s canonical copy and replaces this `CLAUDE.md` with a stub. The two genvid-dev convention files were hand-crafted to fit this plugin repo — if a future audit reports gaps, edit `.genvid-agent.json` / `docs/TOC.md` by hand instead of applying the fixer.

> **CHANGELOG gap:** the README and `genvid-dev:release-plugin` expect a `CHANGELOG.md` (the release skill moves its "Unreleased" section), but none exists yet. Create one before cutting the first release.

## Commands

```bash
# Validate the plugin manifest + structure (run before any release/PR)
claude plugin validate .

# Run the audit-skill test suite
node --test skills/audit-c3-conventions/scripts/test/*.test.mjs

# Run a single test by name
node --test --test-name-pattern="semver: higher patch" skills/audit-c3-conventions/scripts/test/audit.test.mjs

# Run the audit validator against the current working directory (the consuming repo)
node skills/audit-c3-conventions/scripts/audit.mjs
```

There is no build step, no package.json, no lint config — the audit script and its libs are plain ESM `.mjs` run directly by Node. Tests use the built-in `node:test` runner only.

## Architecture

### Three knowledge boundaries (the central design principle)

The plugin deliberately splits C3 knowledge into three homes; respect these when adding or editing content:

- **C3 platform reference** (how Construct 3 *itself* behaves — variable scoping, async/signal model, layout layers, JSON formats) → lives **here**, in `docs/c3/`. Agents link it via `${CLAUDE_PLUGIN_ROOT}/docs/c3/*`.
- **Tooling reference** (recipe format, generators, CLI, recipe gotchas) → lives in `construct3-chef://docs`, versioned with the tool, **not** duplicated here.
- **Project-specific facts** (named layouts, file paths, commit format, project gotchas) → live in the **consuming repo's** `CLAUDE.md`, read by the agents at runtime. The agents are genericized and fall back to `{type}: Description` commits when the consuming repo specifies nothing.

When you find yourself documenting a recipe gotcha vs. a platform gotcha, the distinction matters: platform gotchas (invisible to lint/typecheck, only C3 parses them) belong in `docs/c3/`; recipe-param/tooling gotchas belong in chef's docs. The `c3-implementer` agent keeps a short cheat-sheet of each but points to the canonical source.

### Components

- **`agents/*.md`** — flat Markdown files with YAML frontmatter, dispatched as `subagent_type: "genvid-c3:<name>"`.
  - `c3-explorer` (model: `haiku`) — strictly read-only recon. Its `tools:` frontmatter explicitly enumerates the read-only MCP tools it may call.
  - `c3-implementer` (model: `opus`) — all C3 mutations via the recipe system. TypeScript *modules* are out of scope (it hands cross-domain edits back to the orchestrator); it does write TS embedded in eventSheet script actions.
- **`skills/<name>/SKILL.md`** — a skill is a directory containing `SKILL.md` plus any scripts. Invoked as `/genvid-c3:<name>`. Only `audit-c3-conventions` currently exists.
- **`docs/c3/`** — the platform reference (event-sheet architecture, layouts, scripting, TS integration, `construct3-guide.md`).

### The convention contract & the audit (`skills/audit-c3-conventions/`)

This is the most code-heavy part of the repo. The plugin defines a *contract* a consuming repo must satisfy (a C3-project marker + both MCP servers reachable at minimum versions), and the audit script verifies it.

The contract is **data-driven**: each skill/agent declares its needs under `metadata.expects.{files,config,tools,mcp}` in its frontmatter. The audit script (`scripts/audit.mjs`) walks every `SKILL.md` and `agents/*.md` under `${CLAUDE_PLUGIN_ROOT}`, collects their `expects` entries, evaluates each against the current working directory, and prints a Markdown report grouped by severity. **To add a new requirement, add an `expects` entry to the relevant component's frontmatter — do not hard-code checks in the script.** The one exception is the C3-project marker (a bespoke OR-check across three indicators), which is the only check baked into `audit.mjs` directly.

Supporting libs (`scripts/lib/`):
- `frontmatter.mjs` — a *minimal* hand-rolled YAML parser scoped to the exact frontmatter shapes used (top-level scalars, one level of nesting for `metadata.expects`, arrays of objects). It does **not** handle multiline scalars, anchors, or deep nesting — keep frontmatter within those shapes or replace the parser.
- `config-resolve.mjs` — resolves dotted keys (`features.c3`) against parsed JSON, reporting *where* a path broke.

MCP version probing: `npx <server> --version` confirms reachability, but both CLIs currently report version as "unknown", so the authoritative version comes from walking `node_modules` for the backing package's `package.json` (`resolvePackageVersion`). The `package:` field in an `mcp` expects entry names that package.

Audit exit codes: `0` all required expectations met, `1` an error finding, `2` unexpected script error.

## Conventions for editing this repo

- Top-level frontmatter keys are fixed to `name`, `description`, and Anthropic-supported fields (`model`, `tools`). **Custom expectations go under `metadata.expects`** — never invent new top-level keys, or `claude plugin validate` and downstream tooling will choke.
- Keep agent bodies generic across C3 projects. Anything project-specific belongs in the consuming repo, not here (see knowledge boundaries above).
- Commit format observed in history: `{type}: short description` (e.g. `feat:`, `docs:`).
- Releasing a new version is a cross-repo workflow (bump `plugin.json`, move CHANGELOG, tag, bump the marketplace ref). Use the `genvid-dev:release-plugin` skill rather than doing it by hand.
