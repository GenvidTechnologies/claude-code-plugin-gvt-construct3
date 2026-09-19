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
// The checks themselves live in the pure lib scripts/lib/plugin-manifest.mjs
// (wiki/skill-authoring-conventions.md, "Split a pure transform from a thin
// I/O CLI"); this file owns only path resolution, reading, JSON.parse, and
// printing. JSON.parse deliberately stays here rather than in the lib: the
// lib's contract is that it receives an already-parsed object, and the
// parse-failure message below names the file path, which is an I/O concern.
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
import { checkManifest } from '../lib/plugin-manifest.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = resolve(REPO_ROOT, 'plugin', '.claude-plugin', 'plugin.json');

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

const { ok, problems, pins } = checkManifest(manifest);

for (const pin of pins) {
  console.log(`${pin.key}: ${pin.pkg} pinned at ${pin.version}`);
}

if (!ok) {
  for (const p of problems) console.error(`FAIL ${p.key}: ${p.message}`);
  console.error(`check-plugin-manifest: FAILED (${problems.length} problem(s))`);
  process.exit(1);
}

console.log(`check-plugin-manifest: OK (${MANIFEST})`);
