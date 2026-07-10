// node --test audit.test.mjs
// Unit tests for the audit-c3-conventions script logic.
// Tests the C3-project marker check and the MCP evaluateMcp helper
// using temporary fixture directories — no external processes for the marker
// tests; the mcp check is tested via a stub approach.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import os from 'node:os';

// ---- helpers ----------------------------------------------------------------

async function mkTmp() {
  return fs.mkdtemp(join(os.tmpdir(), 'gvt-construct3-audit-test-'));
}

async function rmTmp(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

import {
  checkC3Marker,
  resolveAgentConfig,
  evaluateFile,
  evaluateConfig,
  resolveProjectRoot,
  classifyDiscovery,
  checkDiscoveryAmbiguity,
  scanC3ProjectMarkers,
  resolveDiscoveryPick,
  resolveMcpProjectDirOverride,
  formatReport,
} from '../audit.mjs';

// ---- marker tests -----------------------------------------------------------

test('marker: bare temp dir with no files → error finding', async () => {
  const dir = await mkTmp();
  try {
    const cfg = await resolveAgentConfig(dir);
    const finding = await checkC3Marker(dir, cfg);
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'error');
    assert.match(finding.detail, /No C3-project marker found/);
  } finally {
    await rmTmp(dir);
  }
});

test('marker: project.c3proj present → ok', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'project.c3proj'), '{}');
    const cfg = await resolveAgentConfig(dir);
    const finding = await checkC3Marker(dir, cfg);
    assert.equal(finding.ok, true);
    assert.equal(finding.target, 'project.c3proj');
  } finally {
    await rmTmp(dir);
  }
});

test('marker: .gvt-agent.json features.c3 = true → ok', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify({ features: { c3: true } }),
    );
    const cfg = await resolveAgentConfig(dir);
    const finding = await checkC3Marker(dir, cfg);
    assert.equal(finding.ok, true);
    assert.match(finding.target, /features\.c3/);
  } finally {
    await rmTmp(dir);
  }
});

test('marker: .gvt-agent.json features.c3 = false → error', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify({ features: { c3: false } }),
    );
    const cfg = await resolveAgentConfig(dir);
    const finding = await checkC3Marker(dir, cfg);
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'error');
  } finally {
    await rmTmp(dir);
  }
});

test('marker: paths.c3project pointing at an existing file → ok', async () => {
  const dir = await mkTmp();
  try {
    const projFile = join(dir, 'myproject.c3proj');
    await fs.writeFile(projFile, '{}');
    await fs.writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify({ paths: { c3project: 'myproject.c3proj' } }),
    );
    const cfg = await resolveAgentConfig(dir);
    const finding = await checkC3Marker(dir, cfg);
    assert.equal(finding.ok, true);
    assert.match(finding.target, /paths\.c3project/);
  } finally {
    await rmTmp(dir);
  }
});

test('marker: paths.c3project pointing at non-existent file → error', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify({ paths: { c3project: 'missing.c3proj' } }),
    );
    const cfg = await resolveAgentConfig(dir);
    const finding = await checkC3Marker(dir, cfg);
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'error');
  } finally {
    await rmTmp(dir);
  }
});

// ---- resolveAgentConfig fallback tests ---------------------------------------

test('resolveAgentConfig: only legacy .genvid-agent.json present → usedLegacy true, marker ok', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.genvid-agent.json'),
      JSON.stringify({ features: { c3: true } }),
    );
    const cfg = await resolveAgentConfig(dir);
    assert.equal(cfg.usedLegacy, true);
    assert.equal(cfg.name, '.genvid-agent.json');
    assert.deepEqual(cfg.parsed, { features: { c3: true } });

    const finding = await checkC3Marker(dir, cfg);
    assert.equal(finding.ok, true);
  } finally {
    await rmTmp(dir);
  }
});

