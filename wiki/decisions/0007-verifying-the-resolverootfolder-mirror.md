---
type: decision-record
title: "0007. Verify the `resolveRootFolder` Mirror by Package Diff, Not Inspection"
description: >-
  How to discharge the ADR 0006 mirror obligation on a `c3-domain-manager` bump: diff the adapter *and* prove the `@genvidtech/mcp-utils` range can't move, rather than trusting release notes.
tags: [decision, architecture]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-27T00:00:00Z }
---
# 0007. Verify the `resolveRootFolder` Mirror by Package Diff, Not Inspection

- **Status:** Accepted
- **Recorded:** 2026-07-28
- **Issue:** #60

## Context

ADR 0006 added `checkDiscoveryAmbiguity` (and #49 added `resolveDiscoveryPick` / `resolveMcpProjectDirOverride`) to `audit.mjs`. These **hand-mirror** `resolveRootFolder` from `@genvidtech/mcp-utils` — the function `c3-domain-manager` uses to resolve its project root when launched with bare args.

A hand-mirror is a copy of someone else's semantics. It has no compiler, no test, and no import binding it to the original, so it drifts **silently**: dm changes discovery behavior, the plugin's audit keeps validating against the old rules, and a repo the audit calls green fails at `-32000`. `CLAUDE.md` therefore names this a second re-grounding surface that `/gvt-dev:reconcile-mcp-pin` does **not** cover — that skill reconciles agent tool lists, and this is script logic.

The open question was *how* to discharge that obligation on each dm bump. The `0.6.2` → `0.7.0` bump (#60) forced an answer: the issue asserted the surface was "unaffected" because 0.7.0's four features were classification/analysis changes. That is an argument from **release notes** — it reasons about what the author *intended* to change, which is exactly the evidence that a silent drift would not disturb.

## Decision

Discharge the mirror obligation with a **two-part mechanical check on the published packages**, not by reading release notes or re-reading the mirror for plausibility:

1. **Diff the adapter.** `dist/adapters/locations.js` is where dm calls `resolveRootFolder`. Diff it between the old and new versions. Byte-identical means dm's *use* of discovery is unchanged.
2. **Prove the transitive dependency cannot move.** The adapter being identical is not sufficient — `resolveRootFolder` lives in `@genvidtech/mcp-utils`, reached through a **range**, so identical calling code can still reach different implementations. Read the range from the new package's `package.json` and enumerate the published versions of that dependency. The check passes only if the range cannot resolve to a version that has not been reviewed.

Both parts must hold. Either alone is insufficient, and part 2 is the one that is easy to skip.

Applied to #60: `locations.js` was byte-identical between `0.6.2` and `0.7.0`, and dm depends on `@genvidtech/mcp-utils@^0.5.1` where `0.5.1` is the only non-placeholder version ever published — so the range is pinned in practice. `audit.mjs` was left untouched, and that is a **verified** conclusion rather than an assumed one.

### Why not read the mirror against the source each time

Re-deriving all four functions against `resolveRootFolder` on every bump is expensive and, worse, unreliable in the direction that matters: it asks a reader to notice the *absence* of a change. The package diff makes the common case (nothing moved) a mechanical negative, and reserves careful reading for bumps where the diff is actually non-empty.

## Consequences

- Each dm bump carries a cheap, repeatable check with a recorded pass/fail, instead of a judgement call.
- When part 1 or part 2 fails, the diff localizes what to re-read — the escalation path is the original ADR 0006 exercise, now scoped.
- The check has a **blind spot it does not cover**: if `mcp-utils` ever publishes a new in-range version, part 2 fails and the mirror must be re-grounded against that release even when dm itself is unchanged. This makes a dm bump not the only trigger.
- The check reads *published artifacts*, so it works without access to either upstream repo — consistent with how this workspace grounds skills in chef behavior (`docs/grounding-in-chef-behavior.md`).

## Compromise

- **Trust the release notes** (what #60 proposed) — free, but reasons about intent rather than shipped code, and a discovery change bundled into an unrelated refactor is precisely what it would miss. Rejected.
- **Import `resolveRootFolder` and delete the mirror** — removes drift at the root and is the genuinely correct fix. Rejected here as out of scope for a pin bump: `audit.mjs` is dependency-free plain ESM run directly by Node, and taking a runtime dependency on `@genvidtech/mcp-utils` reshapes the audit's execution model. Worth revisiting on its own.
- **Snapshot-test the mirror against fixtures** — would catch behavioral divergence rather than textual change, but the fixtures would encode *our* reading of the semantics, so a misread mirror would pass its own tests. Complementary at best; it does not replace checking upstream.

## Related

- ADR 0006 — the mirror this verifies, and the `-32000` failure it exists to catch.
- `docs/tool-surface-reconciliation.md` — the agent-tool-list half of a pin bump, which this deliberately sits outside.
