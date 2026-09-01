# gvt-construct3 Plugin Conventions

This document is the contract between the `gvt-construct3` Claude Code plugin and the repositories that install it. Unlike a generic workflow plugin, `gvt-construct3` is **domain-specific**: it only applies to repositories that contain a **Construct 3 project** and have the **construct3-chef** and **c3-domain-manager** MCP servers available.

`gvt-construct3` is **independent of the `gvt-dev` plugin** — it ships its own convention contract and its own audit (`audit-c3-conventions`). It does not depend on gvt-dev being installed.

## What a consuming repo must provide

| Requirement | How it's satisfied | Checked by |
|-------------|--------------------|------------|
| **A C3-project marker** | `project.c3proj` at the repo root, **or** `.gvt-agent.json` with `features.c3: true`, **or** `.gvt-agent.json` `paths.c3project` pointing at the `.c3proj` file (the legacy `.genvid-agent.json` is still accepted, with a deprecation warning, during the transition) | `audit-c3-conventions` |
| **construct3-chef MCP server** | Launched as `npx -y @genvidtech/construct3-chef server`, version ≥ `1.2.0` | `audit-c3-conventions` |
| **c3-domain-manager MCP server** | Launched as `npx -y @genvidtech/c3-domain-manager server`, version ≥ `0.6.1` | `audit-c3-conventions` |

The plugin **declares both servers in its `plugin.json`** (`mcpServers`), so they start automatically when `gvt-construct3` is enabled. Bundled plugin servers may install as **"Pending approval"** — approve them once in Claude Code. If the consuming repo also wires these servers in its own `.mcp.json`, that is redundant but harmless.

## Recommended: validate bundled addons in your validation chain

