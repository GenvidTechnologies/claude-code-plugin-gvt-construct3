---
type: practice-note
title: Verifying an MCP pin bump
description: Why a pin-bump issue's tool/surface table is an assertion to test rather than ground truth; the mechanical checks that catch what the issue body gets wrong; how the resolveRootFolder mirror obligation is discharged and escalated once its dependency range moves; and why the explorer allow-list is not chef's READ_ONLY set.
tags: [mcp, pin-bump, construct3-chef, c3-domain-manager, verification, reconcile-mcp-pin, resolve-root-folder, allow-list, adr-0007, adr-0009]
status: stable
stale_after: 2027-02-26
generated: { by: process:maintain-wiki, at: 2026-08-26T00:00:00Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-18.md
    title: CLAUDE.md as captured before the wiki migration
    last_modified: 2026-08-18
  - id: claude-md-upstream
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/CLAUDE.md
    title: CLAUDE.md in the repo (living version)
  - id: adr-0007
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/docs/decisions/0007-verifying-the-resolverootfolder-mirror.md
    title: ADR 0007 in the repo (living version)
  - id: adr-0009
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/docs/decisions/0009-discharging-the-mirror-check-when-the-range-moves.md
    title: ADR 0009 in the repo (living version)
  - id: reconciliation
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/docs/tool-surface-reconciliation.md
    title: docs/tool-surface-reconciliation.md in the repo (living version)
---

# Verifying an MCP pin bump

When a release bumps the pinned `construct3-chef` / `c3-domain-manager` versions
in `mcpServers`, run `/gvt-dev:reconcile-mcp-pin` **before tagging** — a server
bump can add, rename, or remove MCP tools, and the agents enumerate those by
hand. `c3-explorer`'s `tools:` is a hard allow-list, so a missed read tool
becomes **uncallable**: a functional regression, not a doc gap.[^claude-md]

## The core rule

**A pin-bump issue's tool/surface table is an assertion to test, not ground
truth — pack the package and diff.** Bump issues here are often auto-filed by
the upstream release ("*Filed automatically after publishing …*"), and their
surface tables drift from what actually registers. Build a verified-facts table
before planning; treat every number in the issue as unconfirmed until it comes
from `npm pack`.

### What the issue bodies have actually got wrong

| Bump | Wrong claim | Reality |
|---|---|---|
| chef 1.0.0 / dm 0.7.0 (#61/#60) | #60 listed a "16 tool" read-side surface naming `domain-index`, `domains`, `overrides` | **None of the three is a registered MCP tool**; the real total is 14 |
| same | #60's pin-location list named only `plugin.json` | **Omitted `plugin/agents/c3-implementer.md`**, which carries two dm version references |
| same | chef#98's singular `validate-addon` had shipped under that name | 1.0.0 registers the **plural** `validate-addons`; the singular does not exist |
| same | #60 argued `resolveRootFolder` was unaffected because 0.7.0's features looked unrelated | An argument from release notes — precisely the evidence a silent drift leaves undisturbed. [ADR 0007](../docs/decisions/0007-verifying-the-resolverootfolder-mirror.md) replaces it with a mechanical two-part check |
| chef 1.1.0 / dm 0.8.0 (#73/#74) | Both bodies again named only `plugin.json` as the pin site | **Omitted `c3-implementer.md` again** — the same file, the second consecutive bump |
| same | #73 asserted **both** agents carry hard `tools:` allow-lists | Only `c3-explorer` does; `c3-implementer` has no `tools:` key and says so in its own body |

**`c3-implementer.md` is not an anecdote — it is the predictable failure mode.**
Three data points across two consecutive bumps: assume the pin-location list is
short until you have grepped it yourself, and check `plugin/agents/c3-implementer.md`
**first**, since it is the one that goes missing every time.

**A wrong claim about the *capability model* is worse than a miscount** — it
mis-scopes the whole job (doubling the apparent uncallable-tool risk). Check
that class of assertion against the agent frontmatter, not just the counts
against the package.

## The rule is not limited to pin-bump issues

It applies to **any issue whose deliverable is prose asserting how a tool
behaves**. #32 asked for guidance recommending `validate-addons` in a validate
chain, and three facts that shaped the resulting prose appeared nowhere in the
issue:

- it is a real **CLI subcommand** (not MCP-only) — without which the whole
  `commands.validate` mechanism would not work;
- it sets `exitCode = 1` on findings, so it chains with `&&`;
- it is **inert on non-bundling projects** (the missing-package pass is gated on
  `usedAddons` entries marked `bundled: true`), which is what made recommending
  it unconditionally safe.

Two sibling tools (`diff-addon-aces`, `scan-addon-usage`) turned out to have
**no CLI subcommand at all** and had to be excluded.

## Mechanics — and the three ways this check fakes a pass

**Extract into a fixed scratchpad path, not `mktemp -d`.** The Bash cwd resets
to the repo root after any call that leaves it, so a fresh mktemp name is
unrecoverable on the next call and multi-grep inspection breaks.

Note chef `1.0.0` moved the registry to `dist/mcp/server.js`, so a bare
`dist/server.js` grep now silently finds nothing.

1. **A silent-zero grep looks like absence.** Take registration claims from the
   registry idiom in `dist/` (`reg("…"` / `registerTool("…"`).
2. **Over-matching reads as a *find*, which is worse.** A packed tarball carries
   `docs/`, `README.md` and `docs/decisions/` alongside `dist/`, so a bare
   token-shaped grep over the whole tree returns prose and ADR *filenames* as
   though they were registered surface. In the #72 check,
   `grep -roh "extract-[a-z-]*"` over chef `1.1.0` returned `extract-path`
   beside the real `extract-template` — and `extract-path` is only a fragment of
   an ADR filename. **A miss looks like absence and gets doubted; a spurious hit
   looks like evidence and gets believed.** Treat a whole-tree token grep as a
   *presence-anywhere* probe only.
3. **A discarded stderr can report a false clean.** In the chef 1.1.0 / dm 0.8.0
   bump, `diff -rq A B --include='*.js' 2>/dev/null` returned empty and read as
   "no differences" — but `diff` has **no `--include` flag** (that is grep's), so
   the command had *failed*, not passed. The ADR 0007 discharge nearly rested on
   it.

**Every "nothing changed" conclusion must come from an invocation whose exit
status and stderr you actually observed.** That is the same class of evidence a
silent-zero grep fakes, so treat (1) and (3) as one habit, not two cautions.

## The second re-grounding surface reconcile-mcp-pin does not cover

A `c3-domain-manager` bump also touches `audit.mjs`'s discovery check, which
hand-mirrors `@genvidtech/mcp-utils`'s `resolveRootFolder` semantics
([ADR 0006](../docs/decisions/0006-detect-discovery-ambiguity.md)):

- `classifyDiscovery` / `checkDiscoveryAmbiguity` — the ambiguity finding and the
  suppression precedence (explicit `--project-dir` > env `C3_PROJECT_DIR` >
  discovery);
- `resolveDiscoveryPick` — the depth-1 pick derivation;
- `resolveMcpProjectDirOverride` — the `.mcp.json` override semantics.

The latter two were added in #49. That is script *logic*, not an agent tool
list, so a bump that changes discovery/override behavior **silently breaks the
mirror** — re-verify all of it against the new `resolveRootFolder`.

### Discharging that obligation — ADR 0007's two-part check

Do **not** re-derive the four mirror functions against `resolveRootFolder` on every
bump. That asks a reader to notice the *absence* of a change, which is unreliable in
exactly the direction that matters. Instead run a **mechanical two-part check on the
published packages**:[^adr-0007]

1. **Diff the adapter.** `dist/adapters/locations.js` is where `c3-domain-manager`
   calls `resolveRootFolder`. Byte-identical between the old and new versions means
   dm's *use* of discovery is unchanged.
2. **Prove the transitive dependency cannot move.** An identical adapter is **not
   sufficient** — `resolveRootFolder` lives in `@genvidtech/mcp-utils`, reached through
   a **range**, so identical calling code can still reach a different implementation.
   Read the range from the new package's `package.json` and enumerate that
   dependency's published versions. It passes only if the range **cannot** resolve to
   a version that has not been reviewed.

**Both must hold, and part 2 is the one that is easy to skip.** At #60,
`locations.js` was byte-identical `0.6.2` to `0.7.0`, and `^0.5.1` admitted only
`0.5.1` (the sole non-placeholder version then published), so the range was pinned in
practice — `audit.mjs` was left untouched as a **verified** conclusion rather than an
assumed one.[^adr-0007]

### When part 2 fails — the ADR 0009 escalation

Part 2 is a **cheap proxy**: "the range cannot move" is easy to evaluate and, when
true, makes the expensive question moot. When it fails, the underlying question —
*did the mirrored implementation actually change?* — is still answerable mechanically.
**Escalate to a diff of the mirrored function's own dependency closure**, not to
re-reading the mirror for plausibility, and never to an argument from release
notes:[^adr-0009]

1. Pack both the previously-reviewed `mcp-utils` version and the newly-resolvable one.
2. Diff `dist/resolveRootFolder.js` **and every module it imports** — currently just
   `mcpError.js`. Byte-identical means the mirrored semantics cannot have changed,
   whatever else moved in the package.
3. Run a recursive `diff -rq` over `dist/` as a **completeness check**, confirming that
   what *did* change lies outside that closure.
4. **Record the reviewed baseline** — the set of `mcp-utils` versions whose
   `resolveRootFolder` has been verified equivalent — so the next bump starts wider.

This first fired at **#74** (dm `0.7.0` to `0.8.0`), and harder than ADR 0007
anticipated: dm did not drift *within* a range, it **moved the range** from `^0.5.1`
to `^0.7.0`, crossing two 0.x minors — breaking-capable under 0.x semver — while the
published versions had grown to `["0.0.1", "0.5.1", "0.6.0", "0.7.0"]`.[^adr-0009]

| Check | Result |
|---|---|
| part 1 — dm `dist/adapters/locations.js`, `0.7.0` vs `0.8.0` | **byte-identical** |
| part 2 — range moved, unreviewed versions published | **fails procedurally** |
| `dist/resolveRootFolder.js`, mcp-utils `0.5.1` vs `0.7.0` | **byte-identical** |
| `dist/mcpError.js` (its only import) | **byte-identical** |
| what *did* change in `0.7.0` | `optimisticWatcher.js`, `walkFiles.js`, `index.js`, new `observedState.*` — **all outside the closure** |

All four mirror functions therefore needed **no logic change**; only the provenance
comment moved, from `@0.5.1` to `@0.7.0`.[^adr-0009]

**This is a pass, not a waiver.** The distinction worth preserving is between the
*check* failing and the *risk* materializing. The range moving is what **forced** a
review that release notes would have talked us out of — and the review then found that
nothing had moved.[^adr-0009]

> **The reviewed baseline is now state the check depends on.** It currently stands at
> **{0.5.1, 0.7.0}**, recorded in the provenance comment above `scanC3ProjectMarkers`
> in `audit.mjs` and in ADR 0009. **A baseline that is not written down silently resets
> the check to its most expensive form.**

**Part 2 will expire again**, and that is expected rather than a defect: `^0.7.0`
currently admits only `0.7.0`, so the range is pinned in practice once more — until
`mcp-utils 0.8.0` publishes. **A dm bump is not the only trigger.**[^adr-0009]

## The explorer allow-list is *not* chef's `READ_ONLY` set

The obvious mechanical check — diff chef's `READ_ONLY` tools against `c3-explorer`'s
allow-list and add what is missing — is **wrong in both directions**, and wrong in a
way that changes a **capability**, not just a doc.[^reconciliation]

Measured at chef `1.1.0`: **24 `READ_ONLY` + 10 `MUTATE` + 2 unannotated**
(`generate-sids`, `regenerate`) = **36** `reg()` tools, while the explorer's chef
allow-list holds **25**. Three deliberate divergences explain the gap:[^reconciliation]

- **`validate-recipe` is `READ_ONLY` but deliberately excluded.** It belongs to the
  *implementer's* recipe workflow ("always `validate-recipe` before `apply-recipe`").
  Adding it "to close the gap" silently widens a **haiku** agent's envelope. **Leave
  it out.**
- **`list-ops` is in the allow-list but is not a `server.js` `reg()` tool** — it is
  registered in `dist/mcp/opsRegistry.js`, outside the file the count anchors grep.
- **`generate-sids` is in the allow-list but carries no annotation at all**, so an
  annotation-driven filter drops it. It is genuinely non-mutating — it mints SIDs
  without touching files.

So the relation is **allow-list = (annotated `READ_ONLY`) minus `validate-recipe` plus
`list-ops` plus `generate-sids`**. Re-derive that relation when the counts change,
rather than asserting the two sets should match. If a future bump genuinely makes
`validate-recipe` explorer-appropriate, that is a deliberate capability decision
deserving its own rationale — not a reconciliation side-effect.[^reconciliation]

**Ops tools have lived outside `server.js` since chef 0.10.0 (#89).** The
user-defined-ops surface — static `list-ops` plus dynamically-registered `op-<name>`
tools, one per file in the project's `ops/` dir — registers in `opsRegistry.js`. A
`server.js`-only grep therefore **diffs empty for an ops bump even though the surface
grew.** `list-ops` is `READ_ONLY` (so it belongs in the explorer allow-list);
`op-<name>` is `MUTATE` and dynamic (so it belongs in implementer docs only,
documented as a *class*, since the names are not fixed).[^reconciliation]

## A scope rename reaches past the tool lists

A package **scope rename** is a pin bump that also changes the package *name*, so it
splits into three categories that must be handled differently:[^reconciliation]

| Category | Action |
|---|---|
| **Functional — must migrate** | the `plugin.json` pins **and** every skill's `metadata.expects.mcp.package`, which drives the audit's version probe. Also revisit each `minVersion` floor: the new scope's first-published version may exceed the old floor, so it is a deliberate keep-vs-raise call, not an automatic copy. |
| **Live prose — should migrate** | version and scope mentions in agent bodies, `plugin/CONVENTIONS.md`, `plugin/docs/c3/toolchain-config.md`, `CLAUDE.md`, and the grounding/reconciliation docs, whose `npm pack` commands must name the live scope. |
| **Historical records — must NOT rewrite** | past `plugin/CHANGELOG.md` entries and `docs/decisions/*.md`. They record the scope that *shipped at the time*; rewriting them falsifies history. Only the new `[Unreleased]` entry names the new scope. |

The old scope stays **resolvable** (frozen, not unpublished), so a version probe
against the stale package still "works" — **pack both old and new and diff their
registration names** rather than trusting a "no change" claim.[^reconciliation]

## Refresh the count anchors

A pin bump must also refresh the hardcoded totals in
[`docs/tool-surface-reconciliation.md`](../docs/tool-surface-reconciliation.md)
(chef `reg()`-in-`server.js` + `list-ops`; dm `registerTool`). Those are what the
**next** bump greps against to sanity-check its own diff — so leaving them stale
doesn't break the bump that made them wrong, **it breaks the one after**. That
failure mode is invisible at the time you cause it, which is exactly why it is a
checklist item rather than a judgement call.

Re-confirm the `reg()`-vs-`opsRegistry.js` split before rewriting the numbers,
since the doc's whole purpose is to warn that a `server.js`-only grep undercounts.

[^claude-md]: CLAUDE.md, "Release status" and "A pin-bump issue's tool/surface
table is an assertion to test".

[^adr-0007]: ADR 0007 on verifying the `resolveRootFolder` mirror by package diff
rather than by inspection.

[^adr-0009]: ADR 0009 on discharging the `resolveRootFolder` mirror check when the
dependency range actually moves.

[^reconciliation]: `docs/tool-surface-reconciliation.md` — the C3-specific
reconciliation anchors, the read/mutate split, and the scope-rename categories.

## Related

- [The audit contract](/the-audit-contract.md) — where the `resolveRootFolder` mirror lives.
- [Doc inventories and the changelog](/doc-inventories.md) — a bump's CHANGELOG obligation.
- [Deferring issues upstream](/deferring-issues-upstream.md) — chef as the authoritative tool.
- [Grounding a claim in chef's package source](/grounding-in-chef-source.md) — the design-time counterpart to this maintenance check.
