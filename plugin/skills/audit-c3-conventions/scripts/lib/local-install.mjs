// Pure logic for the audit's advisory local-install check, plus one small I/O
// helper (readInstalledVersion). See ADR 0021
// (wiki/decisions/0021-mcp-check-reads-the-plugin-pin-and-probes-sealed.md) and
// issue #167.
//
// The agents talk to the MCP server version the plugin's plugin.json pins (run
// via `npx -y <pkg>@<pin>`), while a consuming repo's own npm scripts run
// whatever copy sits in its node_modules. When the two differ, the same tool
// can behave differently depending on who invokes it. This check reports the
// difference as an `info` finding; it never affects the exit code.
//
// The lookup is deliberately NOT a module resolution: it reads exactly
// `<dir>/node_modules/<pkg>/package.json` and never walks up to an ancestor.
// An ancestor's node_modules (e.g. the user's temp directory, which holds its
// own) says nothing about what this repo's scripts run.

import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { PROBE_SPEC_RE, semverGte } from './mcp-check.mjs';

// Lists the pinned server packages declared in the plugin manifest: one
// `{ server, pkg, pin }` per mcpServers arg that is exactly
// `@scope/name@x.y.z` (split at the last `@`). Returns [] when the manifest or
// its mcpServers is missing.
export function pinnedServerSpecs(manifest) {
  const servers = manifest?.mcpServers;
  if (!servers || typeof servers !== 'object') return [];

  const specs = [];
  for (const [server, def] of Object.entries(servers)) {
    const args = def?.args;
    if (!Array.isArray(args)) continue;
    for (const arg of args) {
      if (typeof arg !== 'string' || !PROBE_SPEC_RE.test(arg)) continue;
      const at = arg.lastIndexOf('@');
      specs.push({ server, pkg: arg.slice(0, at), pin: arg.slice(at + 1) });
    }
  }
  return specs;
}

// Reads the installed version of `pkg` under `dir`, from exactly
// `dir/node_modules/<pkg>/package.json`. Returns the `version` string when it
// is non-empty, otherwise null (missing or unreadable file, invalid JSON,
// absent or non-string version). Never throws, never looks in an ancestor.
export function readInstalledVersion(dir, pkg) {
  try {
    const file = join(dir, 'node_modules', ...pkg.split('/'), 'package.json');
    const version = JSON.parse(readFileSync(file, 'utf8'))?.version;
    return typeof version === 'string' && version !== '' ? version : null;
  } catch {
    return null;
  }
}

const PLAIN_SEMVER_RE = /^\d+\.\d+\.\d+$/;

// Builds the `info` finding for one pinned server in one directory, or null
// when there is nothing to report. Pure.
//
//   installed — version found locally, or null/undefined when none.
//   location  — directory relative to the repo root, POSIX-style ('' for the
//               repo root itself).
export function evaluateLocalInstall({ server, pkg, pin, installed, location }) {
  if (installed === null || installed === undefined || installed === pin) return null;

  const target = location ? `${location}/node_modules/${pkg}` : `node_modules/${pkg}`;
  let detail = `locally installed ${pkg} is ${installed}, but the plugin pins ${pin} for \`${server}\``;

  if (PLAIN_SEMVER_RE.test(installed) && PLAIN_SEMVER_RE.test(pin)) {
    if (semverGte(pin, installed)) {
      detail +=
        ` — the repo's npm scripts and the agents run different versions (regenerated` +
        ` \`extracted/\` output can drift); refresh the lock (\`npm update ${pkg}\` if the` +
        ` range allows it, otherwise bump the range)`;
    } else {
      detail += ` — the plugin's pin is older than the repo's install; update the plugin`;
    }
  } else {
    detail += ` — the versions differ (installed ${installed}, pinned ${pin})`;
  }

  return {
    kind: 'local-install',
    component: 'gvt-construct3',
    target,
    ok: false,
    severity: 'info',
    detail,
    reason:
      'The agents talk to the server version the plugin pins, while the repo\'s own npm scripts run the locally installed copy. Informational only; it never affects the exit code.',
  };
}

// Checks every distinct directory in [repoRoot, projectRoot] (deduplicated by
// resolved path) against every pinned spec in the manifest and returns the
// non-null findings. `read` is injectable for tests.
export function checkLocalInstalls({ manifest, repoRoot, projectRoot, read = readInstalledVersion }) {
  const specs = pinnedServerSpecs(manifest);
  const dirs = [];
  const seen = new Set();
  for (const dir of [repoRoot, projectRoot]) {
    if (typeof dir !== 'string') continue;
    const key = resolve(dir);
    if (seen.has(key)) continue;
    seen.add(key);
    dirs.push(dir);
  }

  const findings = [];
  for (const dir of dirs) {
    const location = relative(resolve(repoRoot), resolve(dir)).split('\\').join('/');
    for (const { server, pkg, pin } of specs) {
      const finding = evaluateLocalInstall({ server, pkg, pin, installed: read(dir, pkg), location });
      if (finding) findings.push(finding);
    }
  }
  return findings;
}
