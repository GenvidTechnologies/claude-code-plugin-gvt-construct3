# claude-code-plugin-genvid-c3

The **`genvid-c3` plugin** for Claude Code — Construct 3 platform knowledge, C3 agents, and a convention audit for any repository with a Construct 3 project on disk.

It bundles the **construct3-chef** and **c3-domain-manager** MCP servers, ships the `c3-explorer` and `c3-implementer` agents, and owns the canonical **C3 platform reference** (`plugin/docs/c3/`). It is **independent of the `genvid-dev` plugin** — installable on its own.

It is distributed through the [`claude-code-marketplace`](https://github.com/genvid-holdings/claude-code-marketplace) catalog (marketplace name `genvid-plugins`).

## Install

```text
/plugin marketplace add https://github.com/genvid-holdings/claude-code-marketplace.git
/plugin install genvid-c3@genvid-plugins
```

The plugin declares `construct3-chef` and `c3-domain-manager` in its `plugin.json` (`mcpServers`), so they start when the plugin is enabled. They may appear as **"Pending approval"** — approve them once.

Then verify the repo satisfies the contract:

```text
/genvid-c3:audit-c3-conventions
```

The audit checks for a **C3-project marker** and that both MCP servers are reachable at their minimum versions.

## What the plugin provides

**Agents** (dispatched via `subagent_type: "genvid-c3:<name>"`):

| Agent | Model | Purpose |
|-------|-------|---------|
| `c3-explorer` | haiku | Read-only C3 recon — DSL, layouts, domain index, search |
| `c3-implementer` | opus | C3 mutations via recipes, layout/sprite scaffolding, project sync |

**Skill** (invoked as `/genvid-c3:<name>`):

| Skill | Purpose |
|-------|---------|
| `audit-c3-conventions` | Read-only validator — C3-project marker + MCP server reachability/versions |

**Bundled docs** (`plugin/docs/c3/`): the canonical **C3 platform reference** — event-sheet architecture, layouts, scripting, TS integration, and `construct3-guide.md`. The agents link these via `${CLAUDE_PLUGIN_ROOT}/docs/c3/*`.

**Bundled MCP servers** (`plugin.json` `mcpServers`): `construct3-chef` (recipes, DSL, scaffolding, `construct3-chef://docs`) and `c3-domain-manager` (domain index, overrides).

## The convention contract

`genvid-c3` requires a consuming repo to be a Construct 3 project with the two MCP servers available. The full contract — including the optional, project-owned context the agents read from your `CLAUDE.md` — is documented in [`plugin/CONVENTIONS.md`](plugin/CONVENTIONS.md).

## Knowledge boundaries

- **C3 platform reference** (how Construct 3 behaves) → this plugin (`plugin/docs/c3/`).
- **Tooling reference** (recipe format, generators, CLI, recipe gotchas) → `construct3-chef://docs`, versioned with the tool.
- **Project-specific facts** (named layouts, file paths, commit format, project gotchas) → the consuming repo.

## Contributing

The shipped plugin lives in the **`plugin/`** subfolder; the repo root is the dev workspace (a `genvid-dev` consumer). See [`CLAUDE.md`](CLAUDE.md) for the full layout.

- Skills are directories with `SKILL.md`; agents are flat `.md` files in `plugin/agents/`.
- Top-level frontmatter is fixed (`name`, `description`, plus Anthropic-supported fields); custom expectations go under `metadata.expects`.
- Validate with `cd plugin && claude plugin validate .`.
- Test the audit with `cd plugin && node --test skills/audit-c3-conventions/scripts/test/*.test.mjs`.
