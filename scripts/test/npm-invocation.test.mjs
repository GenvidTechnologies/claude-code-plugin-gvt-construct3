import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';

import { buildNpmInvocation } from '../lib/npm-invocation.mjs';

const EXEC_PATH_POSIX = '/usr/local/bin/node';
const EXEC_PATH_WIN = 'C:\\nvm\\node.exe';

test('buildNpmInvocation: runs npm-cli.js with node and no shell when it sits next to node', () => {
  const inv = buildNpmInvocation(['ci', '--ignore-scripts'], {
    platform: 'linux',
    execPath: EXEC_PATH_POSIX,
    exists: () => true,
  });
  // `join` is node:path's OS-native join (not posix-forced), so the expected
  // separator here matches whatever OS this test itself runs on, not the
  // `platform` option passed to buildNpmInvocation (which only selects the
  // fallback branch, and never touches the npm-cli.js path's separator).
  assert.deepEqual(inv, {
    command: EXEC_PATH_POSIX,
    args: [
      join(dirname(EXEC_PATH_POSIX), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      'ci',
      '--ignore-scripts',
    ],
    shell: false,
  });
});

test('buildNpmInvocation: off Windows, falls back to npm with an args array and no shell', () => {
  const inv = buildNpmInvocation(['ci', '--ignore-scripts'], {
    platform: 'linux',
    execPath: EXEC_PATH_POSIX,
    exists: () => false,
  });
  assert.deepEqual(inv, { command: 'npm', args: ['ci', '--ignore-scripts'], shell: false });
});

test('buildNpmInvocation: on Windows, falls back to one npm.cmd command string with shell and no args', () => {
  const inv = buildNpmInvocation(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {
    platform: 'win32',
    execPath: EXEC_PATH_WIN,
    exists: () => false,
  });
  assert.deepEqual(inv, {
    command: 'npm.cmd ci --ignore-scripts --no-audit --no-fund',
    args: [],
    shell: true,
  });
});

// Real-data control: the literal arg lists scripts/audit-diff.mjs and
// scripts/mcp-surface.mjs pass to runNpm today.
//   scripts/audit-diff.mjs:182   runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], pluginRoot)
//   scripts/mcp-surface.mjs:196  runNpm(['install', spec, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], tmpDir)
test('buildNpmInvocation: accepts the args audit-diff and mcp-surface pass today', () => {
  const spec = '@genvidtech/construct3-chef@2.0.0';
  const auditDiffArgs = ['ci', '--ignore-scripts', '--no-audit', '--no-fund'];
  const mcpSurfaceArgs = ['install', spec, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'];

  assert.doesNotThrow(() =>
    buildNpmInvocation(auditDiffArgs, { platform: 'win32', execPath: EXEC_PATH_WIN, exists: () => false }),
  );
  assert.doesNotThrow(() =>
    buildNpmInvocation(mcpSurfaceArgs, { platform: 'win32', execPath: EXEC_PATH_WIN, exists: () => false }),
  );
});

test('buildNpmInvocation: on Windows, refuses an arg cmd.exe would interpret', () => {
  const badArgs = ['>=1.0.0', '^1.0.0', 'a&b', 'a b', 'a"b', '%PATH%'];
  for (const bad of badArgs) {
    assert.throws(
      () => buildNpmInvocation(['install', bad], { platform: 'win32', execPath: EXEC_PATH_WIN, exists: () => false }),
      /refusing to pass/,
      `expected ${JSON.stringify(bad)} to be rejected`,
    );
  }
});
