---
type: reference
title: The knowledge boundaries
description: The four homes C3 knowledge is split across — this plugin's platform reference, chef's tooling docs, the consuming repo's CLAUDE.md, and cross-tool wiring — plus c3source as a fifth home the agents never read, and the rule that docs/c3 names chef's capabilities but never chef's symbols.
tags: [architecture, knowledge-boundaries, docs-c3, construct3-chef, c3source, adr-0001, adr-0010]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-19T00:00:00Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-18.md
    title: CLAUDE.md as captured before the wiki migration
    last_modified: 2026-08-18
  - id: claude-md-upstream
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/CLAUDE.md
    title: CLAUDE.md in the repo (living version)
  - id: adr-0010
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/decisions/0010-linking-out-generically-instead-of-naming-chef-symbols.md
    title: ADR 0010 in the repo (living version)
  - id: adr-0001
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/decisions/0001-three-knowledge-boundaries.md
    title: ADR 0001 in the repo (living version)
---

# The knowledge boundaries

The plugin deliberately splits C3 knowledge across separate homes. Respect these
when adding or editing content — this is the repo's central design principle,
recorded as
[ADR 0001](/decisions/0001-three-knowledge-boundaries.md).[^claude-md]

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

## Name chef's *capability*, never chef's *symbol*

The table above says which repo owns a fact. It does not say **how** a `docs/c3`
doc should refer to the toolchain when the two legitimately meet — and the
founding import answered that by naming chef's internals directly.
[ADR 0010](/decisions/0010-linking-out-generically-instead-of-naming-chef-symbols.md)
settles it:

> A `docs/c3` doc refers to construct3-chef by **capability** and links to
> `construct3-chef://docs`. It never names chef's functions, modules, file paths,
> or MCP tools — **not even correct ones**.

So: *"mint SIDs with your toolchain's generator"*, never *"call `mintUniqueSid()`
from `src/c3/sidUtils.ts`"*.

### Why a correct name is still wrong

`construct3-guide.md` told agents to use `generateUniqueSid()` from
`c3/sidUtils.js`, and to initialise a registry via `initSidContext(path)`. Both
had been **removed from chef** when the SID singleton was retired — chef's own
`src/c3/layoutScaffold.ts` records the removal in a comment — and the cited path
was wrong besides (`src/c3/sidUtils.ts`, not `c3/sidUtils.js`). The doc had been
shipping instructions to call two functions that no longer existed.

Naming the *current* symbol instead was considered and rejected in #69.
`mintUniqueSid` is real and is on chef's public barrel, so it would be more
immediately actionable. It was rejected because **the property that matters is
not "is this name right today" but "can it become wrong without anyone finding
out"** — and every chef symbol has that property, correct ones included.

The failure also degrades toward **confident wrongness**, which is what makes it
worse than an ordinary boundary violation. A reader who follows a dead *link*
learns instantly that it is dead. A reader who follows a dead *function name*
gets a plausible identifier carrying the authority of a verified platform doc,
and finds out only at runtime.

### Two things this rule does not cover

- **Chef issue citations stay.** A parenthetical crediting a chef issue as a
  fact's *origin* is provenance, not instruction — the same class as the
  `construct3-sample` citations under ADR 0008.
- **One deliberate residual exists.** `layout-reference.md`'s
  `### How navigation renders in the extracted DSL` still names
  `navigation-graph`, because that block is the `author-navigation-patterns`
  skill's contract surface and the skill deep-links its headings by name.
  Trading a shipped skill's contract for rule purity was not worth it.

The rule is **unenforced** — checking it would mean resolving chef's exported
symbols from this repo, which nothing here can do. It is held by review. See
[Verifying docs/c3 against construct3-sample](/verifying-against-construct3-sample.md)
for why the sample cannot catch this class either.

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
- [The artifact / workspace split](/artifact-workspace-split.md) — the other structural split, between what ships and what is dev-workspace only.
