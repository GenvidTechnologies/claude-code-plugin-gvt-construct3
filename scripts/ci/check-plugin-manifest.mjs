#!/usr/bin/env node
// CI-only manifest check for plugin/.claude-plugin/plugin.json.
//
// Hermetic and dependency-free by design: it reads one file and parses it.
// No network, no npx, no child processes — so CI can run it before (and
// independently of) `claude plugin validate .`, which needs the CLI installed.
// It is not a replacement for that validator; it covers the two things this
// repo has historically got wrong by hand, namely a missing top-level key and
// an MCP server whose package argument drifted off a pinned version.
//
//   node scripts/ci/check-plugin-manifest.mjs
//
// Checks:
//   - the manifest parses as JSON;
//   - `name`, `version`, `description` are present and non-empty strings;
//   - `mcpServers` carries BOTH construct3-chef and c3-domain-manager, each
//     with an argument of the exact form `@genvidtech/<pkg>@<x.y.z>`. A range
//     (`^1.2.0`), a dist-tag (`latest`), or a bare package name is a failure:
//     the pin is the point (wiki/pin-bump-verification.md).
//
// Exits 1 naming the specific key that failed, 0 otherwise.
//
// Unlike scripts/ci/gate.mjs — whose sensitivity to the caller's cwd is the
// property it tests — this script resolves the manifest against its OWN
// location, since the manifest sits at a fixed path in the repo and there is
// nothing to learn from running the check in the wrong directory.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = resolve(REPO_ROOT, 'plugin', '.claude-plugin', 'plugin.json');

const REQUIRED_KEYS = ['name', 'version', 'description'];
const REQUIRED_SERVERS = ['construct3-chef', 'c3-domain-manager'];
const SCOPE = '@genvidtech/';

const problems = [];

function problem(key, message) {
  problems.push(`${key}: ${message}`);
}

/** A non-empty run of ASCII digits — no regex, no Number() coercion slack. */
function isDigits(text) {
  if (text.length === 0) return false;
  for (const ch of text) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

/**
 * `@genvidtech/<pkg>@<x.y.z>` → `{ pkg, version }`, else `null`.
 * The version must be exactly three numeric segments: anything carrying a
 * range operator or a dist-tag fails `isDigits` and is rejected.
 */
function parsePinnedArg(arg) {
  if (typeof arg !== 'string' || !arg.startsWith(SCOPE)) return null;
  const at = arg.lastIndexOf('@');
  if (at <= SCOPE.length - 1) return null;
  const pkg = arg.slice(0, at);
  const version = arg.slice(at + 1);
  if (pkg.length <= SCOPE.length) return null;
  const segments = version.split('.');
  if (segments.length !== 3 || !segments.every(isDigits)) return null;
  return { pkg, version };
}

let raw;
try {
  raw = readFileSync(MANIFEST, 'utf8');
} catch (err) {
  console.error(`plugin.json: cannot read ${MANIFEST} — ${err.message}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(raw);
} catch (err) {
  console.error(`plugin.json: does not parse as JSON — ${err.message}`);
  process.exit(1);
}

for (const key of REQUIRED_KEYS) {
  const value = manifest[key];
  if (typeof value !== 'string' || value.trim() === '') {
    problem(key, 'missing or not a non-empty string');
  }
}

const servers = manifest.mcpServers;
if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) {
  problem('mcpServers', 'missing or not an object');
} else {
  for (const name of REQUIRED_SERVERS) {
    const key = `mcpServers.${name}`;
    const server = servers[name];
    if (server === null || typeof server !== 'object' || Array.isArray(server)) {
      problem(key, 'missing or not an object');
      continue;
    }
    if (!Array.isArray(server.args)) {
      problem(`${key}.args`, 'missing or not an array');
      continue;
    }
    const pinned = server.args.map(parsePinnedArg).filter((p) => p !== null);
    if (pinned.length === 0) {
      problem(
        `${key}.args`,
        `no pinned ${SCOPE}<pkg>@<x.y.z> argument — got ${JSON.stringify(server.args)}`,
      );
      continue;
    }
    // The pinned package must be the one this server key names. Accepting any
    // pinned @genvidtech/* argument would pass a manifest that launches
    // c3-domain-manager under the construct3-chef key — a check that cannot tell
    // the two servers apart is not checking the pin, only its shape.
    const expected = `${SCOPE}${name}`;
    const match = pinned.find((p) => p.pkg === expected);
    if (!match) {
      problem(
        `${key}.args`,
        `pinned package does not match the server key — expected ${expected}, got ${pinned
          .map((p) => p.pkg)
          .join(', ')}`,
      );
      continue;
    }
    console.log(`${key}: ${match.pkg} pinned at ${match.version}`);
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`FAIL ${p}`);
  console.error(`check-plugin-manifest: FAILED (${problems.length} problem(s))`);
  process.exit(1);
}

console.log(`check-plugin-manifest: OK (${MANIFEST})`);
