import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toPosix, checkInventory, checkFloorStale } from '../lib/floor-stale.mjs';

test('checkInventory reports both arrays empty when the glob matches exactly the declared inventory', () => {
  const files = ['scripts/test/a.test.mjs', 'scripts/test/b.test.mjs'];
  const expect = ['scripts/test/a.test.mjs', 'scripts/test/b.test.mjs'];

  const result = checkInventory(files, expect);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unlisted, []);
});

test('checkInventory names a declared file that is not actually present, as missing', () => {
  const files = ['scripts/test/a.test.mjs'];
  const expect = ['scripts/test/a.test.mjs', 'scripts/test/b.test.mjs'];

  const result = checkInventory(files, expect);
  assert.deepEqual(result.missing, ['scripts/test/b.test.mjs']);
  assert.deepEqual(result.unlisted, []);
});

test('checkInventory names a present file that is not declared, as unlisted', () => {
  const files = ['scripts/test/a.test.mjs', 'scripts/test/zzz-probe.test.mjs'];
  const expect = ['scripts/test/a.test.mjs'];

  const result = checkInventory(files, expect);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unlisted, ['scripts/test/zzz-probe.test.mjs']);
});

test('checkInventory treats a Windows-style backslash path and a POSIX forward-slash path as the same file', () => {
  const declared = 'scripts/test/floor-stale.test.mjs';
  const windowsPath = 'scripts\\test\\floor-stale.test.mjs';
  const posixPath = 'scripts/test/floor-stale.test.mjs';

  assert.equal(toPosix(windowsPath), declared);
  assert.equal(toPosix(posixPath), declared);

  const result = checkInventory([windowsPath], [declared]);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unlisted, []);

  const resultForward = checkInventory([posixPath], [declared]);
  assert.deepEqual(resultForward.missing, []);
  assert.deepEqual(resultForward.unlisted, []);
});

test('checkFloorStale renders the exact pinned STALE string for a drifted input', () => {
  const result = checkFloorStale({
    name: 'workspace',
    unlisted: ['zzz-probe.test.mjs'],
    pass: 73,
    minPass: 67,
  });

  assert.equal(result.stale, true);
  assert.equal(
    result.message,
    'STALE workspace: 1 unlisted test file(s): zzz-probe.test.mjs; pass-count floor 67 < 73 actual',
  );
  assert.equal(result.message.includes('files matched:'), false);
  assert.equal(result.message.includes('FAIL '), false);
});

test('checkFloorStale reports not stale when unlisted is empty and minPass equals pass', () => {
  const result = checkFloorStale({
    name: 'workspace',
    unlisted: [],
    pass: 67,
    minPass: 67,
  });

  assert.equal(result.stale, false);
  assert.equal(result.message, '');
});

test('checkFloorStale reports the unlisted half alone when the pass-count floor is current', () => {
  const result = checkFloorStale({
    name: 'workspace',
    unlisted: ['zzz-probe.test.mjs'],
    pass: 67,
    minPass: 67,
  });

  assert.equal(result.stale, true);
  assert.equal(result.message, 'STALE workspace: 1 unlisted test file(s): zzz-probe.test.mjs');
});

test('checkFloorStale reports the pass-count half alone when the inventory is current', () => {
  const result = checkFloorStale({
    name: 'workspace',
    unlisted: [],
    pass: 73,
    minPass: 67,
  });

  assert.equal(result.stale, true);
  assert.equal(result.message, 'STALE workspace: pass-count floor 67 < 73 actual');
});
