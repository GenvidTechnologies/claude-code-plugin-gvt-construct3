# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This repository develops the **`gvt-construct3` Claude Code plugin** — not application code. The plugin packages Construct 3 (C3) domain knowledge for Claude Code: two agents, one audit skill, the canonical C3 platform reference (`plugin/docs/c3/`), and its `plugin.json` `mcpServers` declaration for the `construct3-chef` and `c3-domain-manager` MCP servers. The plugin is **independent of the `gvt-dev` plugin** and installs on its own.

### Repo layout — artifact vs. workspace

The repo is split in two on purpose:

- **`plugin/`** — the **shipped artifact**. `plugin/.claude-plugin/plugin.json` is the manifest; everything a consumer installs lives under here (`plugin/agents/`, `plugin/skills/`, `plugin/docs/c3/`, `plugin/CONVENTIONS.md`, `plugin/CHANGELOG.md`). The marketplace installs this subtree, so `${CLAUDE_PLUGIN_ROOT}` resolves to `plugin/`.
- **repo root** — the **dev workspace**, which *consumes* the `gvt-dev` plugin. `.gvt-agent.json` (`commands.validate`, `repo.*`, `paths.plugin_root`) and `docs/TOC.md` exist so the gvt-dev workflow skills (audit, plan-task, rebase, release-plugin, etc.) work here. This `CLAUDE.md` is dev guidance for the workspace; it is **not** shipped.

