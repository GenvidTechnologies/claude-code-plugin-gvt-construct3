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

The plugin is distributed through the [`claude-code-gvt-marketplace`](https://github.com/GenvidTechnologies/claude-code-gvt-marketplace) catalog (marketplace name `gvt-plugins`). Because the artifact is in a subfolder, the marketplace entry uses a `git-subdir` source with `path: "plugin"`.

> **Why the split:** keeping the artifact in `plugin/` means the gvt-dev consumer files at the root never collide with what ships, and the gvt-construct3 contract (`plugin/CONVENTIONS.md`) is unambiguously distinct from gvt-dev's root-level conventions. A `gvt-dev:audit-conventions --fix` at the root only touches workspace files, never the plugin.

> **Note on `--fix`:** this repo is in gvt-dev **MIGRATED** state (it has `.gvt-agent.json`), so `gvt-dev:audit-conventions --fix` does **not** run the greenfield/legacy scaffolder here. The `.gvt-agent.json` / `wiki/index.md` were hand-tuned — if a future audit reports gaps, prefer editing them by hand over a blanket fixer run.

### Two OKF bundles

`wiki/` (dev-workspace, `ingest`-maintained) and `plugin/docs/c3/` (shipped, hand-maintained against `construct3-sample`) are **both** OKF v0.2 bundles, and they are different tiers. Never fold one into the other — see [`wiki/wiki-schema.md`](wiki/wiki-schema.md).

## Commands

Everything runs from the **repo root**. `commands.validate` in `.gvt-agent.json` is
`node scripts/ci/gate.mjs && claude plugin validate plugin`:

```bash
# Both test suites, floor-asserted (this is what commands.validate and CI both run)
node scripts/ci/gate.mjs

# Validate the plugin manifest + structure (run before any release/PR)
claude plugin validate plugin

# Run a single test by name
cd plugin && node --test --test-name-pattern="semver: higher patch" skills/audit-c3-conventions/scripts/test/audit.test.mjs

# Run the audit validator against a consuming repo (CLAUDE_PLUGIN_ROOT points at plugin/)
node plugin/skills/audit-c3-conventions/scripts/audit.mjs
```

`scripts/ci/gate.mjs` owns the test-count floors — it is the single place they are
written, and `.github/workflows/gate.yml` calls the same script rather than restating
the globs. Don't re-state a floor here; read it from the gate.

`plugin/` carries a `package.json` and a committed `package-lock.json` so the host can
perform a lockfile-gated dependency install. There is still no build step and no lint
config — plain ESM `.mjs` run directly by Node, tests via the built-in `node:test`
runner only, and zero dependencies today.

> **A bare `cd plugin &&` test glob fails *open*, and `commands.validate` no longer carries
> one.** The glob is relative to `plugin/`, so from the repo root it matches nothing, prints
> `tests 0 / pass 0 / fail 0`, and **exits 0** — a green run that verified nothing. That is
> why `commands.validate` now runs `node scripts/ci/gate.mjs` instead: the gate expands the
> glob in Node against an explicit directory and **fails closed on an empty match**, printing
> `files matched: N (floor F)` so a reader can tell "passed" from "ran nothing". The floors
> live in the gate and nowhere else.
>
> The trap still applies to any glob you type by hand — the single-test-by-name recipe above
> included. **Confirm a non-zero test count** rather than reading exit 0 as a pass. Note the
> shell's working directory also persists between tool calls, so a `cd plugin` in one command
> silently changes where the *next* one runs — which is how this usually happens.
>
> **The same persistence has an inverse form that bites git, and one half of it is also
> silent.** Once the shell is *inside* `plugin/`, a path written repo-root-relative no
> longer resolves — and the two shapes fail very differently:
>
> | From inside `plugin/` | Result |
> |---|---|
> | `git commit plugin/CHANGELOG.md …` | `error: pathspec … did not match any file(s) known to git`, **exit 1** — loud, and safe |
> | `git diff --name-only … -- 'plugin/skills/*/…'` | **empty output, exit 0** |
>
> The second is the dangerous one: empty output from a *filtered* `git diff` is
> indistinguishable from "nothing matched the filter" — which is exactly what a
> scope check like *"the diff touches nothing outside `scripts/test/`"* is hoping to
> see. It reads as a pass and proves nothing, the same fail-open shape as the test
> glob above pointing the other way. Prefer absolute paths, or `cd` back to the repo
> root before any `git` command carrying a pathspec. When a filtered `git` command
> returns nothing, confirm the path exists from the current directory before
> believing the emptiness.

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

> **This gate is on *tagging*, not on the bump itself.** A pin bump is routinely planned and landed through `/gvt-dev:plan-task` — that does **not** discharge the obligation above, which still fires before the release is tagged. Two things follow. First, a bump branch merging without `reconcile-mcp-pin` having run is *normal*, not an escape; record in the PR what verification was actually performed so the release step can judge the remainder. Second, when a bump's own planning already did the equivalent work — packed the tarballs, diffed the registration name sets, probed `resources/list` live, discharged the ADR 0007/0009 mirror check — say so explicitly at release time rather than assuming either that it counts or that it doesn't. The skill's runbook and an inline verification can differ in *both* directions: #107's inline pass covered the live resource probe and the mirror escalation, which `reconcile-mcp-pin` does not, while skipping the artifact shape the release history expects.
