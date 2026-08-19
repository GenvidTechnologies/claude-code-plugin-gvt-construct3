---
type: practice-note
title: Verifying an MCP pin bump
description: Why a pin-bump issue's tool/surface table is an assertion to test rather than ground truth, and the mechanical checks — pack and diff, observed exit status, count anchors — that catch what the issue body gets wrong.
tags: [mcp, pin-bump, construct3-chef, c3-domain-manager, verification, reconcile-mcp-pin]
status: stable
stale_after: 2027-02-18
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

## Related

- [The audit contract](/the-audit-contract.md) — where the `resolveRootFolder` mirror lives.
- [Doc inventories and the changelog](/doc-inventories.md) — a bump's CHANGELOG obligation.
- [Deferring issues upstream](/deferring-issues-upstream.md) — chef as the authoritative tool.
