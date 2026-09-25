#!/usr/bin/env node
// The shared test gate: runs every suite in this repo and proves each one
// actually ran.
//
// UNLIKE the CLIs in scripts/ (check-doc-anchors, check-index-mirrors,
// audit-snapshot, mcp-surface), which are deliberately NOT wired into
// .gvt-agent.json's commands.validate, this script IS the exception —
// commands.validate and CI both call it, so it is the one place the suite
// floors are maintained.
//
//   node scripts/ci/gate.mjs
//
// It exists because the plugin test glob `skills/*/scripts/test/*.test.mjs` is
// relative to `plugin/`. Run from the repo root the glob matches nothing, the
// runner prints `# pass 0`, and the process EXITS 0 — a green run that
// verified nothing. This gate turns that same input into exit 1.
//
// Two design choices are load-bearing and must not be "improved":
//
// 1. Each suite's cwd is resolved against process.cwd(), NOT import.meta.url.
//    Anchoring on the script's own location would make the gate run correctly
//    from anywhere, which sounds better and is exactly wrong: the gate's
//    SENSITIVITY to where it is run from is the property under test. An
//    import.meta.url-anchored gate could never report `files matched: 0`, so
//    the fail-open case it exists to catch would become unobservable.
//
// 2. The glob is expanded in Node via fs.globSync with an explicit cwd, and
//    the matched files are handed to the runner as an explicit argument list.
//    Shell glob expansion in the wrong directory is the original trap; there
//    is no shell anywhere in this script.
//
// The per-suite output strings (`files matched: N (floor F)` and
// `tests=N pass=N fail=N`) are pinned — CI criteria grep for them literally,
// and they are printed on SUCCESS as well as failure so a reader can tell
// "passed" from "ran nothing" by reading the numbers rather than trusting an
// exit code.
//
// Floors are `>=`: adding tests never breaks the gate, only losing them does.
// Exits 1 if any suite matches too few files, produces an unparseable TAP
// summary, reports a failure, passes fewer than its floor, or exits nonzero.
//
// The file-count floor is DERIVED from each suite's `expect` list below,
// rather than a free-standing `minFiles` literal — there is no `minFiles` in
// this file's SUITES entries; the floor is `expect.length`. Entries are
// POSIX-style (`a/b.test.mjs`) because `fs.globSync` returns platform-native
// separators — backslashes on Windows, forward slashes on Linux/CI — and
// `scripts/lib/floor-stale.mjs`'s `checkInventory` normalises both sides
// through `toPosix` before comparing. A declared file that is actually
// MISSING is fatal and named in the failure line; a file that is PRESENT but
// not declared in `expect` is advisory only (`STALE`, via `checkFloorStale`)
// so `>=` still holds — adding a test file can never break the gate, it can
// only make the declared inventory stale.

import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseTapSummary,
  checkGlobFloor,
  formatTapSummary,
  checkSuiteFloor,
} from '../lib/test-surface.mjs';
import { checkInventory, checkFloorStale } from '../lib/floor-stale.mjs';