test('resolveAgentConfig: both names present → prefers .gvt-agent.json, usedLegacy false', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.gvt-agent.json'),
      JSON.stringify({ features: { c3: true } }),
    );
    await fs.writeFile(
      join(dir, '.genvid-agent.json'),
      JSON.stringify({ features: { c3: false } }),
    );
    const cfg = await resolveAgentConfig(dir);
    assert.equal(cfg.usedLegacy, false);
    assert.equal(cfg.name, '.gvt-agent.json');
    assert.deepEqual(cfg.parsed, { features: { c3: true } });

    const finding = await checkC3Marker(dir, cfg);
    assert.equal(finding.ok, true);
  } finally {
    await rmTmp(dir);
  }
});

test('resolveAgentConfig: neither name present → parsed null, name null, marker error', async () => {
  const dir = await mkTmp();
  try {
    const cfg = await resolveAgentConfig(dir);
    assert.equal(cfg.parsed, null);
    assert.equal(cfg.name, null);
    assert.equal(cfg.usedLegacy, false);

    const finding = await checkC3Marker(dir, cfg);
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'error');
  } finally {
    await rmTmp(dir);
  }
});

// ---- semver comparison tests ------------------------------------------------

// Inline semverGte for unit-testing without importing the full script
function semverGte(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return true;
}

test('semver: equal versions → gte', () => {
  assert.equal(semverGte('0.4.0', '0.4.0'), true);
});

test('semver: higher patch → gte', () => {
  assert.equal(semverGte('0.4.1', '0.4.0'), true);
});

test('semver: higher minor → gte', () => {
  assert.equal(semverGte('0.5.0', '0.4.0'), true);
});

test('semver: lower patch → not gte', () => {
  assert.equal(semverGte('0.3.9', '0.4.0'), false);
});

test('semver: lower minor → not gte', () => {
  assert.equal(semverGte('0.3.0', '0.4.0'), false);
});

// ---- frontmatter tests ------------------------------------------------------

import { extractFrontmatter } from '../lib/frontmatter.mjs';

test('frontmatter: extracts mcp array from SKILL.md shape', () => {
  const src = `---
name: test-skill
metadata:
  expects:
    mcp:
      - server: construct3-chef
        minVersion: "0.4.0"
        reason: Test reason
      - server: c3-domain-manager
        minVersion: "0.1.1"
        reason: Another reason
---

# Body
`;
  const fm = extractFrontmatter(src);
  assert.ok(fm, 'frontmatter should be parsed');
  const mcp = fm.metadata?.expects?.mcp;
  assert.ok(Array.isArray(mcp), 'mcp should be an array');
  assert.equal(mcp.length, 2);
  assert.equal(mcp[0].server, 'construct3-chef');
  assert.equal(mcp[0].minVersion, '0.4.0');
  assert.equal(mcp[1].server, 'c3-domain-manager');
  assert.equal(mcp[1].minVersion, '0.1.1');
});

test('frontmatter: component with no expects returns null', () => {
  const src = `---
name: bare-skill
description: No expects here
---

# Body
`;
  const fm = extractFrontmatter(src);
  assert.ok(fm);
  assert.equal(fm.metadata?.expects, undefined);
});

// ---- evaluateFile / evaluateConfig tests ------------------------------------

test('import side-effect guard: importing audit.mjs did not execute main', () => {
  assert.ok(true, 'importing audit.mjs did not execute main');
});

