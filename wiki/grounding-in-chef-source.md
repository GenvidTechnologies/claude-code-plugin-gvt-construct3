---
type: practice-note
title: Grounding a claim in chef's package source
description: How to answer a design question about construct3-chef or c3-domain-manager from the pinned package's compiled source rather than from memory or a README — and the three failure shapes that recipe exists to prevent.
tags: [construct3-chef, c3-domain-manager, npm-pack, grounding, skill-design, verification]
status: stable
stale_after: 2027-08-26
generated: { by: process:maintain-wiki, at: 2026-08-26T00:00:00Z }
sources:
  - id: grounding
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/docs/grounding-in-chef-behavior.md
    title: docs/grounding-in-chef-behavior.md in the repo (living version)
---

# Grounding a claim in chef's package source

**When you are designing or authoring** a `gvt-construct3` skill or a
`plugin/docs/c3/` platform doc and need to know what the toolchain *actually*
does, read the **pinned package's compiled source**. Not a README, not memory.[^grounding]

This is the *design-time* motion. The *maintenance* motion — keeping agent tool
inventories honest after a pin bump — is a different job with its own page: see
[Verifying an MCP pin bump](/pin-bump-verification.md).

## Why the source and not the README

READMEs drift. The questions that actually block a skill design are runtime
semantics, and those are only reliably answered by compiled code:[^grounding]

- how a value **renders** in the extracted DSL,
- what a config field **actually means**,
- which **capture group** wins,
- whether a feature is an **MCP tool or a CLI subcommand**.

Pulling the pinned package takes minutes and eliminates whole classes of design
mistake.

## The recipe

```bash
npm pack @genvidtech/construct3-chef@<pinned>
tar -xzf *.tgz
# algorithms / semantics:
ls package/dist/**          # e.g. dist/c3/navConvention.js, dist/c3/chefConfig.d.ts
# config + CLI reference:
sed -n '1,80p' package/docs/cli.md
```

Run the same `npm pack` / `tar` for `@genvidtech/c3-domain-manager@<pinned>` when the
question touches that server.[^grounding]

> **Pack into a fixed scratchpad directory, not `cd "$(mktemp -d)"`.** The captured
> doc's recipe opens with a `cd` into a fresh temp dir, and that is where this bites:
> the shell's working directory persists between tool calls but a later call can reset
> it, after which the `ls`/`grep` steps run somewhere else and return a **silent
> empty** result. Use one known scratchpad path for the whole investigation. *(Workspace
> practice observed across pin-bump runs, not a claim from the captured doc.)*

## Ground the *ingestion path*, not just the schema

When a skill **produces data a tool consumes** — a cache, not merely a config — the
schema is only half the question. Also ask: *does the tool already generate part of
this data itself, and how does it combine the two?*[^grounding]

`build-reference`'s design hinged on exactly this. chef's `aceLookup.js` `lookup()`
reads `addons/*/aces.json` **live** and **concatenates** it with the cache's `aces`
**with no dedup** — so the `c3-reference` cache must hold **built-in/manual ACEs and
chunks only**. Caching `source:"addon"` entries would double-count every one of them.
That fact lives in `dist/c3/aceRegistry.js` and `aceLookup.js`; **no schema states
it.** Only reading the ingestion code surfaces it.[^grounding]

## A "CLI-only" finding has a shelf life

A finding that some chef feature is CLI-only **expires**, and must be re-derived on
every bump.[^grounding]

`navigation-graph` was CLI-only through **0.7.0**; chef **0.8.0** (#85) promoted it to
an MCP tool — so the 0.7.0 → 0.8.0 reconciliation had to add it to `c3-explorer`'s
allow-list. Because that allow-list is a **hard** `tools:` lock, a missed promotion is
not a stale doc; it leaves a real tool **uncallable**. See
[Agent capability envelopes](/agent-capability-envelopes.md).

Re-derive from the pinned package each bump rather than trusting a prior finding. The
count sanity-check and version sweep in
[Verifying an MCP pin bump](/pin-bump-verification.md) guard the same drift from the
other side.

> **Paths in this page are version-pinned too.** chef has relocated modules across
> majors — the MCP registry moved to `dist/mcp/server.js` at chef `1.0.0`, so an older
> path grep now finds nothing. Treat a **silent zero** as "the layout moved", never as
> "the feature is absent".

## Worked example: `author-navigation-patterns`

Three design questions, all answered from `dist/c3/navConvention.js` plus
`docs/cli.md`:[^grounding]

- the **capture-group contract** — group 1 is the target;
- **`definitionMarkers` semantics** — substring `line.includes`, and a bad regex is
  *dropped*, not thrown;
- **is `navigation-graph` an MCP tool?**

Reading the package is what let the skill's preview helper mirror chef's
`resolveNavConvention` exactly. A mirror is only as good as the source it was read
from — and a hand-mirror drifts silently, which is the whole subject of
[Verifying an MCP pin bump](/pin-bump-verification.md).

[^grounding]: `docs/grounding-in-chef-behavior.md` — grounding gvt-construct3 content in chef behavior.

## Related

- [Verifying an MCP pin bump](/pin-bump-verification.md) — the maintenance counterpart: reconciling tool inventories after a bump.
- [Agent capability envelopes](/agent-capability-envelopes.md) — why a missed read tool is a functional regression, not a doc gap.
- [The knowledge boundaries](/knowledge-boundaries.md) — why a tooling fact belongs in chef's docs and not in `plugin/docs/c3/`.
- [Skill authoring conventions](/skill-authoring-conventions.md) — the lib/CLI split and where a grounded finding lands in a skill.