If your project bundles its addons (`.c3addon` packages committed under `addons/`,
alongside `project.c3proj`'s `usedAddons` entries), add construct3-chef's
`validate-addons` to whatever chain already runs your checks — `commands.validate`
in `.gvt-agent.json`, a CI step, or an npm script:

```bash
npx -y @genvidtech/construct3-chef validate-addons
```

It is a subcommand of the **same package the plugin already pins**, so it needs no
extra dependency. It is **read-only**, and it **exits non-zero when it reports
findings**, so it chains with `&&` like any other check. It reports:

- **Package integrity** — unreadable/malformed archives, LFS pointers committed in
  place of the real file, missing required entries, id/filename mismatches.
- **Metadata drift** against `project.c3proj`'s `usedAddons` — the version skew
  `validate-project` does *not* catch, because that checks the file manifest rather
  than addon-version consistency.
- **Orphan / missing / duplicate** packages.
- **`aces.json` and `properties` against each addon's `lang/*.json`** — the
  ACE-vs-strings consistency check.

Pass `--addon <id-or-path>` to scope it to a single addon.

Adding it unconditionally is safe: on a project that does not bundle addons it
finds nothing and exits `0` (the missing-package pass only considers `usedAddons`
entries marked `bundled: true`). Requires `construct3-chef ≥ 1.0.0`.

For the *interactive* side of this surface — inventory (`list-addons`), an addon
upgrade's breaking surface (`diff-addon-aces`), and its call-site blast radius
(`scan-addon-usage`) — reach for the `c3-explorer` agent, whose body documents when
each applies. Those are recon tools, not gate checks, and `diff-addon-aces` /
`scan-addon-usage` are MCP-only; they have no CLI subcommand.

> The plugin **recommends and runs** this tooling; it never reimplements it. Addon
> content validation lives in construct3-chef, the authoritative tool — the plugin's
> own `audit-c3-conventions` deliberately stays limited to contract
> presence/reachability. See [Knowledge boundaries](#knowledge-boundaries).

## Optional, project-owned context the plugin's agents read at runtime

The genericized agents read project-specific conventions from the **consuming repo's `CLAUDE.md`** when present (they are not baked into the plugin):

- **Commit format** — the agents fall back to `{type}: Description` if the repo doesn't specify one.
- **Cross-domain / two-commit rules** — when a C3 change requires editing TypeScript modules, the agents hand back to the orchestrator; how the project splits those commits is read from its `CLAUDE.md`.
- **Project-specific C3 gotchas & provenance** — keep these in a project-owned doc (e.g. `docs/c3-project-gotchas.md`); the generic platform rules live in this plugin's `docs/c3/`.

### If your repo keeps an LLM-wiki

A consuming repo that maintains a wiki via `/gvt-dev:maintain-wiki` can host its project-specific C3 knowledge there instead of (or alongside) `CLAUDE.md`. Both agents support this — no configuration beyond the block you already declare:

```jsonc
// .gvt-agent.json
"wiki": { "wikiDir": "wiki", "rawDir": "raw" }
```

When that block is present, the agents read `<wikiDir>/index.md` first and open only the page whose frontmatter `description` matches the question, rather than grepping the tree. `<rawDir>/` is treated as **provenance only** — consulted to check where a claim came from, never as a first-line source. **Neither agent ever writes to either directory**; authoring wiki content is `maintain-wiki ingest`'s job.

The block is entirely optional. `audit-c3-conventions` reports it at **`info`** severity when absent — a discoverability note, never an error, and it does not affect the exit code. `CLAUDE.md` remains the default home for project facts.

**This plugin's own `docs/c3/` is an OKF v0.2 bundle too** — `docs/c3/index.md` is its bundle index and doc table, and every doc carries `type`/`title`/`description`/`tags` frontmatter. So a wiki-aware consumer can route over the platform reference the same way it routes over its own pages.

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
| `author-navigation-patterns` | Authors and validates a construct3-chef `navigation.targetPatterns` / `definitionMarkers` convention for a project that navigates through a wrapper function: inspects the extracted DSL, proposes the capture-group regex, previews captures/skips, and validates against `navigation-graph`. Its capability landed in `construct3-chef ≥ 0.7.0`, but it declares `≥ 1.2.0` in its own `metadata.expects` — subsumed by the baseline `≥ 1.2.0` floor. |
| `build-reference` | Produces construct3-chef's `c3-reference` cache (built-in plugin ACEs + layout/scripting/Expression concept chunks) so `search-docs` resolves built-ins, not just custom-addon ACEs. Its capability landed in `construct3-chef ≥ 0.9.0`, but it declares `≥ 1.2.0` in its own `metadata.expects` — subsumed by the baseline `≥ 1.2.0` floor. |
| `create-c3-op` | Authors and dry-run-validates a construct3-chef user-defined op (a parameterized recipe template): elicits typed params, places `{{PARAM}}` tokens, writes the op-file wrapper, and validates via `list-ops` + `apply-op --dry-run`. Authors the op wrapper only (recipe body defers to chef's docs + `c3-implementer`) and never runs a writing `apply-op`. Its capability landed in `construct3-chef ≥ 0.10.0`, but it declares `≥ 1.2.0` in its own `metadata.expects` — subsumed by the baseline `≥ 1.2.0` floor. |

**Bundled docs** (`docs/c3/`): the canonical **C3 platform reference** — event-sheet architecture, layouts, scripting, TS integration, and `construct3-guide.md`. Agents reference these via `${CLAUDE_PLUGIN_ROOT}/docs/c3/*`.

**Bundled MCP servers** (`plugin.json` `mcpServers`): declares the `construct3-chef` and `c3-domain-manager` servers, pinned to their tested versions.

## Knowledge boundaries

`gvt-construct3` owns **C3 platform reference** (how Construct 3 itself behaves). It deliberately does **not** duplicate:

- **Tooling reference** (recipe format, generators, CLI, recipe gotchas) — that lives in the `construct3-chef` server's `docs:///index` resource, versioned with the tool it describes.
- **Project-specific facts** (named layouts, file paths, commit format, project gotchas) — those live in the consuming repo.

### Naming the docs resource

Name chef's documentation resource as the pair: the `construct3-chef` server and its
`docs:///<path>` URI (e.g. `docs:///index`, `docs:///reference/cli`). Every file that
names a `docs:///` URI names `construct3-chef` at or before its first occurrence,
because `c3-domain-manager` also registers the `docs` scheme and a bare URI is
ambiguous between the two bundled servers. See ADR 0013
(`wiki/decisions/0013-addressing-the-chef-docs-resource-by-server-and-uri.md`).

## Forking and adapting

The plugin is generic across Construct 3 projects but specific to the C3 domain. If your org's C3 workflow differs, fork the repo and edit the agent/skill bodies directly. The contract above is intentionally small — a marker plus two MCP servers.