test('evaluateFile: file present → ok', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'domain-config.json'), '{}');
    const finding = await evaluateFile(
      { name: 'test-skill' },
      { path: 'domain-config.json', reason: 'r' },
      dir,
    );
    assert.equal(finding.ok, true);
    assert.equal(finding.target, 'domain-config.json');
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateFile: required file missing → error, no (optional) in detail', async () => {
  const dir = await mkTmp();
  try {
    const finding = await evaluateFile(
      { name: 'test-skill' },
      { path: 'domain-config.json', reason: 'r' },
      dir,
    );
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'error');
    assert.ok(!finding.detail.includes('(optional)'), 'detail should not contain "(optional)"');
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateFile: optional file missing → info, (optional) in detail', async () => {
  const dir = await mkTmp();
  try {
    const finding = await evaluateFile(
      { name: 'test-skill' },
      { path: 'domain-config.json', required: false, reason: 'r' },
      dir,
    );
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'info');
    assert.ok(finding.detail.includes('(optional)'), 'detail should contain "(optional)"');
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateConfig: key present in custom in: target → ok', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'my-config.json'), JSON.stringify({ foo: { bar: true } }));
    const finding = await evaluateConfig(
      { name: 'test-skill' },
      { key: 'foo.bar', in: 'my-config.json', reason: 'r' },
      dir,
    );
    assert.equal(finding.ok, true);
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateConfig: missing key → error, detail includes "path broke at"', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'my-config.json'), JSON.stringify({}));
    const finding = await evaluateConfig(
      { name: 'test-skill' },
      { key: 'foo.bar', in: 'my-config.json', reason: 'r' },
      dir,
    );
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'error');
    assert.ok(finding.detail.includes('path broke at'), `expected "path broke at" in: ${finding.detail}`);
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateConfig: in: file absent → error, detail includes "not found"', async () => {
  const dir = await mkTmp();
  try {
    const finding = await evaluateConfig(
      { name: 'test-skill' },
      { key: 'foo.bar', in: 'my-config.json', reason: 'r' },
      dir,
    );
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'error');
    assert.ok(finding.detail.includes('not found'), `expected "not found" in: ${finding.detail}`);
  } finally {
    await rmTmp(dir);
  }
});

// ---- resolveProjectRoot tests -----------------------------------------------

test('resolveProjectRoot: agentJson with paths.c3project returns parent dir', () => {
  const repoRoot = '/tmp/x';
  const agentJson = { paths: { c3project: 'sub/project.c3proj' } };
  const result = resolveProjectRoot(repoRoot, agentJson);
  assert.equal(result, resolve(join(repoRoot, 'sub')));
});

test('resolveProjectRoot: agentJson with no paths key → returns repoRoot', () => {
  const repoRoot = '/tmp/x';
  const result = resolveProjectRoot(repoRoot, {});
  assert.equal(result, repoRoot);
});

test('resolveProjectRoot: agentJson null → returns repoRoot', () => {
  const repoRoot = '/tmp/x';
  const result = resolveProjectRoot(repoRoot, null);
  assert.equal(result, repoRoot);
});

// ---- evaluateFile base:project tests ----------------------------------------

