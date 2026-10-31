import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  pinnedServerSpecs,
  readInstalledVersion,
  evaluateLocalInstall,
  checkLocalInstalls,
} from '../lib/local-install.mjs';

const PKG = '@genvidtech/construct3-chef';
const SERVER = 'construct3-chef';
const MANIFEST = {
  mcpServers: { [SERVER]: { command: 'npx', args: ['-y', `${PKG}@2.1.0`, 'server'] } },
};

function makeTemp() {
  return mkdtempSync(join(realpathSync.native(tmpdir()), 'gvt-local-install-test-'));
}

function install(dir, version, pkg = PKG) {
  const d = join(dir, 'node_modules', ...pkg.split('/'));
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'package.json'), JSON.stringify(version === undefined ? {} : { version }));
}

function withTemp(fn) {
  const root = makeTemp();
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('installed older than the pin yields one info finding naming package, installed version and pin', () => {
  withTemp((root) => {
    install(root, '2.0.0');
    const findings = checkLocalInstalls({ manifest: MANIFEST, repoRoot: root, projectRoot: root });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'info');
    assert.equal(findings[0].target, `node_modules/${PKG}`);
    assert.ok(findings[0].detail.includes(PKG));
    assert.ok(findings[0].detail.includes('2.0.0'));
    assert.ok(findings[0].detail.includes('2.1.0'));
    assert.ok(findings[0].detail.includes('npm update'));
  });
});

test('installed newer than the pin yields one info finding telling the plugin to update', () => {
  withTemp((root) => {
    install(root, '2.2.0');
    const findings = checkLocalInstalls({ manifest: MANIFEST, repoRoot: root, projectRoot: root });
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'info');
    assert.ok(findings[0].detail.includes('older than the repo'));
  });
});

test('installed equal to the pin yields no finding', () => {
  withTemp((root) => {
    install(root, '2.1.0');
    assert.deepEqual(
      checkLocalInstalls({ manifest: MANIFEST, repoRoot: root, projectRoot: root }),
      [],
    );
  });
});

test('no node_modules package.json yields no finding', () => {
  withTemp((root) => {
    assert.deepEqual(
      checkLocalInstalls({ manifest: MANIFEST, repoRoot: root, projectRoot: root }),
      [],
    );
  });
});

test('an install only in an ancestor directory yields no finding', () => {
  withTemp((root) => {
    install(root, '1.0.0');
    const child = join(root, 'child');
    mkdirSync(child);
    assert.equal(readInstalledVersion(child, PKG), null);
    assert.deepEqual(
      checkLocalInstalls({ manifest: MANIFEST, repoRoot: child, projectRoot: child }),
      [],
    );
  });
});

test('project root different from repo root reports one finding per location', () => {
  withTemp((root) => {
    const project = join(root, 'sample');
    mkdirSync(project);
    install(root, '2.0.0');
    install(project, '2.0.1');
    const findings = checkLocalInstalls({ manifest: MANIFEST, repoRoot: root, projectRoot: project });
    assert.equal(findings.length, 2);
    assert.deepEqual(findings.map((f) => f.target).sort(), [
      `node_modules/${PKG}`,
      `sample/node_modules/${PKG}`,
    ]);
  });
});

test('project root equal to repo root reports one finding', () => {
  withTemp((root) => {
    install(root, '2.0.0');
    const findings = checkLocalInstalls({
      manifest: MANIFEST,
      repoRoot: root,
      projectRoot: resolve(root),
    });
    assert.equal(findings.length, 1);
  });
});

test('invalid JSON or a missing version yields no finding and does not throw', () => {
  withTemp((root) => {
    const d = join(root, 'node_modules', '@genvidtech', 'construct3-chef');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'package.json'), '{ not json');
    assert.equal(readInstalledVersion(root, PKG), null);
    assert.deepEqual(
      checkLocalInstalls({ manifest: MANIFEST, repoRoot: root, projectRoot: root }),
      [],
    );
    install(root, undefined);
    assert.equal(readInstalledVersion(root, PKG), null);
    install(root, 5);
    assert.equal(readInstalledVersion(root, PKG), null);
    assert.deepEqual(
      checkLocalInstalls({ manifest: MANIFEST, repoRoot: root, projectRoot: root }),
      [],
    );
  });
});

test('pinnedServerSpecs on the real plugin.json returns one spec per mcpServers entry', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const manifestPath = resolve(here, '..', '..', '..', '..', '.claude-plugin', 'plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const specs = pinnedServerSpecs(manifest);
  const servers = Object.keys(manifest.mcpServers);
  assert.ok(servers.length > 0);
  assert.equal(specs.length, servers.length);
  assert.deepEqual(specs.map((s) => s.server).sort(), servers.sort());
  for (const s of specs) {
    assert.match(s.pkg, /^@[^@/]+\/[^@/]+$/);
    assert.match(s.pin, /^\d+\.\d+\.\d+$/);
  }
});

test('pinnedServerSpecs tolerates a missing manifest or mcpServers', () => {
  assert.deepEqual(pinnedServerSpecs(null), []);
  assert.deepEqual(pinnedServerSpecs({}), []);
  assert.deepEqual(pinnedServerSpecs({ mcpServers: { a: {} } }), []);
});

test('a non-x.y.z installed version gets neutral wording with both versions', () => {
  const f = evaluateLocalInstall({
    server: SERVER,
    pkg: PKG,
    pin: '2.1.0',
    installed: '2.2.0-beta.1',
    location: '',
  });
  assert.equal(f.severity, 'info');
  assert.ok(f.detail.includes('2.2.0-beta.1'));
  assert.ok(f.detail.includes('2.1.0'));
  assert.ok(f.detail.includes('the versions differ'));
  assert.ok(!f.detail.includes('refresh the lock'));
  assert.ok(!f.detail.includes('update the plugin'));
});

test('a leading-zero version is not plain x.y.z and gets neutral wording', () => {
  for (const [pin, installed] of [
    ['2.1.0', '2.01.0'],
    ['2.1.0', '2.1.00'],
    ['2.01.0', '2.1.0'],
  ]) {
    const f = evaluateLocalInstall({ server: SERVER, pkg: PKG, pin, installed, location: '' });
    assert.ok(f.detail.includes('the versions differ'), `${pin} vs ${installed}`);
    assert.ok(!f.detail.includes('refresh the lock'), `${pin} vs ${installed}`);
  }
});

test('a project root outside the repo root reports a ../ target', () => {
  withTemp((root) => {
    const repo = join(root, 'repo');
    const other = join(root, 'other');
    mkdirSync(repo);
    mkdirSync(other);
    install(other, '2.0.0');
    const findings = checkLocalInstalls({ manifest: MANIFEST, repoRoot: repo, projectRoot: other });
    assert.deepEqual(findings.map((f) => f.target), [`../other/node_modules/${PKG}`]);
  });
});

test('evaluateLocalInstall returns null for null, undefined or equal installed versions', () => {
  const base = { server: SERVER, pkg: PKG, pin: '2.1.0', location: '' };
  assert.equal(evaluateLocalInstall({ ...base, installed: null }), null);
  assert.equal(evaluateLocalInstall({ ...base, installed: undefined }), null);
  assert.equal(evaluateLocalInstall({ ...base, installed: '2.1.0' }), null);
});
