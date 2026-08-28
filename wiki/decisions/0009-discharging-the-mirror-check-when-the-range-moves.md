---
type: decision-record
title: "0009. Discharging the `resolveRootFolder` Mirror Check When the Range Actually Moves"
description: >-
  What to do when ADR 0007's part 2 fails: diff `resolveRootFolder.js` *and its import closure* between the reviewed and newly-resolvable `@genvidtech/mcp-utils` versions, and record the reviewed baseline.
tags: [decision, architecture]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-27T00:00:00Z }
---
# 0009. Discharging the `resolveRootFolder` Mirror Check When the Range Actually Moves

- **Status:** Accepted
- **Recorded:** 2026-08-16
- **Issue:** #74 (planned jointly with #73)
- **Extends:** ADR 0007

## Context

ADR 0007 discharges the `audit.mjs` mirror obligation with a two-part mechanical check on the published packages:

1. Diff `dist/adapters/locations.js` between the old and new `c3-domain-manager` versions.
2. Prove the transitive `@genvidtech/mcp-utils` range cannot resolve to an unreviewed version.

Its recorded pass for #60 rested on a specific fact: `0.5.1` was the only non-placeholder version of `mcp-utils` ever published, so `^0.5.1` was *pinned in practice*. ADR 0007 named the expiry of that fact in its own Consequences:

> The check has a **blind spot it does not cover**: if `mcp-utils` ever publishes a new in-range version, part 2 fails and the mirror must be re-grounded against that release even when dm itself is unchanged.

The dm `0.7.0` → `0.8.0` bump (#74) is the first time that condition fired — and harder than anticipated. dm did not merely drift within a range; it **moved the range** from `^0.5.1` to `^0.7.0`, crossing two 0.x minors, which is breaking-capable under 0.x semver. Meanwhile `npm view @genvidtech/mcp-utils versions` had grown to `["0.0.1", "0.5.1", "0.6.0", "0.7.0"]`.

Issue #74 as originally filed concluded "This is a plain pin bump," reasoning from the release notes ("two user-visible fixes, both in the MCP server's watcher path"). That is precisely the evidence ADR 0007 rejected as insufficient when #60 tried it: release notes describe what an author *intended* to change, which is exactly what a silent drift leaves undisturbed.

## Decision

**When part 2 fails, escalate to a diff of the mirrored function's own dependency closure — not to a re-reading of the mirror for plausibility, and not to an argument from release notes.**

Concretely, when the range has moved (or admits a version not previously reviewed):

1. Pack both the previously-reviewed `mcp-utils` version and the newly-resolvable one.
2. Diff `dist/resolveRootFolder.js` **and every module it imports** — currently just `mcpError.js`. Byte-identical means the mirrored semantics cannot have changed, regardless of what else moved in the package.
3. Run a recursive `diff -rq` over `dist/` as a completeness check, to confirm that what *did* change lies outside that closure.
4. Record the resulting **reviewed baseline** — the set of `mcp-utils` versions whose `resolveRootFolder` has been verified equivalent — so the next bump starts from a wider base.

Applied to #74, with the versions as published on 2026-08-16:

| Check | Result |
|---|---|
| ADR 0007 part 1 — dm `dist/adapters/locations.js`, `0.7.0` ↔ `0.8.0` | **byte-identical** |
| ADR 0007 part 2 — range moved `^0.5.1` → `^0.7.0`, unreviewed versions published | **fails procedurally** |
| `dist/resolveRootFolder.js`, mcp-utils `0.5.1` ↔ `0.7.0` | **byte-identical** |
| `dist/mcpError.js` (its only import), same versions | **byte-identical** |
| What did change in `0.7.0` | `optimisticWatcher.js`, `walkFiles.js`, `index.js`, new `observedState.*` — **all outside the closure** |

`audit.mjs`'s four mirror functions (`classifyDiscovery`, `checkDiscoveryAmbiguity`, `resolveDiscoveryPick`, `resolveMcpProjectDirOverride`) therefore required **no logic change**. Only the provenance comment moved, from `@0.5.1` to `@0.7.0`, and it now records the reviewed baseline `{0.5.1, 0.7.0}`.

### Why this is a pass, not a waiver

The distinction worth preserving is between the check *failing* and the *risk* materializing. Part 2 is a cheap proxy: "the range cannot move" is easy to evaluate and, when true, makes the expensive question moot. When the proxy fails, the underlying question — *did the mirrored implementation change?* — is still answerable mechanically, just at higher cost. Escalating to the closure diff answers it directly rather than falling back to judgement.

This is the gate working as designed. The range moving is what **forced** a review that release notes would have talked us out of; the review then found nothing had moved.

## Consequences

- Part 2's failure is no longer a dead end. It has a defined, mechanical escalation whose cost is one extra `npm pack` and one diff.
- The **reviewed baseline is now state the check depends on**, so it must be recorded where the next maintainer will find it: the provenance comment above `scanC3ProjectMarkers` in `audit.mjs`, and this record. A baseline that is not written down silently resets the check to its most expensive form.
- ADR 0007's original part-2 formulation ("the range cannot resolve to a version that has not been reviewed") remains correct as written — `^0.7.0` currently admits only `0.7.0`, so the range is once again pinned in practice. It will expire again the moment `mcp-utils 0.8.0` publishes, and that is expected rather than a defect.
- The escalation reads published artifacts only, so it still works without access to either upstream repo — consistent with `docs/grounding-in-chef-behavior.md`.
- **A `diff` invocation whose stderr is discarded can report a false clean.** While verifying this bump, `diff -rq A B --include='*.js' 2>/dev/null` returned empty — `diff` has no `--include` flag, so the command had failed, not passed. Any "nothing changed" conclusion in this procedure must come from an invocation whose exit status and stderr were actually observed.

## Compromise

- **Amend ADR 0007 in place** — rejected. This repo treats ADRs as historical records; 0007's reasoning was correct for the state that existed when it was written, and rewriting it would erase the fact that the blind spot it predicted actually fired.
- **Supersede ADR 0007** — rejected. The decision is not reversed. Both parts still run, in the same order, for the same reasons; this record only defines what happens on the branch 0007 left open.
- **Import `resolveRootFolder` and delete the mirror** — still the genuinely correct fix, and still out of scope for a pin bump, for the reason 0007 gave: `audit.mjs` is dependency-free plain ESM run directly by Node, and taking a runtime dependency on `@genvidtech/mcp-utils` reshapes the audit's execution model. This bump strengthens the case — the mirror now needs a recorded baseline to stay cheap — without changing the scope calculus. Worth revisiting on its own.

## Related

- ADR 0006 — the mirror this verifies, and the `-32000` failure it exists to catch.
- ADR 0007 — the two-part check this extends.
- `docs/tool-surface-reconciliation.md` — the agent-tool-list half of a pin bump, which this deliberately sits outside.