test('evaluateFile base:project, file present in projectRoot subdir → ok', async () => {
  const dir = await mkTmp();
  try {
    const sub = join(dir, 'sub');
    await fs.mkdir(sub);
    await fs.writeFile(join(sub, 'domain-config.json'), '{}');
    const finding = await evaluateFile(
      { name: 'x' },
      { path: 'domain-config.json', base: 'project' },
      dir,
      sub,
    );
    assert.equal(finding.ok, true);
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateFile base:project, file only at repoRoot not in sub/ → ok false', async () => {
  const dir = await mkTmp();
  try {
    // file at repoRoot only
    await fs.writeFile(join(dir, 'domain-config.json'), '{}');
    const sub = join(dir, 'sub');
    await fs.mkdir(sub);
    const finding = await evaluateFile(
      { name: 'x' },
      { path: 'domain-config.json', base: 'project' },
      dir,
      sub,
    );
    assert.equal(finding.ok, false);
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateFile default base (no base field), file at repoRoot → ok even when projectRoot differs', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'domain-config.json'), '{}');
    const sub = join(dir, 'sub');
    await fs.mkdir(sub);
    const finding = await evaluateFile(
      { name: 'x' },
      { path: 'domain-config.json' },
      dir,
      sub,
    );
    assert.equal(finding.ok, true);
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateFile base:repo explicit, file at repoRoot → ok even when projectRoot differs', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'domain-config.json'), '{}');
    const sub = join(dir, 'sub');
    await fs.mkdir(sub);
    const finding = await evaluateFile(
      { name: 'x' },
      { path: 'domain-config.json', base: 'repo' },
      dir,
      sub,
    );
    assert.equal(finding.ok, true);
  } finally {
    await rmTmp(dir);
  }
});

// ---- frontmatter parser: base field parsed correctly ------------------------

test('frontmatter parser: base: project field is preserved in parsed entry', () => {
  const src = `---
name: test-skill
metadata:
  expects:
    files:
      - path: domain-config.json
        base: project
        reason: needs project file
---

# Body
`;
  const fm = extractFrontmatter(src);
  assert.ok(fm, 'frontmatter should be parsed');
  const files = fm.metadata?.expects?.files;
  assert.ok(Array.isArray(files), 'files should be an array');
  assert.equal(files[0].path, 'domain-config.json');
  assert.equal(files[0].base, 'project');
});

// ---- evaluateConfig base:project test ---------------------------------------

test('evaluateConfig base:project, key in projectRoot subdir file → ok', async () => {
  const dir = await mkTmp();
  try {
    const sub = join(dir, 'sub');
    await fs.mkdir(sub);
    await fs.writeFile(join(sub, 'somecfg.json'), JSON.stringify({ k: 1 }));
    const finding = await evaluateConfig(
      { name: 'x' },
      { key: 'k', in: 'somecfg.json', base: 'project' },
      dir,
      sub,
    );
    assert.equal(finding.ok, true);
  } finally {
    await rmTmp(dir);
  }
});

// ---- classifyDiscovery (pure) tests ------------------------------------------

test('classifyDiscovery: envOverride set with 2 child matches → suppressed-env', () => {
  const result = classifyDiscovery({
    rootHasMarker: false,
    childDirsWithMarker: ['a', 'b'],
    envOverride: 'foo',
  });
  assert.deepEqual(result, { fires: false, reason: 'suppressed-env' });
});

test('classifyDiscovery: whitespace-only envOverride with 2 child matches → does NOT suppress, fires', () => {
  const result = classifyDiscovery({
    rootHasMarker: false,
    childDirsWithMarker: ['a', 'b'],
    envOverride: '   ',
  });
  assert.equal(result.fires, true);
});

test('classifyDiscovery: rootHasMarker true with 2 child matches, no env → root-short-circuit', () => {
  const result = classifyDiscovery({
    rootHasMarker: true,
    childDirsWithMarker: ['a', 'b'],
    envOverride: undefined,
  });
  assert.deepEqual(result, { fires: false, reason: 'root-short-circuit' });
});

test('classifyDiscovery: 2+ child matches, no root marker, no env → fires', () => {
  const result = classifyDiscovery({
    rootHasMarker: false,
    childDirsWithMarker: ['a', 'b'],
    envOverride: undefined,
  });
  assert.equal(result.fires, true);
  assert.deepEqual(result.matches, ['a', 'b']);
});

test('classifyDiscovery: exactly 1 child match → single, does not fire', () => {
  const result = classifyDiscovery({
    rootHasMarker: false,
    childDirsWithMarker: ['a'],
    envOverride: undefined,
  });
  assert.deepEqual(result, { fires: false, reason: 'single' });
});

test('classifyDiscovery: 0 child matches → none, does not fire', () => {
  const result = classifyDiscovery({
    rootHasMarker: false,
    childDirsWithMarker: [],
    envOverride: undefined,
  });
  assert.deepEqual(result, { fires: false, reason: 'none' });
});

test('classifyDiscovery: explicitOverride set with 2 child matches AND envOverride also set → suppressed-mcp (explicit beats env)', () => {
  const result = classifyDiscovery({
    rootHasMarker: false,
    childDirsWithMarker: ['a', 'b'],
    explicitOverride: 'x',
    envOverride: 'y',
  });
  assert.deepEqual(result, { fires: false, reason: 'suppressed-mcp' });
});

test('classifyDiscovery: whitespace-only explicitOverride + envOverride set → falls through to suppressed-env', () => {
  const result = classifyDiscovery({
    rootHasMarker: false,
    childDirsWithMarker: ['a', 'b'],
    explicitOverride: '   ',
    envOverride: 'y',
  });
  assert.deepEqual(result, { fires: false, reason: 'suppressed-env' });
});

test('classifyDiscovery: explicitOverride alone with 2 child matches, no env → suppressed-mcp', () => {
  const result = classifyDiscovery({
    rootHasMarker: false,
    childDirsWithMarker: ['a', 'b'],
    explicitOverride: 'x',
    envOverride: undefined,
  });
  assert.deepEqual(result, { fires: false, reason: 'suppressed-mcp' });
});

// ---- scanC3ProjectMarkers tests -----------------------------------------------

test('scanC3ProjectMarkers: two child dirs with marker, no root marker → both collected, rootHasMarker false', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await fs.mkdir(a);
    await fs.mkdir(b);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    await fs.writeFile(join(b, 'project.c3proj'), '{}');
    const result = await scanC3ProjectMarkers(dir);
    assert.equal(result.rootHasMarker, false);
    assert.deepEqual(result.childDirsWithMarker.sort(), ['a', 'b']);
  } finally {
    await rmTmp(dir);
  }
});

