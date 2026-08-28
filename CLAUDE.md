# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read the wiki before you edit

**This repo's accumulated maintenance rules live in [`wiki/`](wiki/index.md), not in this file.** They were moved there deliberately: `CLAUDE.md` had grown to 40 KB of rule-bullets that every session paid for whether or not the task touched them. This file now carries what is *always* true; the wiki carries what is true *when you're doing a particular job*.

**Consult the matching page before starting one of these jobs — each rule below was written because it had already been violated at least once.**

| Before you… | Read |
|---|---|
| Add or edit anything in `plugin/docs/c3/` | [Verifying docs/c3 against construct3-sample](wiki/verifying-against-construct3-sample.md) — the sample is ground truth, the ADR 0008 marker **scope**, and seven traps that each shipped a wrong doc or came one decision from it |
| Bump a `construct3-chef` / `c3-domain-manager` pin | [Verifying an MCP pin bump](wiki/pin-bump-verification.md) — the issue's surface table is an assertion to test; `c3-implementer.md` is the pin site that goes missing every time |
| Add a skill, a `docs/c3` doc, or even a new `##` section | [Doc inventories, ADRs, and the changelog](wiki/doc-inventories.md) — the hand-maintained inventories that drift silently |
| Write or change a skill's scripts or frontmatter | [Skill authoring conventions](wiki/skill-authoring-conventions.md) — the lib/CLI split, where tests must live, and the unimplemented-remediation trap |
| Touch `audit.mjs` or the `expects` contract | [The convention contract and the audit](wiki/the-audit-contract.md) |
| Decide *where* a fact belongs | [The knowledge boundaries](wiki/knowledge-boundaries.md) |
| Write guidance for an agent | [Agent capability envelopes](wiki/agent-capability-envelopes.md) |
| Defer an issue to `construct3-chef` | [Deferring an issue upstream](wiki/deferring-issues-upstream.md) |
| Act on code-review feedback | [Working with the code reviewer](wiki/working-with-code-review.md) |
| Record an architecture decision | [`wiki/decisions/`](wiki/decisions/index.md) — ADRs live in the wiki bundle, not `docs/`; `create-adr` finds them only via the **ADR location** line under § Conventions |

Ask the wiki a question with `/gvt-dev:maintain-wiki query`; add to it with `ingest`. `raw/` holds immutable captures — never edit a file there. The schema is [`wiki/wiki-schema.md`](wiki/wiki-schema.md) — **not** the `docs/wiki-schema.md` that `maintain-wiki` still hard-codes.

> **Never run `/gvt-dev:maintain-wiki ingest --non-interactive` in this repo** until gvt-dev #390 lands. Its §0 probe looks for `docs/wiki-schema.md`, finds nothing, and unattended it **scaffolds a generic schema doc and re-creates the `docs/` directory this repo deliberately retired**. An attended run offers the scaffold — decline it, and point at `wiki/wiki-schema.md`.

## What this repo is

This repository develops the **`gvt-construct3` Claude Code plugin** — not application code. The plugin packages Construct 3 (C3) domain knowledge for Claude Code: two agents, four skills, the canonical C3 platform reference (`plugin/docs/c3/`), and its `plugin.json` `mcpServers` declaration for the `construct3-chef` and `c3-domain-manager` MCP servers. The plugin is **independent of the `gvt-dev` plugin** and installs on its own.

### Repo layout — artifact vs. workspace

The repo is split in two on purpose:

- **`plugin/`** — the **shipped artifact**. `plugin/.claude-plugin/plugin.json` is the manifest; everything a consumer installs lives under here (`plugin/agents/`, `plugin/skills/`, `plugin/docs/c3/`, `plugin/CONVENTIONS.md`, `plugin/CHANGELOG.md`). The marketplace installs this subtree, so `${CLAUDE_PLUGIN_ROOT}` resolves to `plugin/`.
- **repo root** — the **dev workspace**, which *consumes* the `gvt-dev` plugin. `.gvt-agent.json` (`commands.validate`, `repo.*`, `paths.plugin_root`, `wiki`, and the four `paths` overrides that point the contract at `wiki/`) and `wiki/` exist so the gvt-dev workflow skills (audit, plan-task, rebase, release-plugin, maintain-wiki, etc.) work here. This `CLAUDE.md` is dev guidance for the workspace; it is **not** shipped.

