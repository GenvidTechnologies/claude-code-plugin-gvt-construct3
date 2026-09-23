---
type: decision-record
title: "0021. The MCP Check Reads the Plugin's Own Pin and Probes the Pinned Spec from a Sealed Directory"
description: >-
  The audit's MCP expectation takes the server version from the plugin's own plugin.json pin instead of the consuming repo's node_modules, and probes reachability by running the exact pinned spec from a fresh temp directory holding an empty package.json, so neither the invoking directory nor its ancestors can change the verdict.
tags: [decision, audit, mcp, expects]
status: stable
generated: { by: process:plan-task, at: 2026-09-23T00:00:00Z }
---
# 0021. The MCP Check Reads the Plugin's Own Pin and Probes the Pinned Spec from a Sealed Directory

- **Status:** Accepted
- **Recorded:** 2026-09-23
- **Issues:** #124, #126 (planned together; criteria pledged on #124)
- **Relates to:** [ADR 0002](0002-data-driven-audit-contract.md) (the `expects` contract this
  check evaluates — unchanged), `wiki/the-audit-contract.md` § *MCP probing*

## Context

`audit-c3-conventions` evaluates each `metadata.expects.mcp` entry in two steps: a
reachability probe, then a version check against `minVersion`. Until this record both steps
answered a question about the **consuming repo** rather than about the server the plugin
actually launches (`npx -y <pkg>@<pin> server`, from `plugin/.claude-plugin/plugin.json`).

- **Version (#124).** The version came from `resolvePackageVersion`, which walked the
  consuming repo's `node_modules` upward for the package's `package.json`, and fell back to
  parsing the probe's stdout only when no local copy existed. The comment justifying that
  order said both CLIs report `--version` as `"unknown"`. That premise had expired:
  `npx -y @genvidtech/construct3-chef@2.0.0 --version` prints `2.0.0` and
  `npx -y @genvidtech/c3-domain-manager@0.10.1 --version` prints `0.10.1`. Measured from a
  fixture with a real `npm install -D @genvidtech/construct3-chef@0.11.2`, the audit reported
  `` `construct3-chef` is 0.11.2, needs >= 1.2.0 `` four times and exited 1 — although the
  plugin launches `2.0.0`. Carrying the devDependency was what broke the check.
- **Reachability (#126).** The probe ran `npx -y <pkg> --version` — the **bare** package, so
  it resolved `latest` (`c3-domain-manager` 0.11.0) rather than the pinned 0.10.1 — with no
  `cwd`, inheriting the audit's. npx treats a package as locally provided when the cwd's
  project (the nearest directory upward holding a `package.json` or `node_modules`) satisfies
  the spec, and then runs a local bin instead of fetching. In a fixture whose `package.json`
  was the package itself (name `@genvidtech/c3-domain-manager`, version `0.10.1`, with its
  `bin`), both the bare and the **pinned** spec failed with
  `'c3-domain-manager' is not recognized`, rc=1, and the audit reported
  `not reachable via npx` for a healthy published package.

Two measurements ruled out the smaller fixes the issues proposed:

1. **Preferring the probe's stdout** (#124 option 2) is unsafe: stdout depends on the cwd
   *and its ancestors*. Under an ancestor directory that had `c3-domain-manager` 0.11.0
   installed, a cwd whose `package.json` matched name and version made
   `npx -y @genvidtech/c3-domain-manager@0.10.1 --version` print **`0.11.0`**.
2. **`cwd: os.tmpdir()`** (#126 option 1) is not neutral in general: on the planning machine
   `os.tmpdir()` itself held a `package.json` (depending on `@genvidtech/c3-domain-manager`)
   and a `node_modules`.

A matching `bin` alone (package name `x`), or a matching name with no version, did **not**
trigger the failure in these measurements; the reproduced trigger is a cwd project that
satisfies the spec.

## Decision

1. **The version in force is the plugin's own pin.** The audit reads
   `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, finds the argument of
   `mcpServers[<server>].args` that starts with `<package>@`, and compares its version against
   `minVersion`. A failure names the pin and `plugin.json`. The consuming repo's
   `node_modules` is no longer read by this check at all, so installing or removing a
   devDependency cannot change the verdict. The lookup is keyed on the `package` the
   `expects` entry already declares; it is not a second validator of the argument's format,
   which `scripts/ci/check-plugin-manifest.mjs` already enforces in CI.
2. **The probe runs the exact pinned spec** — `npx -y <package>@<pin> --version` — so
   reachability is tested for the version the plugin launches, not for `latest`.
3. **The probe runs from a sealed directory:** a fresh `mkdtemp` under `os.tmpdir()` holding
   an empty `{}` `package.json`, removed afterwards. The empty manifest stops npm's upward
   project walk at that directory, so neither the invoking directory nor any ancestor can
   satisfy the spec locally.
4. **The verdict is a pure function** (`scripts/lib/mcp-check.mjs`), with the one I/O helper
   taking an injected `spawn`, so cwd independence is unit-tested without network.

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Prefer `--version` stdout, `node_modules` as fallback (#124 option 2) | stdout is cwd- and ancestor-dependent (measurement 1) |
| Report a lagging local devDependency as a separate `info` finding (#124 option 3) | a different statement from "the server is too old"; deferred to keep this change small ahead of the audit-core rewire (#95) |
| `cwd: os.tmpdir()` (#126 option 1) | not neutral in general (measurement 2) |
| `cwd: CLAUDE_PLUGIN_ROOT` | correct only while the shipped `plugin/package.json` stays bin-less and dependency-free — an invariant nothing enforces for this purpose |
| Detect the shim-missing failure and downgrade it to `info` (#126 option 2) | a platform-specific string match; unnecessary once the shadow is avoided rather than detected |
| Import `parsePinnedArg` from `scripts/lib/plugin-manifest.mjs` | dev-workspace code outside the shipped `plugin/` subtree, which installs on its own |

## Consequences

- A consumer's local devDependency no longer affects the audit. `SKILL.md`'s remediation
  advice to add one "to pin it locally" is removed, since it would have no effect.
- The check now verifies the plugin's internal consistency (its pin against its own
  components' floors) plus the environment's ability to fetch that exact version. A pin below
  a floor fails in every consuming repo alike — which is the correct reading: the plugin
  itself is inconsistent.
- The probe still costs one `npx` per `expects` entry; caching per spec is out of scope.
- The plugin's own server launch (`plugin.json` `mcpServers`, run from the workspace root) is
  **not** sealed by this record and remains subject to the same local-project shadow in a
  repo that publishes one of the servers (#126 § *Impact*).
