---
type: decision-record
title: "0018. Hold the Version Floor Through a Purely-Additive Major Upstream Bump"
description: >-
  When a major upstream bump adds capability without removing, renaming, or repathing anything a pinned skill or agent depends on, the consumer floor stays at the pre-bump version rather than moving because semver crossed a major boundary.
tags: [decision, architecture, mcp-pin]
status: stable
generated: { by: process:plan-task, at: 2026-09-18T00:00:00Z }
---
# 0018. Hold the Version Floor Through a Purely-Additive Major Upstream Bump

- **Status:** Accepted
- **Recorded:** 2026-09-18
- **Issue:** #120
- **Relates to:** #107 (the dm precedent), ADR 0009 / ADR 0015 (the `resolveRootFolder`
  mirror baseline this record deliberately does not re-open)

## Context

Bumping the pinned `@genvidtech/construct3-chef` MCP server from `1.2.0` to `2.0.0`
(#120) crossed a semver major boundary, which is the signal every prior floor-moving
bump in this repo's history (most visibly the `1.2.0` bump itself, driven by ADR 0013's
resource repath) has used as its trigger. This bump did not fit that pattern.

Measured this session, both versions packed and both servers spoken to live over MCP
stdio:

| Surface | 1.2.0 | 2.0.0 | Delta |
|---|---|---|---|
| MCP tools | 37 | 38 | **+`list-projects`** (READ_ONLY, `inputSchema: {}`) |
| Resources (`resources/list`) | 51 | 59 | +8, purely additive, nothing repathed |
| `resources/templates/list` | 1 | 1 | unchanged |

The one new tool, `list-projects`, takes no arguments. Every other tool's new `project`
selector parameter is **optional** (`z.string().optional()`), injected uniformly by the
server's `regP` registration helper. Nothing a currently-pinned skill or agent body
calls changed shape, moved path, or gained a required argument.

Separately, `@genvidtech/mcp-utils` moved `^0.8.0` → `^0.10.0`, resolving to exactly
`0.10.0`. That version is already a member of the reviewed baseline `{0.5.1, 0.7.0,
0.8.0, 0.10.0}` established across ADR 0009 and ADR 0015, so the `resolveRootFolder`
mirror obligation those records govern is discharged by the existing baseline — this
bump needs no new mirror review and no mirror ADR.

This is the second time a major-looking or minor-looking upstream bump has, on
inspection, added capability without breaking a consumer dependency:

- **#107** (`c3-domain-manager` `0.9.0` → `0.10.1`): added `list-projects`, moved
  `txId` to a composite string — additive and non-breaking for every consumer at the
  time. The floor held at `0.6.1`.
- **#120** (this bump, `construct3-chef` `1.2.0` → `2.0.0`): the pattern above.

Contrast against the case where the floor *does* move: the `1.2.0` bump repathed the
`docs:///` resource names chef exposes (ADR 0013), which broke a genuine consumer
dependency — a doc or agent naming an old resource path would resolve to nothing. That
bump moved all four floors. The difference is not the version number; it is whether
something a consumer depends on stopped working.

## Decision

**A consumer's version floor tracks what it actually depends on, not the pinned
package's semver major.** When a bump — major or otherwise — only adds tools,
resources, or optional parameters, and removes, renames, or repaths nothing a pinned
skill or agent relies on, the floor stays at its pre-bump value. The floor moves only
when a bump breaks something a consumer's *stated* dependency touches — a resource
path, a required parameter, a removed or renamed tool.

Concretely for #120: `c3-explorer.md` and `c3-implementer.md` (and every skill's
`metadata.expects.package` floor, where present) stay declared against `1.2.0`. Nothing
in the plugin depends on `list-projects`, the eight new resources, or the newly
optional `project` parameter, so nothing requires a newer floor to keep functioning.

This generalizes #107's outcome rather than introducing a new rule: #107 held the dm
floor at `0.6.1` through an equally additive bump, without a record explaining why.
This record makes that reasoning explicit and citable, so the next bump does not have
to re-derive it from a memory note.

## Consequences

- **A major-version crossing is not, by itself, evidence that a floor must move.** The
  question to ask at each pin bump is "did anything change shape underneath a
  dependency this plugin actually declares," not "did the major digit increment."
  Semver's own contract (a major bump *may* break something) is a necessary condition
  to check, not a sufficient one to act on.
- **The additive/breaking classification must be measured, not read off release
  notes.** ADR 0009 already established this for the `resolveRootFolder` mirror — this
  record extends the same discipline to the floor decision: pack both versions, diff
  the tool and resource surfaces, and confirm additions are strictly additive (no
  existing name repathed, no existing parameter made required) before concluding the
  floor can hold.
- **The mcp-utils mirror carve-out is scoped narrowly.** This record does not reopen or
  extend ADR 0009 / ADR 0015 — it only notes that, in this instance, the range move
  landed on an already-reviewed version, so no new mirror work was triggered. A future
  bump whose `mcp-utils` range resolves outside `{0.5.1, 0.7.0, 0.8.0, 0.10.0}` still
  owes that check independently of anything decided here.
- **A held floor is not a permanent one.** If a later bump repaths or removes something
  this plugin depends on — as `1.2.0` did — the floor moves then, on that bump's own
  evidence, regardless of what this record says about `1.2.0` → `2.0.0`.

## Compromise

- **Move the floor to `2.0.0` because it is the safer-looking default** — rejected. A
  floor that moves on every bump regardless of actual dependency stops signaling
  anything: it would no longer distinguish "consumers need this version" from
  "this is merely the newest version available," and every future bump would have to
  re-litigate what the floor is *for*.
- **Leave the reasoning as an unrecorded judgment call, as #107 did** — rejected. #107
  set the precedent without writing down why, which is exactly the gap this record
  closes; the next additive bump should not have to reconstruct the rule from a
  changelog entry and a memory note.
- **Fold this into ADR 0009 or ADR 0015 as an addendum** — rejected. Those records
  govern the `resolveRootFolder` mirror obligation specifically. The floor-holding
  question is broader than that one mirrored function, and conflating the two would
  make a future mirror-only bump look like it also needs a floor discussion, and vice
  versa.

## Related

- #107 — the `c3-domain-manager` `0.10.1` bump this record generalizes.
- ADR 0009, ADR 0015 — the `resolveRootFolder` mirror baseline this bump's `mcp-utils`
  range move lands inside, discharging that obligation without a new record.
- ADR 0013 — the contrasting case where a bump's resource repath *did* move every
  floor, which is what distinguishes "additive" from "breaking" in this record's terms.
