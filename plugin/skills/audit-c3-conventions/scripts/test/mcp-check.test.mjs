import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import os from 'node:os';

import {
  findPinnedVersion,
  semverGte,
  evaluateMcpExpectation,
  probeMcpPackage,
} from '../lib/mcp-check.mjs';

// ---- findPinnedVersion -------------------------------------------------

const manifest = {
  mcpServers: {
    'construct3-chef': {
      command: 'npx',
      args: ['-y', '@genvidtech/construct3-chef@2.0.0', 'server'],
    },
    'c3-domain-manager': {
      command: 'npx',
      args: ['-y', '@genvidtech/c3-domain-manager@0.10.1', 'server'],
    },
  },
};

test('findPinnedVersion: construct3-chef pin from a real-shaped manifest', () => {
  assert.equal(
    findPinnedVersion(manifest, 'construct3-chef', '@genvidtech/construct3-chef'),
    '2.0.0',
  );
});

test('findPinnedVersion: c3-domain-manager pin from a real-shaped manifest', () => {
  assert.equal(
    findPinnedVersion(manifest, 'c3-domain-manager', '@genvidtech/c3-domain-manager'),
    '0.10.1',
  );
});

test('findPinnedVersion: unknown server returns null', () => {
  assert.equal(
    findPinnedVersion(manifest, 'nonexistent-server', '@genvidtech/construct3-chef'),
    null,
  );
});

test('findPinnedVersion: a pkg that does not match any arg returns null', () => {
  assert.equal(
    findPinnedVersion(manifest, 'construct3-chef', '@genvidtech/other-pkg'),
    null,
  );
});

test('findPinnedVersion: a range spec is not a pinned version', () => {
  const rangeManifest = {
    mcpServers: {
      'construct3-chef': { args: ['-y', '@genvidtech/construct3-chef@^1.2.0', 'server'] },
    },
  };
  assert.equal(
    findPinnedVersion(rangeManifest, 'construct3-chef', '@genvidtech/construct3-chef'),
    null,
  );
});

test('findPinnedVersion: a bare package with no version is not a pinned version', () => {
  const bareManifest = {
    mcpServers: {
      'construct3-chef': { args: ['-y', '@genvidtech/construct3-chef', 'server'] },
    },
  };
  assert.equal(
    findPinnedVersion(bareManifest, 'construct3-chef', '@genvidtech/construct3-chef'),
    null,
  );
});

test('findPinnedVersion: missing mcpServers returns null', () => {
  assert.equal(findPinnedVersion({}, 'construct3-chef', '@genvidtech/construct3-chef'), null);
});

// ---- semverGte ----------------------------------------------------------

test('semverGte: equal versions are gte', () => {
  assert.equal(semverGte('1.2.3', '1.2.3'), true);
});

test('semverGte: higher patch is gte', () => {
  assert.equal(semverGte('1.2.4', '1.2.3'), true);
});

test('semverGte: lower patch is not gte', () => {
  assert.equal(semverGte('1.2.2', '1.2.3'), false);
});

test('semverGte: higher minor is gte', () => {
  assert.equal(semverGte('1.3.0', '1.2.9'), true);
});

test('semverGte: lower minor is not gte', () => {
  assert.equal(semverGte('1.1.9', '1.2.0'), false);
});

// ---- evaluateMcpExpectation ----------------------------------------------

test('evaluateMcpExpectation: no pinned version fails required=true', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', reason: 'x' },
    pin: null,
    probe: { status: 0, stdout: '2.0.0\n' },
  });
  assert.equal(finding.ok, false);
  assert.equal(finding.severity, 'error');
  assert.match(finding.detail, /plugin\.json/);
});

test('evaluateMcpExpectation: pin below minVersion fails required=true (default)', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', minVersion: '2.1.0', reason: 'needs the rename' },
    pin: '2.0.0',
    probe: { status: 0, stdout: '2.0.0\n' },
  });
  assert.equal(finding.ok, false);
  assert.equal(finding.severity, 'error');
  assert.match(finding.detail, /2\.0\.0/);
  assert.match(finding.detail, /plugin\.json/);
  assert.equal(finding.reason, 'needs the rename');
});

test('evaluateMcpExpectation: pin below minVersion with required:false is info', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', minVersion: '2.1.0', required: false, reason: 'x' },
    pin: '2.0.0',
    probe: { status: 0, stdout: '2.0.0\n' },
  });
  assert.equal(finding.ok, false);
  assert.equal(finding.severity, 'info');
});

test('evaluateMcpExpectation: pin equal to minVersion is ok', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', minVersion: '2.0.0', reason: 'x' },
    pin: '2.0.0',
    probe: { status: 0, stdout: '2.0.0\n' },
  });
  assert.deepEqual(finding, {
    kind: 'mcp',
    component: 'construct3-chef',
    target: 'construct3-chef',
    ok: true,
    required: true,
    detail: '2.0.0',
  });
});

test('evaluateMcpExpectation: pin above minVersion is ok', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', minVersion: '1.9.0', reason: 'x' },
    pin: '2.0.0',
    probe: { status: 0, stdout: '2.0.0\n' },
  });
  assert.equal(finding.ok, true);
  assert.equal(finding.detail, '2.0.0');
});

