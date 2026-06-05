# Plan — c3-explorer swap / geometric recon (issue #1)

**Branch:** `feat/explorer-swap-recon`
**Issue:** [#1](https://github.com/genvid-holdings/claude-code-plugin-genvid-c3/issues/1) — c3-explorer: report geometric/shape compatibility on component swaps, not just behavioral

## Problem (issue is the requirements doc)

`c3-explorer` produces thorough *behavioral* swap recon (ACEs, wiring, instance vars)
but never reports *geometric/visual* compatibility. In Burbank #55 an API-perfect
button swap was dead on arrival because the silhouettes differed — caught only by a
human reviewing by eye, after full behavioral recon. The first recon question for a
swap should be "can Y visually replace X?".

## Design decisions (resolved)

1. **Framing — observable data + flag visual check.** The agent is haiku, data-only;
   it reads layout/addon JSON, not pixels. It reports the geometric facts it *can*
   observe (bounding size, origin/anchor, animation-frame inventory, collision poly if
   exposed) and surfaces "visual silhouette match must be confirmed by eye" as an
   explicit, up-front **blocking** constraint. It never overclaims a visual comparison.
2. **Placement — new dedicated section** `## Swap / replacement recon`, after `## Tips`,
   before `## C3 platform reference`.
3. **Tool overlap — leave tools to #4.** No `tools:` frontmatter change here; guidance
   uses only already-listed tools (`read-layout`, `read-addon`). Issue #4 (tool-inventory
   reconciliation, same file) confirms/strengthens whether collision-poly / image-point
   data is actually exposed at the pinned server versions.

## Friction

- The checklist names collision polygon / image points; whether
  `construct3-chef@0.6.0` exposes these via `read-layout`/`read-addon` is #4's scope.
  Wording hedges ("note it **if exposed**") so the guidance is correct either way.
- The change deliberately edits the same file as #4 — cross-ref comments on both
  issues already flag the coordination.

## Tasks (one commit each)

- **prep** — save this plan; commit `chore: plan c3-explorer swap recon (#1)`.
- **T1** — add `## Swap / replacement recon` section to `plugin/agents/c3-explorer.md`;
  commit `feat: c3-explorer reports geometric/visual swap compatibility (#1)`.

## Gates

- `genvid-dev:validator` — `cd plugin && claude plugin validate . && node --test skills/audit-c3-conventions/scripts/test/*.test.mjs`. Body-only edit, no frontmatter touched → expected to pass.
- `genvid-dev:code-reviewer`.
- Open PR referencing #1.
