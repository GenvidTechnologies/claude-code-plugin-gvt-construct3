---
type: decision-record
title: "0015. Discharging the `resolveRootFolder` Mirror When the Closure Diff Is *Not* Byte-Identical"
description: >-
  When ADR 0009's closure diff comes back dirty, decompose it into the discovery walk, the filtering policy, the narrowing wrapper and the closure boundary, and discharge on semantic equivalence of the mirrored surface; byte-identity is demoted from the pass condition to a fast path.
tags: [decision, architecture]
status: stable
generated: { by: process:plan-task, at: 2026-09-15T00:00:00Z }
---
# 0015. Discharging the `resolveRootFolder` Mirror When the Closure Diff Is *Not* Byte-Identical

- **Status:** Accepted
- **Recorded:** 2026-09-15
- **Issue:** #107
- **Extends:** ADR 0009 (which extends ADR 0007)

## Context

`audit.mjs` hand-mirrors `@genvidtech/mcp-utils`'s `resolveRootFolder` discovery
semantics (ADR 0006). Two records already govern how that mirror is re-verified:

- **ADR 0007** — a two-part mechanical check: diff dm's `dist/adapters/locations.js`,
  and prove the transitive `@genvidtech/mcp-utils` range cannot resolve to an
  unreviewed version.
- **ADR 0009** — what to do when part 2 fails: pack the reviewed and newly-resolvable
  `mcp-utils` versions and diff `dist/resolveRootFolder.js` **and its import closure**.
  *"Byte-identical means the mirrored semantics cannot have changed."*

Every prior discharge ended in byte-identity. ADR 0009 says so explicitly, and its own
Consequences frame the escalation as costing "one extra `npm pack` and one diff" —
which is true only when the diff comes back clean.

