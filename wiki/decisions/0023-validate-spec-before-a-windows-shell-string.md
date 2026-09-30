---
type: decision-record
title: "0023. The Windows npx Probe Validates the Spec, Then Passes One Command String"
description: >-
  On Windows the MCP probe still runs the PATH npx that the plugin's servers launch with, which Node can only spawn through cmd.exe. It passes that shell one command string instead of an args array alongside shell true (DEP0190), and first rejects any spec that is not a scoped name at an exact x.y.z version, because validating is safer than quoting for cmd.exe.
tags: [decision, audit, mcp, windows]
status: stable
generated: { by: process:plan-task, at: 2026-09-30T00:00:00Z }
---
# 0023. The Windows npx Probe Validates the Spec, Then Passes One Command String

- **Status:** Accepted
- **Recorded:** 2026-09-30
- **Issues:** #142
- **Relates to:** [ADR 0021](0021-mcp-check-reads-the-plugin-pin-and-probes-sealed.md). Its
  decisions 2 (probe the exact pinned spec) and 3 (probe from a sealed directory) stand
  unchanged; this record changes only how the spawn is shaped. See also
  `wiki/the-audit-contract.md` § *MCP probing*.

## Context

`probeMcpPackage` ran `spawn('npx', ['-y', spec, '--version'], { …, shell: process.platform === 'win32' })`.
That was the state at v3.1.0. On Windows `npx` is `npx.cmd`, and Node spawns a `.cmd` only
through a shell. Measured during design on Node v24.11.1:
- `spawnSync('npx', args)` with no shell fails with `ENOENT`.
- `spawnSync('npx.cmd', args)` with no shell fails with `EINVAL`.

Node 24 deprecates passing an args array together with `shell: true` (`DEP0190`). The args
are concatenated into the `cmd.exe` line without escaping. Two consequences were measured
on Windows 11, Node v24.11.1:

1. **The warning.** Every audit run on Windows printed
   `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true …`
   above the report. `spawnSync('cmd', ['/c', 'echo', 'x'], { shell: true })` prints it.
   The single-string form `spawnSync('cmd /c echo x', { shell: true })` does not.
2. **A malformed spec could flip the verdict.** The probe was run from a sealed `{}`
   directory with the old call shape:
   - spec `@genvidtech/nonexistent-zz@1.0.0` → status **1**;
   - the same spec with ` & echo INJECTED` appended → status **0**, stdout
     `INJECTED --version`.

   An unreachable package read as reachable. The spec is built from the plugin's own
   `plugin.json` pin and its components' frontmatter, so no shipped pin triggers this. But
   nothing in the shipped code checked the package-name part: `findPinnedVersion` validates
   only the `x.y.z` suffix.

## Decision

1. **The probe still invokes the PATH `npx`**, the same launcher `plugin.json`'s
   `mcpServers` entries use. What it answers is still "can the launcher fetch this exact
   spec?"
2. **The spec is validated before it reaches a shell,** on every platform. It must match
   `^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+$`, which is
   `isProbeableSpec`/`PROBE_SPEC_RE` in `mcp-check.mjs`.
   - A spec that fails is rejected before the probe directory is created, and it never
     reaches `spawn`.
   - It surfaces as the existing `not reachable via npx` finding, with a
     `refusing to probe "<spec>"` detail. The result shape `{ status, stdout, error }` is
     unchanged.
3. **On `win32` the probe passes one command string** (`npx -y <spec> --version`,
   `shell: true`, `args: []`). This is the form `DEP0190` asks for. Elsewhere it keeps
   `spawn('npx', ['-y', spec, '--version'])` with no shell.
   - The choice is made by a pure `buildNpxInvocation(spec, platform)`.
   - `probeMcpPackage` takes an injectable `platform`, so the Windows shape is unit-tested
     on the Linux CI runner.
4. **Validate, don't quote.** Inside `cmd.exe`, `"` and `%` can't be escaped reliably. An
   allow-list that excludes every `cmd.exe` metacharacter is safer than a quoting helper.
5. **The dev workspace follows the same rule.** `scripts/audit-diff.mjs` and
   `scripts/mcp-surface.mjs` shared a `runNpm` whose `npm.cmd` fallback had the same
   args-array-plus-shell shape. They now call `scripts/lib/npm-invocation.mjs`:
   - It keeps running `npm-cli.js` next to `node` with no shell as the first choice.
   - On Windows, its fallback allow-lists every argument before building one command
     string.
   - Neither side imports the other: shipped code still may not import `scripts/lib`
     (ADR 0021).

## Alternatives rejected

| Alternative | Why not |
|---|---|
| Run npx's JS entry point with `node` and no shell, locating `npx-cli.js` next to `process.execPath` | The fallback when the file is missing would need this record's string form anyway. It also probes a possibly different npm: `npx.cmd` prefers `<npm prefix -g>\node_modules\npm\bin\npx-cli.js` when present, so it can diverge from the file next to `node.exe` after a global npm upgrade. The probe exists to test the launcher the servers actually use. Where the file sits was checked only on one nvs install, not under nvm-windows, volta, scoop or the MSI installer. `npm_execpath` is no help: it is unset under a plain `node audit.mjs`, and under npm it points at `npm-cli.js`. |
| Quote the spec into the command string | `cmd.exe` quoting can't reliably neutralise `"` or `%`. The spec's legitimate alphabet is small enough to allow-list. |
| Spawn `cmd.exe /d /s /c "…"` explicitly with `windowsVerbatimArguments` | The same shell exposure as the chosen form, more code, and it depends on Node-internal quoting behaviour. |
| Share one helper between the plugin probe and the workspace scripts | Shipped code may not import dev-workspace `scripts/lib` (ADR 0021). The two predicates also differ: an exact npx spec in the plugin, generic npm arguments in the workspace. |

## Consequences

- On Windows the audit's stderr no longer carries `DEP0190`. Measured after the change on
  the `scripts/test/fixtures/audit-diff/rooted` fixture: 0 `DEP0190` lines (1 before), with
  18 of 18 expectations and exit 0 unchanged.
- The probe's output still depends on `cmd.exe` resolving `npx` on PATH, as it did before.
  The Windows install managers behave the same as before this change.
- A future pin whose shape the allow-list doesn't admit (a prerelease version, for example)
  will fail `isProbeableSpec: accepts every spec plugin.json pins`, which reads the real
  `plugin.json`. So widening the pattern will be a deliberate change, not a silent one.
- `scripts/lib/audit-diff.mjs`'s `normalise` still masks the PID in `DEP0190` lines, because
  comparisons against v3.1.0 and earlier still carry the warning.
