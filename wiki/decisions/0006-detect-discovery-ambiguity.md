---
type: decision-record
title: "0006. Detect `project.c3proj` Discovery Ambiguity in the Audit"
description: >-
  A second bespoke audit check mirrors `resolveRootFolder`'s ambiguous-root discovery and reports it as a new advisory `warning` severity (exit code unchanged).
tags: [decision, architecture]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-27T00:00:00Z }
---
# 0006. Detect `project.c3proj` Discovery Ambiguity in the Audit

- **Status:** Accepted
- **Recorded:** 2026-07-10
- **Issue:** #47

## Context

`audit-c3-conventions` validates contract *presence/reachability* and resolves the C3 project root via `.gvt-agent.json` `paths.c3project` (see ADR 0005's `base: project`). It can report all-green.

But the plugin's `plugin.json` launches `c3-domain-manager` with **bare args (no `--project-dir`)**, so at runtime the server resolves its root by filesystem auto-discovery (`resolveRootFolder` in `@genvidtech/mcp-utils`, via `c3-domain-manager@0.6.1`). Precedence: explicit `--project-dir` > `C3_PROJECT_DIR` env > depth-1 auto-discovery > cwd fallback.

When the repo root does NOT contain `project.c3proj` and **≥2 immediate child directories each contain `project.c3proj`**, `resolveRootFolder` aborts with an "ambiguous root" error; the `server` command exits before the MCP handshake, so startup fails with `-32000`. ADR 0005 already anticipated this ("deeper or ambiguous layouts") but the audit did not detect it — a green audit did not imply a startable server. (Real repro: a real project at `sample/` plus an untracked downloaded reference project at repo root, both with `project.c3proj`.) Gitignoring the extra project does NOT help — discovery scans the filesystem, not git.

## Decision

Add a **second bespoke, script-level check** to `audit.mjs` — `checkDiscoveryAmbiguity`, built on a pure `classifyDiscovery` classifier — that mirrors `resolveRootFolder`'s discovery (depth-0 root short-circuit; else scan immediate child dirs only, no name-based filtering; ≥2 marker matches = ambiguous; `C3_PROJECT_DIR` truthy-after-trim suppresses). When it fires it emits an **advisory `warning`-severity finding** (a new severity tier, sitting between the existing `error` and `info`) naming the colliding directories and citing the `-32000` failure, with remediation (remove/relocate the extra `project.c3proj`, or pin `C3_PROJECT_DIR` / `--project-dir`). The finding does NOT change the exit-code contract — `warning` keeps exit 0 (only `error` exits 1); it is advisory, not a required-contract failure.

### Why a bespoke script-level check, not a `metadata.expects` entry

ADR 0002 established that requirements are declared data-drivenly in component frontmatter `metadata.expects`, and the audit script walks them — the deliberate exception being the C3-project marker check (the one bespoke check). Discovery ambiguity is a *count/enumeration across the filesystem* (≥2 dirs containing a marker), not the presence of one declared file/config/tool — it is structurally inexpressible as an `expects` entry. So it joins the marker check as the **second** deliberate bespoke exception. This is consistent with ADR 0002's boundary (presence/reachability), because enumerating directories that contain a marker is presence/count, not data-content parsing of `.c3proj` contents.

### Why a new `warning` severity, not `info`

A `-32000` startup abort is a *guaranteed* runtime failure, not an optional nicety. Reusing `info` would render it under "Info (optional)," underselling a guaranteed breakage. A dedicated `warning` tier gives it a "will break at runtime" section while still keeping exit 0 (advisory). Cost: `formatReport` gains a Warnings bucket and the summary `requiredTotal` denominator is fixed from `f.severity !== 'info'` to `f.ok || f.severity === 'error'` so a warning doesn't inflate the "required" count.

## Compromise

- **Reuse `severity: 'info'`** — zero report-machinery change, but presents a guaranteed hard failure under an "optional" heading. Rejected for visibility.
- **Add `--project-dir` / an `env` block to `plugin.json`** to avoid discovery entirely — rejected here for the same reason ADR 0005 Decision A rejected it: the static manifest can't compute a per-consumer subdir, and an explicit flag suppresses auto-discovery for everyone. The fix is an *advisory*, not a launch-config change.
- **Parse workspace `.mcp.json` to detect a pinned `--project-dir`/env override** (eliminating the one false positive where a consumer pinned the root) and **an optional root-divergence warning** (audit's `paths`-resolved root ≠ bare-discovery pick) — both deferred to a follow-up issue as extra scope beyond this slice. Env-only override detection (`C3_PROJECT_DIR` via `process.env`) is what ships.

## Consequences

- A green audit now also flags the specific filesystem layout that guarantees a `c3-domain-manager` `-32000` startup failure, turning a silent failure into a named, actionable finding.
- The audit gains a `warning` severity tier (between `error` and `info`); consumers/tooling reading audit output must account for a third severity. Exit-code contract is unchanged (only `error` → exit 1).
- The mirrored discovery logic is grounded in `c3-domain-manager@0.6.1` / `@genvidtech/mcp-utils@0.5.1`; per the reconcile-mcp-pin discipline, a future server pin bump that changes discovery semantics requires re-grounding this mirror. The server's own startup remains the authoritative check — this mirror is a preview.
- Deferred: `.mcp.json` override-awareness and the root-divergence advisory (follow-up issue).