const SUITES = [
  {
    name: 'plugin',
    cwd: 'plugin',
    glob: 'skills/*/scripts/test/*.test.mjs',
    // The file-count floor is this list's length — see the header comment.
    expect: [
      'skills/audit-c3-conventions/scripts/test/audit.test.mjs',
      'skills/audit-c3-conventions/scripts/test/config-resolve.test.mjs',
      'skills/audit-c3-conventions/scripts/test/frontmatter-branches.test.mjs',
      'skills/audit-c3-conventions/scripts/test/frontmatter.test.mjs',
      'skills/audit-c3-conventions/scripts/test/mcp-check.test.mjs',
      'skills/audit-c3-conventions/scripts/test/preflight.test.mjs',
      'skills/author-navigation-patterns/scripts/test/dsl-files.test.mjs',
      'skills/author-navigation-patterns/scripts/test/nav-patterns.test.mjs',
      'skills/author-navigation-patterns/scripts/test/preview-patterns.test.mjs',
      'skills/build-reference/scripts/test/cdn-aces.test.mjs',
      'skills/build-reference/scripts/test/merge.test.mjs',
      'skills/build-reference/scripts/test/reference-index.test.mjs',
    ],
    minPass: 230,
  },
  {
    name: 'workspace',
    cwd: '.',
    glob: 'scripts/test/*.test.mjs',
    // The file-count floor is this list's length — see the header comment.
    expect: [
      'scripts/test/audit-snapshot.test.mjs',
      'scripts/test/doc-anchors.test.mjs',
      'scripts/test/floor-stale.test.mjs',
      'scripts/test/index-mirrors.test.mjs',
      'scripts/test/mcp-surface.test.mjs',
      'scripts/test/plugin-manifest.test.mjs',
      'scripts/test/test-surface.test.mjs',
    ],
    minPass: 94,
  },
];

let failed = false;

function fail(suiteName, reason) {
  failed = true;
  console.log(`FAIL [${suiteName}] ${reason}`);
}

for (const suite of SUITES) {
  // Deliberately relative to the CALLER's cwd — see note 1 in the header.
  const suiteCwd = resolve(process.cwd(), suite.cwd);

  console.log(`== ${suite.name} (cwd: ${suite.cwd}, glob: ${suite.glob}) ==`);

  let files = [];
  try {
    files = globSync(suite.glob, { cwd: suiteCwd }).sort();
  } catch (err) {
    console.log(`files matched: 0 (floor ${suite.expect.length})`);
    fail(suite.name, `could not expand glob in ${suiteCwd}: ${err.message}`);
    console.log('');
    continue;
  }

  const globCheck = checkGlobFloor(files, suite.expect.length);
  console.log(globCheck.message);

  const inventory = checkInventory(files, suite.expect);
  if (inventory.missing.length > 0) {
    fail(suite.name, `expected test file(s) missing: ${inventory.missing.join(', ')}`);
  }

  if (!globCheck.ok) {
    fail(
      suite.name,
      `glob matched ${globCheck.count} file(s), below floor ${globCheck.floor} — ` +
        `the suite did not run. Check the working directory: ${suiteCwd}`,
    );
  }

  if (inventory.missing.length > 0 || !globCheck.ok) {
    console.log('');
    continue;
  }

  const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd: suiteCwd,
    encoding: 'utf8',
  });

  if (run.error) {
    fail(suite.name, `could not run the test runner: ${run.error.message}`);
    console.log('');
    continue;
  }

  const stdout = run.stdout ?? '';
  const summary = parseTapSummary(stdout);

  if (summary.ok) {
    console.log(formatTapSummary(summary));
  } else {
    console.log('tests=? pass=? fail=?');
  }
  console.log(`runner exit: ${run.status}`);

  const floorCheck = checkSuiteFloor(summary, suite.minPass);
  for (const reason of floorCheck.reasons) fail(suite.name, reason);

  if (run.status !== 0) {
    fail(suite.name, `test runner exited ${run.status}`);
  }

  if (!floorCheck.ok || run.status !== 0) {
    console.log('--- runner output ---');
    console.log(stdout.trimEnd());
    if (run.stderr) console.log(run.stderr.trimEnd());
    console.log('--- end runner output ---');
  } else {
    console.log(`OK ${suite.name}: ${globCheck.count} file(s), ${summary.pass} passing (floor ${suite.minPass})`);

    const stale = checkFloorStale({
      name: suite.name,
      unlisted: inventory.unlisted,
      pass: summary.pass,
      minPass: suite.minPass,
    });
    if (stale.stale) {
      console.log(stale.message);
    }
  }

  console.log('');
}

if (failed) {
  console.log('gate: FAILED');
  process.exitCode = 1;
} else {
  console.log('gate: OK');
  process.exitCode = 0;
}