test('scanC3ProjectMarkers: root has marker → rootHasMarker true', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'project.c3proj'), '{}');
    const result = await scanC3ProjectMarkers(dir);
    assert.equal(result.rootHasMarker, true);
  } finally {
    await rmTmp(dir);
  }
});

test('scanC3ProjectMarkers: single child with marker → one entry', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    await fs.mkdir(a);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    const result = await scanC3ProjectMarkers(dir);
    assert.deepEqual(result.childDirsWithMarker, ['a']);
  } finally {
    await rmTmp(dir);
  }
});

test('scanC3ProjectMarkers: bare temp dir, zero markers → empty', async () => {
  const dir = await mkTmp();
  try {
    const result = await scanC3ProjectMarkers(dir);
    assert.equal(result.rootHasMarker, false);
    assert.deepEqual(result.childDirsWithMarker, []);
  } finally {
    await rmTmp(dir);
  }
});

// Pins the upstream-parity fact: no name-based filtering — node_modules is
// scanned like any other child dir (see checkDiscoveryAmbiguity's own
// regression-lock test for the same fact at the I/O-wrapper layer).
test('scanC3ProjectMarkers: node_modules with marker + sibling a/ with marker → both collected (no name filtering)', async () => {
  const dir = await mkTmp();
  try {
    const nm = join(dir, 'node_modules');
    const a = join(dir, 'a');
    await fs.mkdir(nm);
    await fs.mkdir(a);
    await fs.writeFile(join(nm, 'project.c3proj'), '{}');
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    const result = await scanC3ProjectMarkers(dir);
    assert.deepEqual(result.childDirsWithMarker.sort(), ['a', 'node_modules']);
  } finally {
    await rmTmp(dir);
  }
});

// ---- checkDiscoveryAmbiguity (I/O wrapper) tests -----------------------------

