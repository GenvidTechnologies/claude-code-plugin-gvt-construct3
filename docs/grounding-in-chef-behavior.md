# Grounding gvt-construct3 content in chef behavior

This is a **dev-workspace** doc: it is not shipped in the `plugin/` subtree. It
covers how to ground new gvt-construct3 skills and platform docs in chef's *actual*
runtime behavior — using the pinned package source rather than memory or READMEs.

> This pattern applies when **designing or authoring** new gvt-construct3 skills or
> platform docs. For keeping agent tool inventories honest after a pin bump, see
> [`docs/tool-surface-reconciliation.md`](tool-surface-reconciliation.md) and
> run the `/genvid-dev:reconcile-mcp-pin` skill.

## Why read the package source

READMEs drift. Runtime semantics (how a value renders in the DSL, what a config
field actually means, which capture group wins, whether a feature is an MCP tool
or a CLI subcommand) are only reliably answered by the compiled source. Pulling
the pinned package and reading the source of truth takes minutes and eliminates
whole classes of design mistakes.

## How to pull the pinned package

```bash
cd "$(mktemp -d)"
npm pack @genvid/construct3-chef@<pinned>
tar -xzf *.tgz
# algorithms / semantics:
ls package/dist/**          # e.g. dist/c3/navConvention.js, dist/c3/chefConfig.d.ts
# config + CLI reference:
sed -n '1,80p' package/docs/cli.md
```

Run the same `npm pack` / `tar` step for `@genvid/c3-domain-manager@<pinned>` when
the question touches that server.

## Worked example: `author-navigation-patterns`

The `author-navigation-patterns` skill's design questions — capture-group contract
(group 1 = target), `definitionMarkers` semantics (substring `line.includes`, bad
regex dropped not thrown), and "is `navigation-graph` an MCP tool?" — were all
answered from `dist/c3/navConvention.js` + `docs/cli.md`, which is what let the
skill's preview helper mirror chef's `resolveNavConvention` exactly. Read the
package, don't infer from memory or READMEs.

## Ground the *ingestion/merge path*, not just the schema

When a skill *produces data a tool consumes* (a cache, not just a config), the
schema is only half the question — also ask *"does the tool already generate part
of this data itself, and how does it combine the two?"*

The `build-reference` skill's design hinged on this: chef's `aceLookup.js`
`lookup()` reads `addons/*/aces.json` **live** and concatenates it with the
cache's `aces` (no dedup), so the `c3-reference` cache must hold **built-in/manual
ACEs + chunks only** — caching `source:"addon"` entries would double-count every
one. That fact lives in `dist/c3/aceRegistry.js` / `aceLookup.js`, not in any
schema; only reading the ingestion code surfaces it.

## "CLI-only" findings have a shelf life

A "CLI-only" finding about a chef feature has a shelf life and must be re-derived
each bump. `navigation-graph` was CLI-only through 0.7.0, then chef 0.8.0 (#85)
promoted it to an MCP tool — so the 0.7.0→0.8.0 reconciliation had to add it to
`c3-explorer`'s allow-list. Re-derive from the pinned package each bump rather than
trusting a prior finding. The count sanity-check and version sweep in the
`/genvid-dev:reconcile-mcp-pin` procedure (see
[`tool-surface-reconciliation.md`](tool-surface-reconciliation.md)) guard against
exactly this kind of silent drift.
