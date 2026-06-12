# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This repository develops the **`genvid-c3` Claude Code plugin** — not application code. The plugin packages Construct 3 (C3) domain knowledge for Claude Code: two agents, one audit skill, the canonical C3 platform reference (`plugin/docs/c3/`), and its `plugin.json` `mcpServers` declaration for the `construct3-chef` and `c3-domain-manager` MCP servers. The plugin is **independent of the `genvid-dev` plugin** and installs on its own.

### Repo layout — artifact vs. workspace

The repo is split in two on purpose:

- **`plugin/`** — the **shipped artifact**. `plugin/.claude-plugin/plugin.json` is the manifest; everything a consumer installs lives under here (`plugin/agents/`, `plugin/skills/`, `plugin/docs/c3/`, `plugin/CONVENTIONS.md`, `plugin/CHANGELOG.md`). The marketplace installs this subtree, so `${CLAUDE_PLUGIN_ROOT}` resolves to `plugin/`.
- **repo root** — the **dev workspace**, which *consumes* the `genvid-dev` plugin. `.genvid-agent.json` (`commands.validate`, `repo.*`, `paths.plugin_root`) and `docs/TOC.md` exist so the genvid-dev workflow skills (audit, plan-task, rebase, release-plugin, etc.) work here. This `CLAUDE.md` is dev guidance for the workspace; it is **not** shipped.

