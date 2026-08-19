---
type: reference
title: The knowledge boundaries
description: The four homes C3 knowledge is split across — this plugin's platform reference, chef's tooling docs, the consuming repo's CLAUDE.md, and cross-tool wiring — plus c3source as a fifth home the agents never read.
tags: [architecture, knowledge-boundaries, docs-c3, construct3-chef, c3source, adr-0001]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-18T00:00:00Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-18.md
    title: CLAUDE.md as captured before the wiki migration
    last_modified: 2026-08-18
  - id: claude-md-upstream
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/CLAUDE.md
    title: CLAUDE.md in the repo (living version)
---

# The knowledge boundaries

The plugin deliberately splits C3 knowledge across separate homes. Respect these
when adding or editing content — this is the repo's central design principle,
recorded as
[ADR 0001](../docs/decisions/0001-three-knowledge-boundaries.md).[^claude-md]

## The three primary homes

| Knowledge | Home |
|---|---|
| **C3 platform reference** — how Construct 3 *itself* behaves: variable scoping, the async/signal model, layout layers, JSON formats | **Here**, in `plugin/docs/c3/`. Agents link it as `${CLAUDE_PLUGIN_ROOT}/docs/c3/*` |
| **Tooling reference** — recipe format, generators, CLI, recipe gotchas | `construct3-chef://docs`, versioned with the tool. **Not** duplicated here |
| **Project-specific facts** — named layouts, file paths, commit format, project gotchas | The **consuming repo's** `CLAUDE.md`, read by the agents at runtime |

The agents are genericized and fall back to `{type}: Description` commits when
the consuming repo specifies nothing. **Keep agent bodies generic across C3
projects** — anything project-specific belongs in the consuming repo, not here.

When you find yourself documenting a recipe gotcha vs. a platform gotcha, the
distinction matters: **platform gotchas** (invisible to lint/typecheck, only C3
parses them) belong in `plugin/docs/c3/`; **recipe-param/tooling gotchas** belong
in chef's docs. The `c3-implementer` agent keeps a short cheat-sheet of each but
points to the canonical source.

## The fourth, narrower home: cross-tool wiring

Wiring that **neither server's own docs own** — how the two bundled MCP servers
resolve their config from the workspace cwd, and the `extracted/` coupling
between `construct3-chef` (`extractedDir`) and `c3-domain-manager`
(`--extracted`) — lives in `plugin/docs/c3/toolchain-config.md`.

It is a **pointer doc**: it documents the interplay and the consuming-repo
contract, then links out to each tool's own docs for field-level reference.

- Do **not** restate a single tool's config schema there. `domain-config.json`'s
  domain shape is project-specific and belongs to the consumer / domain-manager's
  docs.
- Do **not** duplicate it into the platform-mechanics docs.

## c3source — a knowledge home the agents never read

`@genvidtech/c3source` (which `construct3-chef` *adopts*) is the TypeScript model
of C3's folder-project JSON and the home of the DSL renderer
(`extractEventSheetScripts`).

A fact about C3's on-disk *format* — e.g. the numeric `comparison` combo enum —
can feel like it belongs to c3source's typed model. **It still goes in
`plugin/docs/c3/`**, because the agents read those docs and inspect **raw**
event-sheet JSON at runtime; they never import c3source's types.

c3source is the right home only for the complementary *code-facing* typed model
— a `ComparisonOperator` enum, a renderer that annotates the symbol. File that as
a c3source issue.

> **Misattribution caveat.** The DSL renderer lives in **c3source, not chef**, so
> an issue saying "chef's renderer emits X" usually means c3source's.

The boundary cuts **both ways**: platform facts reverse-engineered during chef
work flow **back here** as `docs/c3` issues filed from chef run-retros — the
reverse of the usual defer-to-chef direction. First instance: #56, the
behavior-attachment shape, from chef #124.

## Keeping a straddling fact cohesive

**A platform fact whose halves span two `docs/c3` docs' domains stays cohesive —
home it beside its structural twin, don't split it.**

Some C3 facts straddle two docs. The behavior-attachment shape (#56) is *both*
object-type/family project JSON (`behaviorTypes[]`, arguably
`construct3-guide`/`layout-reference` territory) *and* event-sheet node shape
(the ACE's `behaviorType` targeting, `event-sheet-architecture` territory),
joined by a key chain: `behaviorId` → renameable instance `name` →
`behaviorType`.

Splitting such a fact across two docs and cross-linking **breaks the join a
reader must follow in one place**. Prefer keeping the whole join-chain in **one**
section, in the doc that owns the **targeting/reference side** — where a reader
consuming the fact starts — and place it **beside its structural twin** if one
exists (#56's family-member `objectClass` subtlety sits next to the near-identical
`customActionObjectClass` family case in `event-sheet-architecture.md`).

Peel off only the genuinely separable sub-fact as a one-liner + cross-link (#56's
built-in-vs-`.c3addon` packaging note → `addon-package-reference.md`) — never the
join itself.

[^claude-md]: CLAUDE.md, "Three knowledge boundaries (the central design
principle)".

## Related

- [Verifying docs/c3 against construct3-sample](/verifying-against-construct3-sample.md) — how a fact earns its place here.
- [Doc inventories and the changelog](/doc-inventories.md) — what a new doc must touch.
- [Deferring issues upstream](/deferring-issues-upstream.md) — acting on the boundary when an issue lands in the wrong repo.
- [Agent capability envelopes](/agent-capability-envelopes.md) — what each agent can actually observe.