The plugin is distributed through the [`claude-code-marketplace`](https://github.com/genvid-holdings/claude-code-marketplace) catalog (marketplace name `genvid-plugins`). Because the artifact is in a subfolder, the marketplace entry uses a `git-subdir` source with `path: "plugin"`.

> **Why the split:** keeping the artifact in `plugin/` means the gvt-dev consumer files at the root (and any future CI/dev tooling) never collide with what ships, and the gvt-construct3 contract (`plugin/CONVENTIONS.md`) is unambiguously distinct from gvt-dev's root-level conventions. A `gvt-dev:audit-conventions --fix` at the root only touches workspace files, never the plugin.

<!-- -->

> **Note on `--fix`:** this repo is in gvt-dev **MIGRATED** state (it has `.gvt-agent.json`), so `gvt-dev:audit-conventions --fix` does **not** run the greenfield/legacy scaffolder here. Still, the `.gvt-agent.json` / `docs/TOC.md` were hand-tuned for this repo — if a future audit reports gaps, prefer editing them by hand over a blanket fixer run.

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

**c3source — the typed on-disk model — is a knowledge home too, but not one the agents read.** `@genvidtech/c3source` (which `construct3-chef` *adopts*) is the TypeScript model of C3's folder-project JSON and the home of the DSL renderer (`extractEventSheetScripts`). A fact about C3's on-disk *format* (e.g. the numeric `comparison` combo enum) can feel like it belongs to c3source's typed model — but it still goes in `plugin/docs/c3/`, because the agents read those docs and inspect **raw** event-sheet JSON at runtime; they never import c3source's types. c3source is the right home only for the complementary *code-facing* typed model (a `ComparisonOperator` enum, a renderer that annotates the symbol) — file that as a c3source issue. **Misattribution caveat:** the DSL renderer lives in c3source, not chef, so an issue saying "chef's renderer emits X" usually means c3source's.

### Components

- **`plugin/agents/*.md`** — flat Markdown files with YAML frontmatter, dispatched as `subagent_type: "gvt-construct3:<name>"`.
  - `c3-explorer` (model: `haiku`) — strictly read-only recon. Its `tools:` frontmatter explicitly enumerates the read-only MCP tools it may call.
  - `c3-implementer` (model: `opus`) — all C3 mutations via the recipe system. TypeScript *modules* are out of scope (it hands cross-domain edits back to the orchestrator); it does write TS embedded in eventSheet script actions.
- **`plugin/skills/<name>/SKILL.md`** — a skill is a directory containing `SKILL.md` plus any scripts. Invoked as `/gvt-construct3:<name>`. Four skills exist: `audit-c3-conventions` (the contract validator), `author-navigation-patterns` (authors/validates a chef `navigation.targetPatterns` convention), `build-reference` (produces chef's `c3-reference` cache — built-in plugin ACEs + concept chunks — that chef's `search-docs` tool reads), and `create-c3-op` (authors/dry-run-validates a chef user-defined op wrapper — params + `{{PARAM}}` placement — via `list-ops` / `apply-op --dry-run`).
- **`plugin/docs/c3/`** — the platform reference (event-sheet architecture, layouts, scripting, TS integration, the ACE/`aces.json` metadata model in `ace-reference.md`, `construct3-guide.md`).
- **`plugin/.claude-plugin/plugin.json`** — the manifest, including the `mcpServers` block that declares both C3 servers (scoped `@genvidtech/*` packages, pinned, launched via `npx -y … server`).

> **Pattern — a skill that authors a tool's config** (e.g. `author-navigation-patterns`): mirror the tool's algorithm only against its **documented contract**, defer the field-level schema to the tool's own docs (`construct3-chef://docs`), and treat the **tool's own output as the authoritative validator** (`navigation-graph`) — any bundled helper script is a fast *preview* that must agree with, not replace, that output. Pin the mirrored logic to ground truth from the package source (see [`docs/grounding-in-chef-behavior.md`](docs/grounding-in-chef-behavior.md)).
>
> **Pattern — a skill that *produces a data cache the tool reads*** (e.g. `build-reference` → chef's `c3-reference` cache, validated by `search-docs`): same preview-vs-authoritative-validator rule, plus an extra obligation — **ground the *dataflow*, not just the schema, in the tool's source before designing.** Check whether the tool already generates or merges part of that data itself, so the skill doesn't duplicate it. chef's `lookup()` reads `addons/*/aces.json` **live** and concatenates it with the cache's `aces` (no dedup), so the cache must hold **built-in/manual ACEs + chunks only** — writing `source:"addon"` entries into it double-counts every one. This near-miss is why the grounding step reads the tool's *ingestion path*, not only its schema.

### The convention contract & the audit (`plugin/skills/audit-c3-conventions/`)

This is the most code-heavy part of the repo. The plugin defines a *contract* a consuming repo must satisfy (a C3-project marker + both MCP servers reachable at minimum versions), and the audit script verifies it.

The contract is **data-driven**: each skill/agent declares its needs under `metadata.expects.{files,config,tools,mcp}` in its frontmatter. The audit script (`scripts/audit.mjs`) walks every `SKILL.md` and `agents/*.md` under `${CLAUDE_PLUGIN_ROOT}`, collects their `expects` entries, evaluates each against the current working directory, and prints a Markdown report grouped by severity. **To add a new requirement, add an `expects` entry to the relevant component's frontmatter — do not hard-code checks in the script.** Two things are the deliberate exceptions, baked into `audit.mjs` directly because they are *inexpressible* as `expects` entries: the C3-project marker (a bespoke OR-check across three indicators), and the **discovery check** — a small family that mirrors how `c3-domain-manager` resolves its root, all derived from one shared `project.c3proj` filesystem enumeration (`scanC3ProjectMarkers`). The discovery check emits two advisory findings: an **ambiguity `warning`** (≥2 sibling `project.c3proj` dirs → the server aborts at startup with `-32000`; added in ADR `docs/decisions/0006-detect-discovery-ambiguity.md`) and a **root-divergence `info`** (the `paths.c3project` root differs from what bare auto-discovery would pick → the server may run on a different project than the audit validated; added in #49, extending 0006 with no new ADR). Both are *enumerations/counts*, which the `expects` model can't represent; both stay within the presence/reachability boundary (they enumerate directories and read config keys, never parse `.c3proj` contents); and suppression honors an explicit root pin — a workspace-root `.mcp.json` `--project-dir`/`env.C3_PROJECT_DIR` override on the `c3-domain-manager` entry, or a live `C3_PROJECT_DIR` env var. The ambiguity finding introduced the report's **`warning`** severity tier — advisory, sits between `error` and `info`; neither finding changes the exit code (only an `error` exits non-zero).

**Validation boundary — presence/reachability here, data-content validation in chef.** The audit only validates **contract presence/reachability**: does a required file/config/tool/MCP server exist and resolve. That is the entire reach of the `expects` model. **Data-content cross-validation** of a C3 project or addon (e.g. an addon's `aces.json` ↔ its `lang/*.json` strings) is *not* expressible as an `expects` entry — it parses and cross-references file *contents* — and does **not** belong in `audit.mjs`. Such checks live in **construct3-chef** (the authoritative tool the plugin's skills defer to — see "Validate against the real tool"), and the plugin's role is to *recommend/run* the chef tool, not reimplement it. Precedent: the aces↔lang check proposed as #31 was relocated to `construct3-chef#98` (`validate-addon`) for exactly this reason — same family as #32 (bundled-`.c3addon` validation), which already names chef as the home.

`files`/`config` expects resolve against the **repo root** by default; an entry tagged **`base: project`** resolves against the **C3 project root** instead — derived from `.gvt-agent.json` `paths.c3project` (its `dirname`), falling back to the repo root when absent. This is how the audit checks a *non-rooted* project (C3 project in a subdirectory): e.g. `domain-config.json` and `construct3-chef.config.json` are `base: project` because they live alongside the `.c3proj`, while `.gvt-agent.json` itself stays repo-root-relative. Rooted repos (no `paths.c3project`) are unaffected — `base` is just another data-driven `expects` field, not a script-level check (see ADR `docs/decisions/0005-non-rooted-c3-project-support.md`).

Supporting libs (`scripts/lib/`):

- `frontmatter.mjs` — a *minimal* hand-rolled YAML parser scoped to the exact frontmatter shapes used (top-level scalars, one level of nesting for `metadata.expects`, arrays of objects). It does **not** handle multiline scalars, anchors, or deep nesting — keep frontmatter within those shapes or replace the parser.
- `config-resolve.mjs` — resolves dotted keys (`features.c3`) against parsed JSON, reporting *where* a path broke.

MCP probing: reachability is confirmed by running `npx -y <package> --version` for the **scoped** package (`@genvidtech/construct3-chef`), since npx resolves by package name — `npx construct3-chef` would 404. Both CLIs currently report version as "unknown", so the authoritative version comes from walking `node_modules` for the backing package's `package.json` (`resolvePackageVersion`). The `package:` field in an `mcp` expects entry names that package.

Audit exit codes: `0` all required expectations met, `1` an error finding, `2` unexpected script error.

## Conventions for editing this repo

- Top-level frontmatter keys are fixed to `name`, `description`, and Anthropic-supported fields (`model`, `tools`). **Custom expectations go under `metadata.expects`** — never invent new top-level keys, or `claude plugin validate` and downstream tooling will choke.
- Keep agent bodies generic across C3 projects. Anything project-specific belongs in the consuming repo, not here (see knowledge boundaries above).
- **Before slimming, moving, or deleting a doc section, grep for deep-links into its heading.** CLAUDE.md (and other docs) cross-reference *specific sections*, not just files — e.g. a callout once deep-linked `tool-surface-reconciliation.md → "Grounding skill/doc design in chef behavior"`. A naive "slim this doc" edit can silently break such a link by removing the target heading; check `grep -rn "<section title>"` and repoint the referrer in the same commit as the move.
- **The code-reviewer recurrently over-escalates valid-but-unusual Markdown to "critical" — verify against the spec before accepting the severity.** Two data points: a *spaced em-dash anchor* (#36) and a *double-backtick code span* embedding literal backticks (#42, ``` ``…`x`…`` ```). Both render fine per CommonMark/`github-slugger`; both were flagged "critical." When the reviewer calls a Markdown-rendering concern critical, treat it as *suggestion pending verification*: confirm against the real tool, not by eye. Specifics worth keeping:
  - **GitHub heading anchors don't collapse runs of `-`.** A *spaced* em-dash heading — e.g. `### JSON Plugin set-json Parses Async — Signal from on-parse-success` — slugs to `…async--signal…` (**double** hyphen): `github-slugger` strips the `—` but keeps both surrounding spaces, each becoming a `-`. Keep the `--` when deep-linking; verify uncertain anchors by `npx`-installing `github-slugger` and slugging the heading.
  - **Double backticks are the correct way to embed a literal `` ` `` in a code span** (CommonMark strips the padding space). Not "malformed."
- **ADRs (`docs/decisions/`) are historical records — don't retroactively rewrite them.** When a rename or refactor lands, sweep the *living* docs (README, this `CLAUDE.md`, `docs/*.md`) but leave the ADRs untouched; precedent is commit `2400b62` renaming the plugin `genvid-c3` → `gvt-construct3` without editing ADR 0004's `genvid-c3` references (and this session's `genvid-dev` → `gvt-dev` sweep likewise skipped `docs/decisions/`). If a decision is genuinely reversed, add a *superseding* ADR rather than editing the old one in place.
- **Respect each agent's capability envelope (`model` + `tools`).** Don't instruct an agent to do what it can't observe. `c3-explorer` is `haiku` and reads layout/addon JSON, *not pixels* — so its swap-recon guidance reports observable geometry (size, origin/anchor, frame inventory) and hands visual-silhouette judgment back to a human, rather than claiming to compare shapes. When adding guidance, write the observable-data steps and explicitly flag anything that needs a capability the agent lacks.
- Commit format observed in history: `{type}: short description` (e.g. `feat:`, `docs:`).
- **Closing issues from PRs:** the repo's squash-title style appends bare `(#N)` references (e.g. `feat: … (#6) (#9)`), which only *cross-reference* — they do **not** auto-close. To close an issue on merge, put a closing keyword (`Closes #N` / `Fixes #N`) in the **PR body**; otherwise close it by hand after release (issue #6 stayed open through v1.2.0 for exactly this reason).
- **Relocating/deferring an issue to another repo: file it there *and* cross-link both ways.** Several issues here belong to `construct3-chef` (the authoritative tool — content-validation, addon tooling). An issue that merely *names* another repo as its "implementation home" is **not** tracked there, and that gap is silent — a deferred item falls through the crack between repos. Precedent: #31→chef#98 was relocated correctly (issue filed, both sides linked); #32 named chef as its home but **no chef issue existed** until chef#100 was filed in a later session — and a memory had wrongly assumed it was tracked. When you defer, open the target-repo issue *in the same session* and comment the link back on the origin issue, so the linkage is bidirectional.
- **When you keep an origin-side umbrella for a deferred issue, label it `blocked-upstream`.** A deferred-to-chef issue that stays open here as the plugin-side "recommend/run" tracker (e.g. #32, blocked on chef#100) otherwise looks *plannable*: triage and `plan-next-issue` can only discover the block by reading its comments, and it keeps surfacing as a ranking candidate. The `blocked-upstream` label (created in this repo) marks that state mechanically, so triage/ranking de-prioritize it without comment-diving. Apply it in the same session you file the target-repo issue; drop it once the upstream ships and the origin-side follow-up becomes actionable.
- **Adding a skill touches more than its own directory — update every inventory.** A skill's existence is recorded in several hand-maintained places that drift silently (e.g. `build-reference` shipped in #19 but was missing from both shipped inventories until a later retro). When you add `plugin/skills/<name>/`, also update: the **README skill table**, the **`plugin/CONVENTIONS.md` skill table** (the shipped contract — consumers read it), the **skill list in this `CLAUDE.md`** (under Components), and **`plugin/CHANGELOG.md`**. Prefer non-counted phrasing ("skills include…") over "N skills exist" so a hardcoded count can't go stale. (`docs/TOC.md` needs nothing — it points at the README for the inventory.)
- **Skill scripts split a pure transform (lib) from a thin I/O CLI.** Keep logic in a pure `scripts/lib/*.mjs` module (no `fs` / `process` / network — just functions) with fixture-based `node:test` coverage at `scripts/test/*.test.mjs`, and a thin CLI (`scripts/*.mjs`) that owns arg-parsing + I/O and calls the lib. `build-reference` ships three such pairs (`lib/reference-index.mjs`+`build-index.mjs`, `lib/cdn-aces.mjs`+`fetch-aces.mjs`, `lib/merge.mjs`+`merge.mjs`). **A script that fetches the network must also expose an offline path** (e.g. `fetch-aces.mjs --input <file>`) so the transform is exercisable in CI without network — the live fetch stays human-validated, the pure transform stays unit-tested.
- **A skill's remediation prose must not describe a check the audit doesn't yet implement.** `audit-c3-conventions`'s SKILL.md "Act on findings" bullets are user-facing remediation for checks `audit.mjs` actually runs — don't write aspirational guidance for behavior a *future* PR will add. Precedent: #47's SKILL.md told users to "pin `--project-dir` via a workspace `.mcp.json`" to suppress the ambiguity warning, but the shipped code only honored the `C3_PROJECT_DIR` env var — the `.mcp.json` suppression wasn't built until #49, a full release later. For that whole window the doc was a silent false claim. When you add or edit an "Act on findings" bullet, verify each remediation path against the checks actually present in `audit.mjs`; if a remediation only works once a not-yet-written check exists, it belongs in the issue/plan for that check, not in the shipped skill.

## Release status

Releasing a new version is a cross-repo workflow (bump `plugin/.claude-plugin/plugin.json`, move `plugin/CHANGELOG.md`'s Unreleased section, tag, bump the marketplace ref). Use the `gvt-dev:release-plugin` skill rather than doing it by hand.

**When a release bumps the pinned `construct3-chef` / `c3-domain-manager` versions in `mcpServers`, run `/gvt-dev:reconcile-mcp-pin`** before tagging — a server bump can add/rename/remove MCP tools, and the agents enumerate those by hand. See [`docs/tool-surface-reconciliation.md`](docs/tool-surface-reconciliation.md) for the C3-specific anchors (agent allow-lists, package names, surface counts). (`c3-explorer`'s `tools:` is a hard allow-list, so a missed read tool becomes uncallable — this is a functional check, not just docs.) A `c3-domain-manager` bump has a **second re-grounding surface** `reconcile-mcp-pin` does not cover: `audit.mjs`'s discovery check hand-mirrors `@genvidtech/mcp-utils`'s `resolveRootFolder` semantics (see ADR 0006) — `classifyDiscovery`/`checkDiscoveryAmbiguity` (the ambiguity + suppression-precedence: explicit `--project-dir` > env `C3_PROJECT_DIR` > discovery), `resolveDiscoveryPick` (the depth-1 pick derivation), and `resolveMcpProjectDirOverride` (the `.mcp.json` override semantics), the latter two added in #49. That's script *logic*, not an agent tool list, so a bump that changes discovery/override behavior silently breaks the mirror — re-verify all of it against the new `resolveRootFolder` when bumping dm.

`gvt-dev:release-plugin` (≥ 2.8.0) honors `paths.plugin_root`, so it operates on `plugin/.claude-plugin/plugin.json` and `plugin/CHANGELOG.md` and keeps the marketplace entry on its `git-subdir` source (`path: "plugin"`). The `url`→`git-subdir` migration already happened at v1.1.0; steady-state releases are a single-value `source.ref` bump (gvt-dev#28, resolved).