**The dm `0.9.0` → `0.10.1` bump (#107) is the first time it did not.** All three
rungs failed at once:

| Check | Result |
|---|---|
| ADR 0007 part 1 — dm `dist/adapters/locations.js`, `0.9.0` ↔ `0.10.1` | **FAILS** — gained `resolveProjectRoots`, `deriveProjectId`, `deriveUniqueProjectIds`, `buildRegistry` |
| ADR 0007 part 2 — range moved `^0.8.0` → `^0.10.0`; mcp-utils `0.9.0` and `0.10.0` published | **FAILS procedurally** |
| ADR 0009 step 2 — `dist/resolveRootFolder.js`, mcp-utils `0.8.0` ↔ `0.10.0` | **FAILS — first non-identical closure diff** |

The cause is a refactor, not a behaviour change: mcp-utils `0.10.0` introduced a plural
`resolveRootFolders` that owns the discovery walk and returns *every* candidate, and
reimplemented the singular `resolveRootFolder` as a thin narrowing wrapper over it.
dm `0.10.0` then consumed the plural to add multi-project support (upstream ADR 0028).

ADR 0009 left this branch undefined. Read literally, byte-identity is the *only* stated
pass condition, so a dirty diff has no prescribed outcome — and the two available
instincts are both ones this repo has already rejected: re-read the mirror for
plausibility (rejected by ADR 0007) or argue from release notes (rejected by ADR 0009,
which calls that "precisely the evidence a silent drift leaves undisturbed").

## Decision

**When the closure diff is non-identical, decompose it along the axes the mirror
actually depends on, and discharge on semantic equivalence of those axes — never on
the diff's overall size, and never on a reading of the new code for plausibility.**

The mirror depends on four things, and each is checked separately:

1. **The discovery walk** — the scan, the pruning rule, the depth-1 collection. Compare
   the walk bodies directly, tolerating only differences in the *return shape*.
2. **The filtering policy** — whether upstream excludes any directory by name. This
   mirror deliberately does **not** exclude `node_modules` or dot-directories *because
   upstream does not*, so a newly-added filter would silently invert the mirror's
   fidelity. Check for its introduction explicitly; its absence is not self-evident from
   a diff dominated by other changes.
3. **The narrowing** — whether the singular still maps one candidate to the same success
   shape and two-or-more to the same error, including the **error message text**, which
   is observable to callers.
4. **The closure boundary** — re-derive which modules the mirrored function actually
   imports, and confirm every *differing* sibling lies outside it. A sibling that
   differs is only irrelevant once it is shown to be unreachable.

If all four hold, the mirror needs no logic change and the newly-resolvable version
**joins the reviewed baseline**. If any fails, the mirror's logic is re-derived against
the new implementation — the expensive path ADR 0007 exists to avoid, now entered on
evidence rather than on suspicion.

Applied to #107, against mcp-utils `0.8.0` ↔ `0.10.0`:

| Axis | Finding |
|---|---|
| Discovery walk | **identical** except `{path: x}` → `{paths: [x]}` |
| Filtering policy | **no name-based filtering added** — mirror's inclusion of `node_modules`/dot-dirs stays faithful |
| Narrowing | 1 → `{path, source}`; ≥2 → ambiguity `mcpError` with a **byte-identical message** |
| Closure boundary | imports are `node:fs`, `node:path`, `./mcpError.js`; `mcpError.js` **byte-identical**; the differing `walkFiles.js` is **outside** the closure |

**Verdict: PASS.** All four mirror functions (`classifyDiscovery`,
`checkDiscoveryAmbiguity`, `resolveDiscoveryPick`, `resolveMcpProjectDirOverride`)
required no logic change. The reviewed baseline widens to
**{0.5.1, 0.7.0, 0.8.0, 0.10.0}**.

### Why the adapter's failure does not widen the scope

ADR 0007 part 1 failed here for the first time as well, and it is worth being precise
about why that is not alarming. What `locations.js` gained is dm's **plural,
multi-project** path — `resolveProjectRoots`, id derivation, registry construction. The
plugin declares a single `server` invocation with no `--project`, so only the singular
path is exercised, and the singular path is exactly what the four axes above verified.

Had the plugin configured multiple projects, the ambiguity semantics the mirror encodes
would genuinely be in question: in the plural path, two sibling directories carrying the
marker are a **success** returning both, not the `mcpError` the mirror reports as a
discovery-ambiguity finding. That is a real divergence, and it is scoped out here by
configuration rather than by argument.

## Consequences

- **ADR 0009's escalation is no longer a dead end on a dirty diff.** It has a defined,
  mechanical decomposition whose cost is bounded by the four axes.
- **Byte-identity is demoted from the pass condition to a fast path.** When it holds,
  the four axes are satisfied trivially and nothing further is owed. This is a
  clarification of ADR 0009's intent, not a reversal: it always meant the *mirrored
  semantics*, and byte-identity was the cheapest sufficient proof of them.
- **The baseline now records versions verified by two different standards.** `{0.5.1,
  0.7.0, 0.8.0}` were byte-identical to one another; `0.10.0` is semantically equivalent
  but textually different. The provenance comment above `scanC3ProjectMarkers` says
  which is which, because a future maintainer diffing `0.10.0` against `0.8.0` will get
  a dirty result and needs to know that was already adjudicated.
- **A filter-introduction check is now explicit.** It was previously implied by
  byte-identity and would have been easy to lose the moment byte-identity stopped
  holding — which is precisely when it starts to matter.
- **The multi-project divergence is a live expiry condition.** If this plugin ever
  configures more than one project, the mirror's ambiguity semantics must be revisited;
  this is the first time the mirror's correctness has depended on a *configuration*
  fact rather than on upstream code alone.
- Part 2 will expire again the moment `mcp-utils 0.11.0` publishes, exactly as ADR 0009
  predicted for its own iteration.

## Compromise

- **Amend ADR 0009 in place** — rejected, for the reason ADR 0009 itself gave when it
  declined to amend ADR 0007: this repo treats ADRs as historical records, and 0009's
  reasoning was correct for the state that existed when it was written. Byte-identity
  *had* held every time up to this bump.
- **Supersede ADR 0009** — rejected. The decision is not reversed; both of its steps
  still run, in the same order. This record defines only what happens on the branch it
  left open.
- **Treat the dirty diff as a failure and re-derive the mirror** — rejected as
  disproportionate once the decomposition showed the mirrored surface unchanged. The
  option remains the prescribed response if any of the four axes fails.
- **Import `resolveRootFolder` and delete the mirror** — still the genuinely correct
  fix, and still out of scope, for the reason ADR 0007 gave and ADR 0009 restated:
  `audit.mjs` is dependency-free plain ESM run directly by Node. This bump strengthens
  the case again — the discharge now needs a four-axis argument rather than one diff —
  without changing the scope calculus. Worth revisiting on its own.

## Related

- ADR 0006 — the mirror this verifies, and the `-32000` failure it exists to catch.
- ADR 0007 — the original two-part check.
- ADR 0009 — the closure-diff escalation this extends.
- [Verifying an MCP pin bump](../pin-bump-verification.md) — the operational runbook.