The plugin is distributed through the [`claude-code-marketplace`](https://github.com/genvid-holdings/claude-code-marketplace) catalog (marketplace name `genvid-plugins`). Because the artifact is in a subfolder, the marketplace entry uses a `git-subdir` source with `path: "plugin"`.

> **Why the split:** keeping the artifact in `plugin/` means the gvt-dev consumer files at the root never collide with what ships, and the gvt-construct3 contract (`plugin/CONVENTIONS.md`) is unambiguously distinct from gvt-dev's root-level conventions. A `gvt-dev:audit-conventions --fix` at the root only touches workspace files, never the plugin.

> **Note on `--fix`:** this repo is in gvt-dev **MIGRATED** state (it has `.gvt-agent.json`), so `gvt-dev:audit-conventions --fix` does **not** run the greenfield/legacy scaffolder here. The `.gvt-agent.json` / `wiki/index.md` were hand-tuned — if a future audit reports gaps, prefer editing them by hand over a blanket fixer run.

### Two OKF bundles

`wiki/` (dev-workspace, `ingest`-maintained) and `plugin/docs/c3/` (shipped, hand-maintained against `construct3-sample`) are **both** OKF v0.2 bundles, and they are different tiers. Never fold one into the other — see [`wiki/wiki-schema.md`](wiki/wiki-schema.md).

## Commands

All plugin checks run inside `plugin/` (that's what `commands.validate` in `.gvt-agent.json` does):

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

There is no build step, no `package.json`, no lint config — plain ESM `.mjs` run directly by Node, tests via the built-in `node:test` runner only.

> **The `cd plugin &&` is load-bearing, and dropping it fails *open*.** The test glob is
> relative to `plugin/`, so from the repo root it matches nothing, prints
> `tests 0 / pass 0 / fail 0`, and **exits 0** — a green run that verified nothing. The same
> glob is embedded in `.gvt-agent.json`'s `commands.validate`, so any wrapper or agent that
> loses the working directory inherits the trap. **Confirm a non-zero test count** (currently
> 174) rather than reading exit 0 as a pass. Note the shell's working directory also persists
> between tool calls, so a `cd plugin` in one command silently changes where the *next* one
> runs — which is how this usually happens.

## Components

- **`plugin/agents/*.md`** — dispatched as `subagent_type: "gvt-construct3:<name>"`.
  - `c3-explorer` (`haiku`) — strictly read-only recon; its `tools:` frontmatter is a hard allow-list of the read-only MCP tools it may call.
  - `c3-implementer` (`opus`) — all C3 mutations via the recipe system; no `tools:` key. TypeScript *modules* are out of scope (it hands cross-domain edits back to the orchestrator); it does write TS embedded in eventSheet script actions.
- **`plugin/skills/<name>/SKILL.md`** — invoked as `/gvt-construct3:<name>`. Skills include `audit-c3-conventions` (the contract validator), `author-navigation-patterns`, `build-reference`, and `create-c3-op`.
- **`plugin/docs/c3/`** — the shipped C3 platform reference (event-sheet architecture, layouts, scripting, TS integration, the ACE/`aces.json` model, `construct3-guide.md`). `index.md` is both its OKF bundle index and its doc table.
- **`plugin/.claude-plugin/plugin.json`** — the manifest, including the `mcpServers` block declaring both C3 servers (scoped `@genvidtech/*` packages, pinned, launched via `npx -y … server`).

## Conventions

- Commit format observed in history: `{type}: short description` (e.g. `feat:`, `docs:`).
- Top-level frontmatter keys are fixed to `name`, `description`, and Anthropic-supported fields (`model`, `tools`); custom expectations go under `metadata.expects`.
- Keep agent bodies generic across C3 projects — project-specific facts belong in the consuming repo.
- **ADR location: `wiki/decisions/`.** This repo has no `docs/` directory — decision records live in the wiki bundle. `/gvt-dev:create-adr` and `gvt-dev:tech-writer` both read *this line*; without it they fall back to `docs/decisions/` and re-create the directory this repo retired.
- ADRs in `wiki/decisions/` are historical records; sweep the living docs, never the ADRs.
- **New ADRs and new `wiki/process/` contracts must be indexed by hand.** Every `gvt-dev` self-indexer writes to a hard-coded `docs/TOC.md` and skips silently when it is absent, and the audit's orphan scan is inert against an `index.md`-named index — so **nothing will tell you a row is missing**.

Every one of these has a fuller treatment in the wiki — see the table at the top.

## Release status

Releasing is a cross-repo workflow (bump `plugin/.claude-plugin/plugin.json`, move `plugin/CHANGELOG.md`'s Unreleased section, tag, bump the marketplace ref). Use the **`gvt-dev:release-plugin`** skill rather than doing it by hand; it honors `paths.plugin_root` and keeps the marketplace entry on its `git-subdir` source.

**When a release bumps the pinned chef / dm versions, run `/gvt-dev:reconcile-mcp-pin` before tagging** — and read [Verifying an MCP pin bump](wiki/pin-bump-verification.md) first. It covers what `reconcile-mcp-pin` does *not*: the `audit.mjs` discovery-check mirror of `resolveRootFolder`, the count anchors (now carried by that same wiki page), and the ways this verification silently fakes a pass.
