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
   # chef may wrap registerTool in a local helper — 0.8.0+ registers via a
   # `reg("name", …)` wrapper that calls `server.registerTool(...)`. Match both
   # the direct call and a one-arg wrapper so the grep survives that refactor:
   grep -ohE '(registerTool|reg)\(\s*"[a-z0-9-]+"' package*/dist/mcp/server.js 2>/dev/null \
     | sed -E 's/.*"([a-z0-9-]+)"/\1/' | sort -u
   ```

   (Run the same `grep` against the c3-domain-manager `package/dist/mcp/server.js`.
   The tool name is the first argument to `registerTool(...)` — or to whatever
   one-arg helper wraps it.)

   **Sanity-check the count before trusting the diff.** chef exposes ~28+ tools;
   c3-domain-manager exposes ~13 (12 before the `0.4.0` `validate-editor` addition).
   If the grep returns **0** or an implausibly small set, the registration pattern
   changed (moved behind a differently-named wrapper, or into another module under
   `dist/`) — open `server.js` and find how `registerTool` is actually invoked,
   then widen the pattern. A silent zero reads as *"every tool was removed,"* which
   is exactly the wrong conclusion (this bit the 0.7.0→0.8.0 bump, when the direct
   `registerTool("name"` grep matched nothing because 0.8.0 had moved to `reg(...)`).

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

3.5. **Sweep stale pinned-version strings.** Reconciling the allow-lists is not
   enough — the *old* pinned version is also written into agent/doc prose, and it
   drifts every bump if you don't sweep it (the 0.6.0→0.7.0 bump fixed the
   allow-lists but left the bodies reading `@0.6.0`, and the CHANGELOG even claimed
   otherwise). After bumping, grep the plugin subtree for the **old** version and
   update every prose occurrence:

   ```bash
   grep -rn '@0\.7\.0' plugin/agents plugin/docs   # ← the version you bumped FROM
   ```

   Known homes: `plugin/agents/c3-explorer.md` body, `plugin/agents/c3-implementer.md`
   body, `plugin/docs/c3/toolchain-config.md` example. **Do not** sweep the
   `minVersion` floors in `plugin/skills/*/SKILL.md` — those are deliberate floor
   decisions, not the pin (a pin bump is not a floor bump).

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
an MCP tool?" — were all answered from `dist/c3/navConvention.js` + `docs/cli.md`,
which is what let the skill's preview helper mirror chef's `resolveNavConvention`
exactly. Read the package, don't infer from memory or READMEs.

**Ground the *ingestion/merge path*, not just the schema.** When a skill *produces
data a tool consumes* (a cache, not just a config), the schema is only half the
question — also ask *"does the tool already generate part of this data itself, and
how does it combine the two?"* The `build-reference` skill's design hinged on this:
chef's `aceLookup.js` `lookup()` reads `addons/*/aces.json` **live** and concatenates
it with the cache's `aces` (no dedup), so the `c3-reference` cache must hold
**built-in/manual ACEs + chunks only** — caching `source:"addon"` entries would
double-count every one. That fact lives in `dist/c3/aceRegistry.js` /
`aceLookup.js`, not in any schema; only reading the ingestion code surfaces it.

That last question is also a standing reminder that the answer can *change*:
`navigation-graph` was **CLI-only through 0.7.0**, then chef 0.8.0 (#85) promoted
it to an MCP tool — so the 0.7.0→0.8.0 reconciliation had to add it to
`c3-explorer`'s allow-list. A "CLI-only" finding has a shelf life; re-derive it
from the pinned package each bump rather than trusting a prior reconciliation
(this is exactly what the count sanity-check and version sweep above guard against).

## Ground-truth cross-check

`genvid-holdings/burbank` is the real embedded consumer. Its
`.claude/settings.json` allow-list (entries prefixed
`mcp__plugin_genvid-c3_<server>__<tool>`) is a useful sanity check on which
tools are actually exercised in practice — but it is a *subset* (only what that
project has needed), so treat the package's `registerTool` list as authoritative
for completeness and burbank as confirmation of real usage.
