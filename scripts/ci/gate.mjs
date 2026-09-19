#!/usr/bin/env node
// The shared test gate: runs every suite in this repo and proves each one
// actually ran.
//
// UNLIKE the three CLIs in scripts/ (check-doc-anchors, check-index-mirrors,
// audit-snapshot), which are deliberately NOT wired into .gvt-agent.json's
// commands.validate, this script IS the exception — commands.validate and CI
// both call it, so it is the one place the suite floors are maintained.
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

import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  parseTapSummary,
  checkGlobFloor,
  formatTapSummary,
  checkSuiteFloor,
} from '../lib/test-surface.mjs';

const SUITES = [
  {
    name: 'plugin',
    cwd: 'plugin',
    glob: 'skills/*/scripts/test/*.test.mjs',
    minFiles: 10,
    minPass: 197,
  },
  {
    name: 'workspace',
    cwd: '.',
    glob: 'scripts/test/*.test.mjs',
    minFiles: 3,
    minPass: 33,
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
    console.log(`files matched: 0 (floor ${suite.minFiles})`);
    fail(suite.name, `could not expand glob in ${suiteCwd}: ${err.message}`);
    console.log('');
    continue;
  }

  const globCheck = checkGlobFloor(files, suite.minFiles);
  console.log(globCheck.message);

  if (!globCheck.ok) {
    fail(
      suite.name,
      `glob matched ${globCheck.count} file(s), below floor ${globCheck.floor} — ` +
        `the suite did not run. Check the working directory: ${suiteCwd}`,
    );
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
