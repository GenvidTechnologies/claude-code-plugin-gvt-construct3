import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTapSummary,
  checkGlobFloor,
  formatTapSummary,
  checkSuiteFloor,
} from '../lib/test-surface.mjs';

const TAP_OK = ['TAP version 13', 'ok 1 - something', '1..1', '# tests 197', '# suites 0', '# pass 197', '# fail 0', '# duration_ms 1234.5'].join('\n');

test('checkGlobFloor rejects a 0-file glob result against a non-zero floor, with the pinned message', () => {
  const result = checkGlobFloor([], 10);
  assert.equal(result.ok, false);
  assert.equal(result.count, 0);
  assert.equal(result.message, 'files matched: 0 (floor 10)');
});

test('checkGlobFloor accepts a count at or above the floor (floors are >=, so extra files never fail)', () => {
  const at = checkGlobFloor(['a', 'b', 'c'], 3);
  assert.equal(at.ok, true);
  assert.equal(at.message, 'files matched: 3 (floor 3)');

  const above = checkGlobFloor(['a', 'b', 'c', 'd'], 3);
  assert.equal(above.ok, true);
  assert.equal(above.message, 'files matched: 4 (floor 3)');
});

test('parseTapSummary reads tests/pass/fail from a TAP run, and formats the pinned tally', () => {
  const summary = parseTapSummary(TAP_OK);
  assert.equal(summary.ok, true);
  assert.equal(summary.tests, 197);
  assert.equal(summary.pass, 197);
  assert.equal(summary.fail, 0);
  assert.equal(formatTapSummary(summary), 'tests=197 pass=197 fail=0');
});

test('parseTapSummary signals unparseable — a missing "# pass" line is NOT read as pass: 0', () => {
  const noSummary = parseTapSummary('TAP version 13\nok 1 - something\n1..1\n');
  assert.equal(noSummary.ok, false);
  assert.notEqual(noSummary.pass, 0);
  assert.equal(noSummary.pass, undefined);
  assert.match(noSummary.reason, /tests, pass, fail/);

  // An indented nested tally must not be mistaken for the run-level summary.
  const indentedOnly = parseTapSummary('    # tests 3\n    # pass 3\n    # fail 0\n');
  assert.equal(indentedOnly.ok, false);
});

test('checkSuiteFloor rejects an unparseable summary', () => {
  const result = checkSuiteFloor(parseTapSummary('no summary here'), 197);
  assert.equal(result.ok, false);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /unparseable/);
});

test('checkSuiteFloor rejects fail > 0 even when the pass floor is cleared', () => {
  const summary = parseTapSummary('# tests 200\n# pass 197\n# fail 3\n');
  assert.equal(summary.ok, true);

  const result = checkSuiteFloor(summary, 197);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['3 test(s) failed']);
});

test('checkSuiteFloor rejects pass < floor — the fail-open case where the glob matched nothing', () => {
  const summary = parseTapSummary('# tests 0\n# pass 0\n# fail 0\n');
  assert.equal(summary.ok, true);
  assert.equal(summary.pass, 0);

  const result = checkSuiteFloor(summary, 197);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['pass 0 is below floor 197']);
});

test('checkSuiteFloor accepts a clean run at or above the floor', () => {
  assert.deepEqual(checkSuiteFloor(parseTapSummary(TAP_OK), 197), { ok: true, reasons: [] });
  assert.deepEqual(checkSuiteFloor(parseTapSummary(TAP_OK), 100), { ok: true, reasons: [] });
});
