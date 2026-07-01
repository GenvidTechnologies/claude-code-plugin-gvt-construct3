# Tool-surface reconciliation (maintainer procedure)

**Run this whenever you bump the pinned `construct3-chef` / `c3-domain-manager`
versions in `plugin/.claude-plugin/plugin.json`.** A server bump can add, rename,
or remove MCP tools, and the agent definitions enumerate those tools by hand —
so the inventories drift unless reconciled.

This is a **dev-workspace** doc: it is not shipped in the `plugin/` subtree. The
artifacts it keeps honest are `plugin/agents/c3-explorer.md` and
`plugin/agents/c3-implementer.md`.

## Why it matters

- **`c3-explorer` has a hard `tools:` allow-list.** Any read tool it does not
  enumerate is *uncallable*. A missing entry is a functional regression, not
  just a doc gap.
- **`c3-implementer` has no `tools:` lock** — it can call anything. Its tool
  lists are documentation only, but stale docs send the agent down wrong paths
  (e.g. hand-picking SIDs because it doesn't know `generate-sids` exists).

Keep the **read / mutate split** correct when reconciling, and stay within the
[knowledge boundaries](../CLAUDE.md) — document tool *names and one-line
purposes*, never project-specific or tooling-schema content (that belongs to the
consuming repo or each server's own docs).

## Procedure

The step-by-step procedure now lives in the **`/genvid-dev:reconcile-mcp-pin`**
skill. Run it on every `construct3-chef` / `c3-domain-manager` pin bump; it stops
short of the release — hand off to `release-plugin` when done.

C3-specific anchors the generic skill needs to know for this repo:

- **Agents reconciled:** `plugin/agents/c3-explorer.md` (hard `tools:` allow-list
  — both frontmatter and body) and `plugin/agents/c3-implementer.md` (docs-only
  tool lists). Respect the read/mutate split when updating either agent.
- **Packages pinned:** `@genvidtech/construct3-chef` and `@genvidtech/c3-domain-manager`
  (in `plugin/.claude-plugin/plugin.json` `mcpServers`).
- **Count sanity-check anchors:** chef's **static** `reg(...)`/`registerTool(...)`
  surface in `dist/mcp/server.js` ≈ **30** (unchanged 0.9.0 → 0.10.1);
  c3-domain-manager ≈ 13. If the skill's surface grep returns **0** or an
  implausibly small set, the registration pattern moved — don't trust a silent zero.
- **Ops tools live outside `server.js` (since chef 0.10.0, #89).** The user-defined-ops
  surface — the static `list-ops` tool plus dynamically-registered `op-<name>` tools
  (one per file in the project's `ops/` dir, hot-reloaded) — is registered in
  **`dist/mcp/opsRegistry.js`** via `server.registerTool`, *not* in `server.js`. So a
  `server.js`-only `reg`/`registerTool` grep will **diff empty for an ops bump** even
  though the surface grew. When a bump's release notes mention ops, grep
  `opsRegistry.js` too (the names and their `READ_ONLY`/`MUTATE` annotations are
  there). `list-ops` is `READ_ONLY` (→ `c3-explorer` allow-list); `op-<name>` is
  `MUTATE` and dynamic (→ `c3-implementer` docs only, documented as a class — the names
  are not fixed, enumerate via `list-ops`).
- For grounding new skills or platform docs in chef's actual source (not just
  reconciling tool names), see [`docs/grounding-in-chef-behavior.md`](grounding-in-chef-behavior.md).

## Ground-truth cross-check

`genvid-holdings/burbank` is the real embedded consumer. Its
`.claude/settings.json` allow-list (entries prefixed
`mcp__plugin_gvt-construct3_<server>__<tool>`) is a useful sanity check on which
tools are actually exercised in practice — but it is a *subset* (only what that
project has needed), so treat the package's `registerTool` list as authoritative
for completeness and burbank as confirmation of real usage.
