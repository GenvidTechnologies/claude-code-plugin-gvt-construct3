// Pure logic for the audit's `expects.mcp[]` check, plus the one I/O helper
// (probeMcpPackage) that needs an injected `spawn` to stay testable without
// network. See ADR 0021 (wiki/decisions/0021-mcp-check-reads-the-plugin-pin-and-probes-sealed.md)
// for why the version comes from the plugin's own pin rather than the
// consuming repo's node_modules, and why the reachability probe runs from a
// sealed directory.

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

// Finds the version the plugin itself pins for `server`/`pkg` by reading the
// plugin's own manifest object — never the consuming repo's node_modules.
// Looks for the arg of manifest.mcpServers[server].args that starts with
// `${pkg}@` (the real args look like
// ["-y", "@genvidtech/construct3-chef@2.0.0", "server"]) and returns
// everything after that prefix, keyed purely on `pkg` — this is a lookup, not
// a second validator of the argument's format (scripts/ci/check-plugin-manifest.mjs
// already enforces that shape in CI).
//
// Returns null when: the manifest, mcpServers, the server entry, or its args
// is missing; no arg matches the `${pkg}@` prefix; or the remainder isn't
// exactly three dot-separated all-digit segments.
export function findPinnedVersion(manifest, server, pkg) {
  const args = manifest?.mcpServers?.[server]?.args;
  if (!Array.isArray(args)) return null;

  const prefix = `${pkg}@`;
  const match = args.find((arg) => typeof arg === 'string' && arg.startsWith(prefix));
  if (!match) return null;

  const remainder = match.slice(prefix.length);
  if (!/^\d+\.\d+\.\d+$/.test(remainder)) return null;

  return remainder;
}

// Compares two "x.y.z" version strings segment by segment. Missing segments
// default to 0. Equal versions compare as gte.
export function semverGte(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return true; // equal
}

// Builds the finding for one `expects.mcp[]` entry from its already-resolved
// pin and probe result. Pure — all I/O (reading plugin.json, running the
// probe) happens before this is called.
//
//   component — the component object being evaluated; only `.name` is read.
//   entry     — the `expects.mcp[]` entry (`server`, `package`, `minVersion`,
//               `required`, `reason`).
//   pin       — the string returned by findPinnedVersion, or null.
//   probe     — the object returned by probeMcpPackage (or an equivalent
//               `{ status, stdout, error }` shape).
export function evaluateMcpExpectation({ component, entry, pin, probe }) {
  const required = entry.required !== false;
  const server = entry.server;

  const fail = (detail) => ({
    kind: 'mcp',
    component: component.name,
    target: server,
    ok: false,
    severity: required ? 'error' : 'info',
    detail,
    reason: entry.reason,
  });

  if (pin === null || pin === undefined) {
    return fail(
      `no pinned version for \`${server}\` was found in the plugin's plugin.json mcpServers entry`,
    );
  }

  if (probe.error || probe.status !== 0) {
    const suffix = probe.error ? ` (${probe.error.message})` : '';
    return fail(`MCP server \`${server}\` not reachable via npx${suffix}`);
  }

  if (entry.minVersion && !semverGte(pin, entry.minVersion)) {
    return fail(
      `MCP server \`${server}\` is pinned at ${pin} in the plugin's plugin.json, needs >= ${entry.minVersion}`,
    );
  }

  return { kind: 'mcp', component: component.name, target: server, ok: true, detail: pin };
}

// Runs `npx -y <spec> --version` from a freshly created, empty-manifest
// directory, so neither the invoking directory nor any of its ancestors can
// change the result.
//
// npx treats a package as locally provided when the cwd's project (the
// nearest ancestor directory holding a package.json or node_modules)
// satisfies the spec, and then runs a local or ancestor bin instead of
// fetching. Measured 2026-09-23: in a directory whose package.json was the
// package itself (name + version), the probe failed with rc=1 ("is not
// recognized"); under an ancestor with a different installed version, it
// printed that other version. os.tmpdir() alone is not neutral, because it
// can itself hold a package.json/node_modules (it did on the planning
// machine). The empty `{}` package.json stops npm's upward walk at the
// sealed directory. See ADR 0021.
//
//   spec    — the exact spec to probe, e.g. "@genvidtech/construct3-chef@2.0.0".
//   spawn   — injected spawn function (spawnSync's signature); required, so
//             this is exercisable without ever shelling out to real npx.
//   tmpRoot — defaults to os.tmpdir(); overridable for tests.
export function probeMcpPackage(spec, { spawn, tmpRoot = os.tmpdir() } = {}) {
  const dir = mkdtempSync(join(tmpRoot, 'gvt-construct3-mcp-probe-'));
  writeFileSync(join(dir, 'package.json'), '{}');

  try {
    const result = spawn('npx', ['-y', spec, '--version'], {
      cwd: dir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    return {
      status: result.status ?? null,
      stdout: result.stdout ?? '',
      error: result.error,
    };
  } catch (err) {
    return { status: null, stdout: '', error: err };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
