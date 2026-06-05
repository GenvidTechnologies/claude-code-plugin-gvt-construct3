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

1. **Get the authoritative tool surface** straight from each pinned package's
   compiled server, not from memory or READMEs (READMEs drift too):

   ```bash
   cd "$(mktemp -d)"
   npm pack @genvid/construct3-chef@<pinned> @genvid/c3-domain-manager@<pinned>
   for t in *.tgz; do tar -xzf "$t"; done

   echo "=== construct3-chef ==="
   grep -oE 'registerTool\(\s*"[a-z0-9-]+"' package*/dist/mcp/server.js 2>/dev/null \
     | sed -E 's/.*"([a-z0-9-]+)"/\1/' | sort -u
   ```

   (Run the same `grep` against the c3-domain-manager `package/dist/mcp/server.js`.
   The tool name is the first argument to `registerTool(...)`.)

   To also pull each tool's `description` / `readOnlyHint` for classification,
   walk the `registerTool("name", { ... },` blocks with a small Node script —
   see the git history of issue #4 for the one-off used last time.

2. **Diff against the agents.** Compare the surface to:
   - `c3-explorer` — its `tools:` frontmatter (the `mcp__<server>__<tool>` entries)
     **and** the "MCP Tools Available" body list. The explorer gets the **entire
     non-mutating surface** (reads, lists, reports, and the non-mutating helpers
     `validate-project` / `generate-sids` / `get-state`).
   - `c3-implementer` — the "MCP Tools" + "Template & layer mutations" +
     "Domain-config maintenance" body lists. It gets the **mutations** plus the
     reads its recipe workflow uses.

3. **Reconcile** any genuinely added / renamed / removed tool:
   - Added read → add to `c3-explorer` (frontmatter **and** body) and, if
     mutation-flow-relevant, to `c3-implementer`'s reading list.
   - Added mutation → document in `c3-implementer` under the right subsection.
   - Renamed / removed → update or delete the stale entry in **both** agents.

4. **Validate & record:**
   ```bash
   cd plugin && claude plugin validate .
   ```
   Add a CHANGELOG entry under `plugin/CHANGELOG.md` → `[Unreleased]` for any
   agent-facing change (the agents ship; this doc does not).

## Grounding skill/doc design in chef behavior

The same `npm pack` move is the fastest way to **ground new genvid-c3 content in
how chef actually behaves** — not just to diff the tool surface. Whenever a skill
or a platform doc depends on chef's runtime semantics (how a value renders in the
DSL, what a config field means, which capture group wins, whether a feature is an
MCP tool or a CLI subcommand), pull the pinned package and read the source of
truth instead of guessing:

```bash
cd "$(mktemp -d)"
npm pack @genvid/construct3-chef@<pinned>
tar -xzf *.tgz
# algorithms / semantics:
ls package/dist/**          # e.g. dist/c3/navConvention.js, dist/c3/chefConfig.d.ts
# config + CLI reference:
sed -n '1,80p' package/docs/cli.md
```

Worked example: the `author-navigation-patterns` skill's design questions —
capture-group contract (group 1 = target), `definitionMarkers` semantics
(substring `line.includes`, bad regex dropped not thrown), and "is `navigation-graph`
an MCP tool?" (no — CLI-only) — were all answered from `dist/c3/navConvention.js`
+ `docs/cli.md`, which is what let the skill's preview helper mirror chef's
`resolveNavConvention` exactly. Read the package, don't infer from memory or READMEs.

## Ground-truth cross-check

`genvid-holdings/burbank` is the real embedded consumer. Its
`.claude/settings.json` allow-list (entries prefixed
`mcp__plugin_genvid-c3_<server>__<tool>`) is a useful sanity check on which
tools are actually exercised in practice — but it is a *subset* (only what that
project has needed), so treat the package's `registerTool` list as authoritative
for completeness and burbank as confirmation of real usage.
