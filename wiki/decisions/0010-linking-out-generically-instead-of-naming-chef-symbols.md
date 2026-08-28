---
type: decision-record
title: "0010. `docs/c3` Links Out to chef Generically and Never Names chef's Internal Symbols"
description: >-
  `docs/c3` refers to construct3-chef by *capability* and links to `construct3-chef://docs`; it never names chef's functions, modules, or MCP tools — not even correct ones, since a correct name can rot into confident wrongness undetected.
tags: [decision, architecture]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-27T00:00:00Z }
---
# 0010. `docs/c3` Links Out to chef Generically and Never Names chef's Internal Symbols

- **Status:** Accepted
- **Recorded:** 2026-08-19
- **Issue:** #69
- **Extends:** ADR 0001

## Context

ADR 0001 splits C3 knowledge into three homes: the C3 platform reference here in
`plugin/docs/c3/`, the tooling reference in `construct3-chef://docs`, and
project-specific facts in the consuming repo. What it does **not** settle is *how* a
platform doc should refer to the tooling when the two genuinely meet — and the founding
import (`41c1816`) answered that by naming chef's internals directly.

#69 set out to relocate seven such sites. Six were unremarkable: chef's own docs already
owned the fact, so the reference collapsed to a link. The seventh was not.

`construct3-guide.md` told agents:

> Use the **SID generator provided by construct3-chef (`generateUniqueSid()` from
> `c3/sidUtils.js`)** … Reads a project-wide SID registry (init via `initSidContext(path)`)

Both named functions had been **removed from chef**. Its own source records the removal:

```
// SID generation moved to ./sidUtils.js — use `mintUniqueSid(usedSids)` … The historical
// `generateUniqueSid` in this module had range [0, 1e15) … it was removed when the SID
// singleton was retired.
```
— chef `src/c3/layoutScaffold.ts:6` (and `spriteScaffold.ts:9`)

`initSidContext` appears nowhere in chef's `src/`. The cited path was wrong besides —
`src/c3/sidUtils.ts`, not `c3/sidUtils.js`.

So this was not a knowledge-boundary violation that happened to also be stale. **The
boundary violation is what made staleness possible, and staleness is what made it
harmful.** A misplaced-but-correct fact is untidy; a misplaced fact that silently rots
into live instructions to call two functions that no longer exist is a defect that
nothing in this repo can detect — no test, no link checker, and no audit reads another
repo's exported symbols.

The failure is also **asymmetric in a way worth naming**: it degrades toward confident
wrongness. A reader who follows a dead link learns immediately that it is dead. A reader
who follows a named function that no longer exists gets a plausible identifier, written
with the authority of a verified platform doc, and discovers the problem only at runtime.

## Decision

**A `docs/c3` doc refers to construct3-chef by capability and links to
`construct3-chef://docs`. It does not name chef's functions, modules, file paths, or
internal APIs — not even correct ones.**

Concretely, when a platform fact meets the toolchain:

1. State the **platform constraint** in full — that is what this reference exists for.
   (For #69's site: SIDs must fit `Number.MAX_SAFE_INTEGER`, C3 rejects the layout with
   `Error: invalid SID` otherwise, and existing project SIDs occupy `[1e14, 1e15)`.)
2. Name the **capability** the toolchain supplies, not its entry point — "mint SIDs with
   your toolchain's generator", not `mintUniqueSid(usedSids)`.
3. Point at `construct3-chef://docs` and let it own the entry point, the signature, and
   the guarantees.

**Naming the correct current symbol was considered and rejected.** `mintUniqueSid` is
real, is on chef's public barrel (`src/index.ts:18`), and would be more immediately
actionable for an agent. It was rejected because it rebuilds the identical trap: the
next chef refactor rots it exactly as the SID-singleton retirement rotted
`generateUniqueSid`, and nothing here would notice. The property that matters is not
*"is this name right today"* but *"can this name become wrong without anyone finding
out"* — and every chef symbol has that property, correct ones included.

**MCP tool names are covered by this rule too.** They are chef's registered surface, not
C3 platform vocabulary, and they move for the same reasons.

**Chef issue citations are not covered.** A parenthetical crediting a chef issue as a
fact's *origin* is provenance, not instruction, and stays — the same class as
`layout-reference.md`'s `construct3-sample` citations under ADR 0008.

## Consequences

- `docs/c3` becomes durable against chef's refactors by construction rather than by
  vigilance. The class of defect #69 found cannot recur through the doc naming a symbol,
  because the doc no longer names one.
- **An agent has to follow one more hop** to get an entry point. This is the real cost,
  and it is accepted deliberately: both agents already carry chef's tool guidance in
  their own bodies (`c3-explorer.md:27-28`, `c3-implementer.md:28-29`), so in practice
  the hop is rarely taken from a cold start.
- A fact chef's docs do **not** yet own cannot simply be linked. It must be filed
  upstream in the same session and cross-linked both ways, per the existing relocation
  rule — #69 filed
  [chef#196](https://github.com/GenvidTechnologies/construct3-chef/issues/196) for the
  `list-global-layers` tool and the `global-layers.txt` report format, the one such fact
  in its scope.
- **This rule is unenforced.** Nothing in `audit.mjs` can check it, since verifying it
  would mean resolving chef's exported symbols from this repo. It is a convention held
  by review, and the grep in #69's acceptance criteria
  (``git grep -nE '`(construct3-chef )?(generate|sync-project|…)`' -- plugin/docs/c3/``)
  is a spot-check for the command-name shape, not a general enforcement.
- One deliberate residual survives in `layout-reference.md`: the
  `### How navigation renders in the extracted DSL` block names `navigation-graph`,
  because that block is `author-navigation-patterns/SKILL.md`'s contract surface and the
  skill deep-links its headings by name. Trading a shipped skill's contract for rule
  purity was not worth it; the block already links out for the field-level schema, which
  is the pattern this ADR describes.
