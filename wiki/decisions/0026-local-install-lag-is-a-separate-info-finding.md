---
type: decision-record
title: "0026. A Local Install That Differs from the MCP Pin Is a Separate info Finding Read from node_modules"
description: >-
  The audit reports a consuming repo's locally installed construct3-chef or c3-domain-manager whose version differs from the plugin's plugin.json pin as an advisory `local-install` info finding, one per pinned server and location. It reads exactly `node_modules/<package>/package.json` in the repo root and, when paths.c3project resolves elsewhere, the project root, never an ancestor, the lockfile or npx, and the finding never feeds the MCP version check.
tags: [decision, audit, mcp]
status: stable
generated: { by: process:plan-task, at: 2026-10-30T00:00:00Z }
---
# 0026. A Local Install That Differs from the MCP Pin Is a Separate info Finding Read from node_modules

- **Status:** Accepted
- **Recorded:** 2026-10-30
- **Issues:** #167
- **Extends:** [ADR 0021](0021-mcp-check-reads-the-plugin-pin-and-probes-sealed.md), whose
  alternatives table deferred this finding (#124 option 3) "to keep this change small ahead of
  the audit-core rewire (#95)". #95 closed on 2026-09-30. See also
  [The convention contract and the audit](/the-audit-contract.md).

## Context

The agents talk to the MCP server version the plugin's `plugin.json` `mcpServers` pins, run as
`npx -y <package>@<pin> server`. A consuming repo that carries `@genvidtech/construct3-chef` or
`@genvidtech/c3-domain-manager` in its own `package.json` runs its npm scripts with whatever copy
is installed in its `node_modules`. When a plugin release moves a pin, the two drift apart and
nothing reports it. #167 records such a case in burbank, where the lock still resolved older
versions than the plugin pinned. That observation comes from the issue; burbank is not
reachable from this workspace.

ADR 0021 made the MCP version check read only the plugin's pin, so a local install can no longer
change that verdict. Reporting the drift is a different statement from "the server is too old",
so it needs its own finding.

## Decision

1. **A separate advisory finding.** For each `mcpServers` argument of the form
   `@scope/name@x.y.z`, the audit compares the locally installed version with the pin. When they
   differ it emits one finding of kind `local-install` at `info` severity. The finding never moves
   the exit code and is never an input to the MCP version or reachability check, which is
   unchanged.
2. **Read exactly `<dir>/node_modules/<package>/package.json`.** No module resolution and no
   upward walk: an ancestor's `node_modules` says nothing about what this repo's scripts run.
   Measured on the planning machine on 2026-10-30 (`ls "$LOCALAPPDATA/Temp"`): the user's temp
   directory holds its own `package.json` and a `node_modules` with `c3-domain-manager` 0.11.0.
   That is one machine's state, not a general fact, but it is the kind of ancestor a walk would
   find. A missing, unreadable or version-less file means
   no local install and no finding.
3. **Two locations.** The repo root, which is the audit's working directory, and, when
   `paths.c3project` resolves to a different directory, that project root too. One finding per
   location and server that differs.
4. **One finding per pinned server, not per `expects` entry.** The servers come from the manifest,
   so a server that several components declare is reported once per location.
5. **Wording by direction.** An install older than the pin is told to refresh the lock
   (`npm update <package>` if the range allows it, else bump the range). An install newer than the
   pin is told to update the plugin. A version that isn't plain `x.y.z` gets neutral wording naming
   both.
6. **The logic lives in `scripts/lib/local-install.mjs`**, beside `mcp-check.mjs`, whose code and
   tests this change leaves untouched.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Read `package-lock.json` | npm-only, and it describes what `npm ci` would install rather than what the scripts run now |
| `node_modules`, falling back to the lockfile | catches a lagging lock before install, at the cost of a second parser and an npm-only branch; a repo with no `node_modules` has no local copy to disagree |
| Run `npx <package> --version` from the repo | cwd- and ancestor-dependent (ADR 0021, measurement 1) |
| Resolve the package with Node's module resolution | walks up to ancestors, which is the trap in decision 2 |
| Check the repo root only | misses a non-rooted consumer whose `package.json` sits beside its project |
| Raise the MCP version check to `warning` or `error` on a lagging install | reverses ADR 0021: the plugin's pin is what the agents run |

## Consequences

- A consumer with no local copy of either server sees no change.
- A consumer whose lock lags a pin bump sees the drift in the audit report instead of finding it by
  reading the CHANGELOG.
- Every pin bump in this plugin can turn the finding on in consumers until they refresh their
  locks. That is the intended signal, and it is `info`, so CI that gates on the audit's exit code
  is unaffected.
- A `package.json` deeper than the project root, or a local-scope install elsewhere, is not seen.