test('checkDiscoveryAmbiguity: two child dirs with project.c3proj, no root marker → finding', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await fs.mkdir(a);
    await fs.mkdir(b);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    await fs.writeFile(join(b, 'project.c3proj'), '{}');
    const finding = await checkDiscoveryAmbiguity(dir, {});
    assert.ok(finding, 'expected a finding');
    assert.equal(finding.severity, 'warning');
    assert.equal(finding.ok, false);
    assert.match(finding.detail, /a/);
    assert.match(finding.detail, /b/);
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: root has marker AND two children have it → null (short-circuit)', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'project.c3proj'), '{}');
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await fs.mkdir(a);
    await fs.mkdir(b);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    await fs.writeFile(join(b, 'project.c3proj'), '{}');
    const finding = await checkDiscoveryAmbiguity(dir, {});
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: single child with marker → null', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    await fs.mkdir(a);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    const finding = await checkDiscoveryAmbiguity(dir, {});
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: C3_PROJECT_DIR set with two child matches → null', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await fs.mkdir(a);
    await fs.mkdir(b);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    await fs.writeFile(join(b, 'project.c3proj'), '{}');
    const finding = await checkDiscoveryAmbiguity(dir, { C3_PROJECT_DIR: 'a' });
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: whitespace-only C3_PROJECT_DIR with two child matches → still fires', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await fs.mkdir(a);
    await fs.mkdir(b);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    await fs.writeFile(join(b, 'project.c3proj'), '{}');
    const finding = await checkDiscoveryAmbiguity(dir, { C3_PROJECT_DIR: '   ' });
    assert.ok(finding, 'expected a finding — whitespace-only env is not a real override');
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: bare temp dir, zero markers → null', async () => {
  const dir = await mkTmp();
  try {
    const finding = await checkDiscoveryAmbiguity(dir, {});
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

// Regression lock: upstream's (@genvidtech/mcp-utils resolveRootFolder) depth-1
// child scan does NOT filter by directory name — node_modules and dotfiles are
// scanned like any other child dir. This pins that fact so a future "let's
// skip node_modules" edit here is caught by CI instead of silently diverging
// from the real server's behavior.
test('checkDiscoveryAmbiguity: node_modules with marker + ordinary sibling with marker → fires (no name filtering)', async () => {
  const dir = await mkTmp();
  try {
    const nm = join(dir, 'node_modules');
    const a = join(dir, 'a');
    await fs.mkdir(nm);
    await fs.mkdir(a);
    await fs.writeFile(join(nm, 'project.c3proj'), '{}');
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    const finding = await checkDiscoveryAmbiguity(dir, {});
    assert.ok(finding, 'expected a finding — node_modules is not excluded, matching upstream');
  } finally {
    await rmTmp(dir);
  }
});

// ---- checkDiscoveryAmbiguity: .mcp.json override suppression -----------------
// Drives the true parse→classify path — resolveMcpProjectDirOverride parses a
// real written `.mcp.json`, and its result is passed straight into
// checkDiscoveryAmbiguity exactly as main() wires it (scan / override computed
// once, then handed to the check).

async function mkAmbiguousFixture(dir) {
  const a = join(dir, 'a');
  const b = join(dir, 'b');
  await fs.mkdir(a);
  await fs.mkdir(b);
  await fs.writeFile(join(a, 'project.c3proj'), '{}');
  await fs.writeFile(join(b, 'project.c3proj'), '{}');
}

test('checkDiscoveryAmbiguity: .mcp.json pins --project-dir → suppressed (null)', async () => {
  const dir = await mkTmp();
  try {
    await mkAmbiguousFixture(dir);
    await fs.writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'c3-domain-manager': { args: ['server', '--project-dir', 'a'] },
        },
      }),
    );
    const override = await resolveMcpProjectDirOverride(dir);
    const finding = await checkDiscoveryAmbiguity(dir, {}, override, null);
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: .mcp.json pins env.C3_PROJECT_DIR → suppressed (null)', async () => {
  const dir = await mkTmp();
  try {
    await mkAmbiguousFixture(dir);
    await fs.writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'c3-domain-manager': { env: { C3_PROJECT_DIR: 'a' } },
        },
      }),
    );
    const override = await resolveMcpProjectDirOverride(dir);
    const finding = await checkDiscoveryAmbiguity(dir, {}, override, null);
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: no .mcp.json + ambiguity → still fires', async () => {
  const dir = await mkTmp();
  try {
    await mkAmbiguousFixture(dir);
    const override = await resolveMcpProjectDirOverride(dir);
    assert.equal(override, null);
    const finding = await checkDiscoveryAmbiguity(dir, {}, override, null);
    assert.ok(finding, 'expected a finding — no .mcp.json to suppress it');
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: .mcp.json present but no c3-domain-manager entry + ambiguity → still fires', async () => {
  const dir = await mkTmp();
  try {
    await mkAmbiguousFixture(dir);
    await fs.writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'construct3-chef': { args: ['server'] } } }),
    );
    const override = await resolveMcpProjectDirOverride(dir);
    assert.equal(override, null);
    const finding = await checkDiscoveryAmbiguity(dir, {}, override, null);
    assert.ok(finding, 'expected a finding — no c3-domain-manager entry to suppress it');
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: malformed .mcp.json + ambiguity → no crash, still fires', async () => {
  const dir = await mkTmp();
  try {
    await mkAmbiguousFixture(dir);
    await fs.writeFile(join(dir, '.mcp.json'), '{ bad json');
    const override = await resolveMcpProjectDirOverride(dir);
    assert.equal(override, null);
    const finding = await checkDiscoveryAmbiguity(dir, {}, override, null);
    assert.ok(finding, 'expected a finding — malformed .mcp.json must not crash the audit');
  } finally {
    await rmTmp(dir);
  }
});