test('evaluateMcpExpectation: probe status !== 0 fails with not-reachable, required=true', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', required: true, reason: 'x' },
    pin: '2.0.0',
    probe: { status: 1, stdout: '', error: undefined },
  });
  assert.equal(finding.ok, false);
  assert.equal(finding.severity, 'error');
  assert.match(finding.detail, /not reachable via npx/);
});

test('evaluateMcpExpectation: probe.error surfaces as not-reachable with the error message', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', required: true, reason: 'x' },
    pin: '2.0.0',
    probe: { status: null, stdout: '', error: new Error('boom') },
  });
  assert.equal(finding.ok, false);
  assert.equal(finding.severity, 'error');
  assert.match(finding.detail, /not reachable via npx/);
  assert.match(finding.detail, /boom/);
});

// ---- evaluateMcpExpectation: required -------------------------------------

test('evaluateMcpExpectation: required default → required: true on an ok finding', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', reason: 'x' },
    pin: '2.0.0',
    probe: { status: 0, stdout: '2.0.0\n' },
  });
  assert.equal(finding.ok, true);
  assert.equal(finding.required, true);
});

test('evaluateMcpExpectation: required default → required: true on a failing finding', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', reason: 'x' },
    pin: null,
    probe: { status: 0, stdout: '' },
  });
  assert.equal(finding.ok, false);
  assert.equal(finding.required, true);
});

test('evaluateMcpExpectation: required: false entry → required: false on an ok finding', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', required: false, reason: 'x' },
    pin: '2.0.0',
    probe: { status: 0, stdout: '2.0.0\n' },
  });
  assert.equal(finding.ok, true);
  assert.equal(finding.required, false);
});

test('evaluateMcpExpectation: required: false entry → required: false on a failing finding', () => {
  const finding = evaluateMcpExpectation({
    component: { name: 'construct3-chef' },
    entry: { server: 'construct3-chef', required: false, reason: 'x' },
    pin: null,
    probe: { status: 0, stdout: '' },
  });
  assert.equal(finding.ok, false);
  assert.equal(finding.required, false);
});

// ---- probeMcpPackage ------------------------------------------------------

test('probeMcpPackage: seals the probe from process.cwd() and cleans up afterwards', () => {
  const originalCwd = process.cwd();
  const dirA = mkdtempSync(join(os.tmpdir(), 'gvt-construct3-mcp-check-test-a-'));
  const dirB = mkdtempSync(join(os.tmpdir(), 'gvt-construct3-mcp-check-test-b-'));
  const spec = '@genvidtech/construct3-chef@2.0.0';
  const calls = [];

  const fakeSpawn = (cmd, args, opts) => {
    const pkgJson = readFileSync(join(opts.cwd, 'package.json'), 'utf8').trim();
    calls.push({ cmd, args, opts, pkgJson, existedDuringCall: existsSync(opts.cwd) });
    return { status: 0, stdout: '2.0.0\n' };
  };

  try {
    process.chdir(dirA);
    const resultA = probeMcpPackage(spec, { spawn: fakeSpawn });

    process.chdir(dirB);
    const resultB = probeMcpPackage(spec, { spawn: fakeSpawn });

    assert.equal(calls.length, 2);
    assert.equal(resultA.status, 0);
    assert.equal(resultB.status, 0);

    for (const call of calls) {
      assert.equal(call.cmd, 'npx');
      assert.equal(call.args[1], spec);
      assert.equal(call.pkgJson, '{}');
      assert.equal(call.existedDuringCall, true, 'the sealed dir exists while spawn runs');
      assert.ok(!call.opts.cwd.startsWith(dirA), 'probe cwd is not under dirA');
      assert.ok(!call.opts.cwd.startsWith(dirB), 'probe cwd is not under dirB');
    }

    // Both calls agree on everything except the random dir name.
    assert.equal(dirname(calls[0].opts.cwd), dirname(calls[1].opts.cwd));
    assert.equal(calls[0].opts.encoding, calls[1].opts.encoding);
    assert.equal(calls[0].opts.shell, calls[1].opts.shell);

    // The sealed dir is removed once the call returns.
    assert.equal(existsSync(calls[0].opts.cwd), false);
    assert.equal(existsSync(calls[1].opts.cwd), false);
  } finally {
    process.chdir(originalCwd);
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('probeMcpPackage: a throwing spawn is caught, not re-thrown, and the dir is still removed', () => {
  let capturedCwd;
  const throwingSpawn = (cmd, args, opts) => {
    capturedCwd = opts.cwd;
    throw new Error('boom');
  };

  const result = probeMcpPackage('@genvidtech/construct3-chef@2.0.0', { spawn: throwingSpawn });

  assert.equal(result.status, null);
  assert.equal(result.stdout, '');
  assert.equal(result.error.message, 'boom');
  assert.ok(capturedCwd, 'spawn was called with a cwd');
  assert.equal(existsSync(capturedCwd), false);
});