The plugin is distributed through the [`claude-code-marketplace`](https://github.com/genvid-holdings/claude-code-marketplace) catalog (marketplace name `genvid-plugins`). Because the artifact is in a subfolder, the marketplace entry uses a `git-subdir` source with `path: "plugin"`.

> **Why the split:** keeping the artifact in `plugin/` means the genvid-dev consumer files at the root (and any future CI/dev tooling) never collide with what ships, and the genvid-c3 contract (`plugin/CONVENTIONS.md`) is unambiguously distinct from genvid-dev's root-level conventions. A `genvid-dev:audit-conventions --fix` at the root only touches workspace files, never the plugin.

> **Note on `--fix`:** this repo is in genvid-dev **MIGRATED** state (it has `.genvid-agent.json`), so `genvid-dev:audit-conventions --fix` does **not** run the greenfield/legacy scaffolder here. Still, the `.genvid-agent.json` / `docs/TOC.md` were hand-tuned for this repo — if a future audit reports gaps, prefer editing them by hand over a blanket fixer run.

## Commands

All plugin checks run inside `plugin/` (that's what `commands.validate` in `.genvid-agent.json` does):

```bash
# Validate the plugin manifest + structure (run before any release/PR)
cd plugin && claude plugin validate .

# Run all skill test suites
cd plugin && node --test skills/*/scripts/test/*.test.mjs

# Run a single test by name
cd plugin && node --test --test-name-pattern="semver: higher patch" skills/audit-c3-conventions/scripts/test/audit.test.mjs

# Run the audit validator against a consuming repo (CLAUDE_PLUGIN_ROOT points at plugin/)
node plugin/skills/audit-c3-conventions/scripts/audit.mjs
```

There is no build step, no package.json, no lint config — the audit script and its libs are plain ESM `.mjs` run directly by Node. Tests use the built-in `node:test` runner only.

`commands.validate` runs the test glob `skills/*/scripts/test/*.test.mjs`, so **a new skill's tests are picked up by validation automatically — but only if they live at `skills/<name>/scripts/test/*.test.mjs`.** Put a skill's tests there (the `author-navigation-patterns` skill follows this); tests placed anywhere else are silently excluded from the suite.

## Architecture

### Three knowledge boundaries (the central design principle)

The plugin deliberately splits C3 knowledge into three homes; respect these when adding or editing content:

- **C3 platform reference** (how Construct 3 *itself* behaves — variable scoping, async/signal model, layout layers, JSON formats) → lives **here**, in `plugin/docs/c3/`. Agents link it via `${CLAUDE_PLUGIN_ROOT}/docs/c3/*`.
- **Tooling reference** (recipe format, generators, CLI, recipe gotchas) → lives in `construct3-chef://docs`, versioned with the tool, **not** duplicated here.
- **Project-specific facts** (named layouts, file paths, commit format, project gotchas) → live in the **consuming repo's** `CLAUDE.md`, read by the agents at runtime. The agents are genericized and fall back to `{type}: Description` commits when the consuming repo specifies nothing.

There is a fourth, narrower home worth calling out: **cross-tool wiring that neither server's own docs own** — how the two bundled MCP servers resolve their config from the workspace cwd, and the `extracted/` coupling between `construct3-chef` (`extractedDir`) and `c3-domain-manager` (`--extracted`) — lives in `plugin/docs/c3/toolchain-config.md`. It is a *pointer* doc: it documents the interplay and the consuming-repo contract, then links out to each tool's own docs for field-level reference. Do **not** restate a single tool's config schema there (e.g. `domain-config.json`'s domain shape is project-specific and belongs to the consumer / domain-manager's docs), and do not duplicate it into the platform-mechanics docs.

When you find yourself documenting a recipe gotcha vs. a platform gotcha, the distinction matters: platform gotchas (invisible to lint/typecheck, only C3 parses them) belong in `plugin/docs/c3/`; recipe-param/tooling gotchas belong in chef's docs. The `c3-implementer` agent keeps a short cheat-sheet of each but points to the canonical source.

### Components

- **`plugin/agents/*.md`** — flat Markdown files with YAML frontmatter, dispatched as `subagent_type: "genvid-c3:<name>"`.
  - `c3-explorer` (model: `haiku`) — strictly read-only recon. Its `tools:` frontmatter explicitly enumerates the read-only MCP tools it may call.
  - `c3-implementer` (model: `opus`) — all C3 mutations via the recipe system. TypeScript *modules* are out of scope (it hands cross-domain edits back to the orchestrator); it does write TS embedded in eventSheet script actions.
- **`plugin/skills/<name>/SKILL.md`** — a skill is a directory containing `SKILL.md` plus any scripts. Invoked as `/genvid-c3:<name>`. Three skills exist: `audit-c3-conventions` (the contract validator), `author-navigation-patterns` (authors/validates a chef `navigation.targetPatterns` convention), and `build-reference` (produces chef's `c3-reference` cache — built-in plugin ACEs + concept chunks — that chef's `search-docs` tool reads).
- **`plugin/docs/c3/`** — the platform reference (event-sheet architecture, layouts, scripting, TS integration, the ACE/`aces.json` metadata model in `ace-reference.md`, `construct3-guide.md`).
- **`plugin/.claude-plugin/plugin.json`** — the manifest, including the `mcpServers` block that declares both C3 servers (scoped `@genvid/*` packages, pinned, launched via `npx -y … server`).

> **Pattern — a skill that authors a tool's config** (e.g. `author-navigation-patterns`): mirror the tool's algorithm only against its **documented contract**, defer the field-level schema to the tool's own docs (`construct3-chef://docs`), and treat the **tool's own output as the authoritative validator** (`navigation-graph`) — any bundled helper script is a fast *preview* that must agree with, not replace, that output. Pin the mirrored logic to ground truth from the package source (see [`docs/grounding-in-chef-behavior.md`](docs/grounding-in-chef-behavior.md)).
>
> **Pattern — a skill that *produces a data cache the tool reads*** (e.g. `build-reference` → chef's `c3-reference` cache, validated by `search-docs`): same preview-vs-authoritative-validator rule, plus an extra obligation — **ground the *dataflow*, not just the schema, in the tool's source before designing.** Check whether the tool already generates or merges part of that data itself, so the skill doesn't duplicate it. chef's `lookup()` reads `addons/*/aces.json` **live** and concatenates it with the cache's `aces` (no dedup), so the cache must hold **built-in/manual ACEs + chunks only** — writing `source:"addon"` entries into it double-counts every one. This near-miss is why the grounding step reads the tool's *ingestion path*, not only its schema.

### The convention contract & the audit (`plugin/skills/audit-c3-conventions/`)

This is the most code-heavy part of the repo. The plugin defines a *contract* a consuming repo must satisfy (a C3-project marker + both MCP servers reachable at minimum versions), and the audit script verifies it.

The contract is **data-driven**: each skill/agent declares its needs under `metadata.expects.{files,config,tools,mcp}` in its frontmatter. The audit script (`scripts/audit.mjs`) walks every `SKILL.md` and `agents/*.md` under `${CLAUDE_PLUGIN_ROOT}`, collects their `expects` entries, evaluates each against the current working directory, and prints a Markdown report grouped by severity. **To add a new requirement, add an `expects` entry to the relevant component's frontmatter — do not hard-code checks in the script.** The one exception is the C3-project marker (a bespoke OR-check across three indicators), which is the only check baked into `audit.mjs` directly.

Supporting libs (`scripts/lib/`):
- `frontmatter.mjs` — a *minimal* hand-rolled YAML parser scoped to the exact frontmatter shapes used (top-level scalars, one level of nesting for `metadata.expects`, arrays of objects). It does **not** handle multiline scalars, anchors, or deep nesting — keep frontmatter within those shapes or replace the parser.
- `config-resolve.mjs` — resolves dotted keys (`features.c3`) against parsed JSON, reporting *where* a path broke.

MCP probing: reachability is confirmed by running `npx -y <package> --version` for the **scoped** package (`@genvid/construct3-chef`), since npx resolves by package name — `npx construct3-chef` would 404. Both CLIs currently report version as "unknown", so the authoritative version comes from walking `node_modules` for the backing package's `package.json` (`resolvePackageVersion`). The `package:` field in an `mcp` expects entry names that package.

Audit exit codes: `0` all required expectations met, `1` an error finding, `2` unexpected script error.

## Conventions for editing this repo

- Top-level frontmatter keys are fixed to `name`, `description`, and Anthropic-supported fields (`model`, `tools`). **Custom expectations go under `metadata.expects`** — never invent new top-level keys, or `claude plugin validate` and downstream tooling will choke.
- Keep agent bodies generic across C3 projects. Anything project-specific belongs in the consuming repo, not here (see knowledge boundaries above).
- **Before slimming, moving, or deleting a doc section, grep for deep-links into its heading.** CLAUDE.md (and other docs) cross-reference *specific sections*, not just files — e.g. a callout once deep-linked `tool-surface-reconciliation.md → "Grounding skill/doc design in chef behavior"`. A naive "slim this doc" edit can silently break such a link by removing the target heading; check `grep -rn "<section title>"` and repoint the referrer in the same commit as the move.
- **Respect each agent's capability envelope (`model` + `tools`).** Don't instruct an agent to do what it can't observe. `c3-explorer` is `haiku` and reads layout/addon JSON, *not pixels* — so its swap-recon guidance reports observable geometry (size, origin/anchor, frame inventory) and hands visual-silhouette judgment back to a human, rather than claiming to compare shapes. When adding guidance, write the observable-data steps and explicitly flag anything that needs a capability the agent lacks.
- Commit format observed in history: `{type}: short description` (e.g. `feat:`, `docs:`).
- **Closing issues from PRs:** the repo's squash-title style appends bare `(#N)` references (e.g. `feat: … (#6) (#9)`), which only *cross-reference* — they do **not** auto-close. To close an issue on merge, put a closing keyword (`Closes #N` / `Fixes #N`) in the **PR body**; otherwise close it by hand after release (issue #6 stayed open through v1.2.0 for exactly this reason).

## Release status

Releasing a new version is a cross-repo workflow (bump `plugin/.claude-plugin/plugin.json`, move `plugin/CHANGELOG.md`'s Unreleased section, tag, bump the marketplace ref). Use the `genvid-dev:release-plugin` skill rather than doing it by hand.

**When a release bumps the pinned `construct3-chef` / `c3-domain-manager` versions in `mcpServers`, run `/genvid-dev:reconcile-mcp-pin`** before tagging — a server bump can add/rename/remove MCP tools, and the agents enumerate those by hand. See [`docs/tool-surface-reconciliation.md`](docs/tool-surface-reconciliation.md) for the C3-specific anchors (agent allow-lists, package names, surface counts). (`c3-explorer`'s `tools:` is a hard allow-list, so a missed read tool becomes uncallable — this is a functional check, not just docs.)

`genvid-dev:release-plugin` (≥ 2.8.0) honors `paths.plugin_root`, so it operates on `plugin/.claude-plugin/plugin.json` and `plugin/CHANGELOG.md` and keeps the marketplace entry on its `git-subdir` source (`path: "plugin"`). The `url`→`git-subdir` migration already happened at v1.1.0; steady-state releases are a single-value `source.ref` bump (genvid-dev#28, resolved).