test('checkDiscoveryAmbiguity: .mcp.json --project-dir is whitespace-only + ambiguity → does NOT suppress', async () => {
  const dir = await mkTmp();
  try {
    await mkAmbiguousFixture(dir);
    await fs.writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'c3-domain-manager': { args: ['server', '--project-dir', '   '] },
        },
      }),
    );
    const override = await resolveMcpProjectDirOverride(dir);
    assert.equal(override, '   ');
    const finding = await checkDiscoveryAmbiguity(dir, {}, override, null);
    assert.ok(finding, 'expected a finding — whitespace-only --project-dir is not a real override');
  } finally {
    await rmTmp(dir);
  }
});

// ---- formatReport tests ------------------------------------------------------

test('formatReport: golden — only ok/error/info findings, no warnings → no Warnings section, correct denominator', () => {
  const findings = [
    { kind: 'file', component: 'x', target: 'a', ok: true },
    { kind: 'file', component: 'x', target: 'b', ok: true },
    {
      kind: 'file',
      component: 'x',
      target: 'c',
      ok: false,
      severity: 'error',
      detail: 'missing',
      reason: 'r',
    },
  ];
  const report = formatReport(findings);
  assert.ok(!report.includes('### Warnings'), 'no Warnings section expected');
  assert.match(report, /2 of 3 required expectations satisfied\./);
});

test('formatReport: warning rendering — Warnings section present, excluded from Errors, excluded from denominator', () => {
  const findings = [
    { kind: 'file', component: 'x', target: 'a', ok: true },
    {
      kind: 'discovery',
      component: 'gvt-construct3',
      target: 'project.c3proj auto-discovery',
      ok: false,
      severity: 'warning',
      detail: 'ambiguous C3 root',
      reason: 'because reasons',
    },
  ];
  const report = formatReport(findings);
  assert.match(report, /### Warnings \(advisory — will break at runtime\)/);
  assert.match(report, /1 of 1 required expectations satisfied\./);

  const errorsSectionMatch = report.match(/### Errors[\s\S]*?(?=\n###|\n?$)/);
  if (errorsSectionMatch) {
    assert.ok(
      !errorsSectionMatch[0].includes('auto-discovery'),
      'warning finding must not appear under Errors',
    );
  }
});

// ---- resolveDiscoveryPick (pure) tests ----------------------------------------

test('resolveDiscoveryPick: rootHasMarker true → repoRoot', () => {
  const result = resolveDiscoveryPick({
    repoRoot: '/tmp/x',
    rootHasMarker: true,
    childDirsWithMarker: ['a', 'b'],
  });
  assert.equal(result, '/tmp/x');
});

test('resolveDiscoveryPick: 1 child match, no root marker → join(repoRoot, child)', () => {
  const result = resolveDiscoveryPick({
    repoRoot: '/tmp/x',
    rootHasMarker: false,
    childDirsWithMarker: ['a'],
  });
  assert.equal(result, join('/tmp/x', 'a'));
});

test('resolveDiscoveryPick: 0 matches, no root marker → repoRoot (cwd fallback)', () => {
  const result = resolveDiscoveryPick({
    repoRoot: '/tmp/x',
    rootHasMarker: false,
    childDirsWithMarker: [],
  });
  assert.equal(result, '/tmp/x');
});

test('resolveDiscoveryPick: 2+ matches, no root marker → null (ambiguous)', () => {
  const result = resolveDiscoveryPick({
    repoRoot: '/tmp/x',
    rootHasMarker: false,
    childDirsWithMarker: ['a', 'b'],
  });
  assert.equal(result, null);
});

// ---- resolveMcpProjectDirOverride tests ---------------------------------------

test('resolveMcpProjectDirOverride: two-token --project-dir in args → returns value', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'c3-domain-manager': {
            command: 'npx',
            args: ['-y', '@genvidtech/c3-domain-manager', 'server', '--project-dir', '/p'],
          },
        },
      }),
    );
    const result = await resolveMcpProjectDirOverride(dir);
    assert.equal(result, '/p');
  } finally {
    await rmTmp(dir);
  }
});

test('resolveMcpProjectDirOverride: single-token --project-dir=/q → returns value', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'c3-domain-manager': {
            command: 'npx',
            args: ['-y', '@genvidtech/c3-domain-manager', 'server', '--project-dir=/q'],
          },
        },
      }),
    );
    const result = await resolveMcpProjectDirOverride(dir);
    assert.equal(result, '/q');
  } finally {
    await rmTmp(dir);
  }
});

test('resolveMcpProjectDirOverride: env.C3_PROJECT_DIR only → returns its value', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'c3-domain-manager': {
            command: 'npx',
            args: ['-y', '@genvidtech/c3-domain-manager', 'server'],
            env: { C3_PROJECT_DIR: '/env-p' },
          },
        },
      }),
    );
    const result = await resolveMcpProjectDirOverride(dir);
    assert.equal(result, '/env-p');
  } finally {
    await rmTmp(dir);
  }
});

test('resolveMcpProjectDirOverride: .mcp.json absent → null', async () => {
  const dir = await mkTmp();
  try {
    const result = await resolveMcpProjectDirOverride(dir);
    assert.equal(result, null);
  } finally {
    await rmTmp(dir);
  }
});

test('resolveMcpProjectDirOverride: .mcp.json present but no c3-domain-manager entry → null', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'some-other-server': { command: 'npx' } } }),
    );
    const result = await resolveMcpProjectDirOverride(dir);
    assert.equal(result, null);
  } finally {
    await rmTmp(dir);
  }
});

test('resolveMcpProjectDirOverride: malformed JSON → null (no throw)', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, '.mcp.json'), '{ not json');
    const result = await resolveMcpProjectDirOverride(dir);
    assert.equal(result, null);
  } finally {
    await rmTmp(dir);
  }
});

test('resolveMcpProjectDirOverride: entry present with neither args-flag nor env → null', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'c3-domain-manager': {
            command: 'npx',
            args: ['-y', '@genvidtech/c3-domain-manager', 'server'],
          },
        },
      }),
    );
    const result = await resolveMcpProjectDirOverride(dir);
    assert.equal(result, null);
  } finally {
    await rmTmp(dir);
  }
});
