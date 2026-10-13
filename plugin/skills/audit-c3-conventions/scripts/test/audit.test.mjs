// node --test audit.test.mjs
// Unit tests for the audit-c3-conventions script logic.
// Tests the C3-project marker check and the MCP evaluateMcp helper
// using temporary fixture directories — no external processes for the marker
// tests; the mcp check is tested via a stub approach.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// evaluateFile/evaluateConfig are this repo's wrappers over
// @genvidtech/audit-core's evaluators (see ../lib/audit.mjs); evaluateTool
// has no wrapper here (lib/audit.mjs calls the core evaluator directly), so
// the `required` tests below import it straight from the package.
import { evaluateTool } from '@genvidtech/audit-core';

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
  checkRootDivergence,
  formatReport,
  evaluateComponentLoad,
  evaluateComponentFindings,
} from '../lib/audit.mjs';

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

// semverGte lives in lib/mcp-check.mjs; these tests exercise that real export
// (they previously tested an inline copy, which could not catch a regression).
import { semverGte } from '../lib/mcp-check.mjs';

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

import { extractFrontmatter } from '@genvidtech/audit-core';

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

test('frontmatter: reason scalar round-trips a docs:/// URI', async () => {
  const skillPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../SKILL.md');
  const src = await fs.readFile(skillPath, 'utf8');
  const fm = extractFrontmatter(src);
  assert.ok(fm, 'frontmatter should be parsed');
  assert.ok(
    fm.metadata?.expects?.mcp?.[0]?.reason?.includes('docs:///'),
    'mcp[0].reason should include a docs:/// URI',
  );
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
    assert.equal(finding.required, true);
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
    assert.equal(finding.required, true);
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
    assert.equal(finding.required, false);
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
    assert.equal(finding.required, true);
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
    assert.equal(finding.required, true);
    assert.ok(finding.detail.includes('path broke at'), `expected "path broke at" in: ${finding.detail}`);
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateConfig: missing key, required: false → info, required: false', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'my-config.json'), JSON.stringify({}));
    const finding = await evaluateConfig(
      { name: 'test-skill' },
      { key: 'foo.bar', in: 'my-config.json', required: false, reason: 'r' },
      dir,
    );
    assert.equal(finding.ok, false);
    assert.equal(finding.severity, 'info');
    assert.equal(finding.required, false);
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
    assert.equal(finding.required, true);
    assert.ok(finding.detail.includes('not found'), `expected "not found" in: ${finding.detail}`);
  } finally {
    await rmTmp(dir);
  }
});

// ---- evaluateTool required tests ---------------------------------------------
// evaluateTool comes straight from @genvidtech/audit-core (lib/audit.mjs calls
// it with no local wrapper); `node` is guaranteed present on PATH in this test
// run, and the bogus command name is guaranteed absent.

test('evaluateTool: command present → ok, required: true', () => {
  const finding = evaluateTool({ name: 'test-skill' }, { command: 'node', reason: 'r' });
  assert.equal(finding.ok, true);
  assert.equal(finding.required, true);
});

test('evaluateTool: required command missing → error, required: true', () => {
  const finding = evaluateTool(
    { name: 'test-skill' },
    { command: 'gvt-construct3-nonexistent-tool', reason: 'r' },
  );
  assert.equal(finding.ok, false);
  assert.equal(finding.severity, 'error');
  assert.equal(finding.required, true);
});

test('evaluateTool: optional command missing → info, required: false', () => {
  const finding = evaluateTool(
    { name: 'test-skill' },
    { command: 'gvt-construct3-nonexistent-tool', required: false, reason: 'r' },
  );
  assert.equal(finding.ok, false);
  assert.equal(finding.severity, 'info');
  assert.equal(finding.required, false);
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

// ---- checkRootDivergence tests ------------------------------------------------

test('checkRootDivergence: paths.c3project ≠ single-discovered child → fires, detail names both roots', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await fs.mkdir(a);
    await fs.mkdir(b);
    await fs.writeFile(join(a, 'project.c3proj'), '{}'); // single discoverable child (scan-matched name)
    // b's marker is a differently-named file so the discovery scan (which only looks
    // for a literal `project.c3proj`) does NOT pick it up as a second candidate —
    // otherwise this would be the ≥2-match ambiguous case, not a clean divergence.
    await fs.writeFile(join(b, 'x.c3proj'), '{}'); // paths.c3project points here instead

    const scan = await scanC3ProjectMarkers(dir);
    const projectRoot = resolveProjectRoot(dir, { paths: { c3project: 'b/x.c3proj' } });

    const finding = checkRootDivergence({ repoRoot: dir, projectRoot, scan, env: {} });
    assert.ok(finding, 'expected a divergence finding');
    assert.equal(finding.severity, 'info');
    assert.equal(finding.ok, false);
    assert.ok(finding.detail.includes(projectRoot), 'detail should name the validated (paths.c3project) root');
    assert.ok(finding.detail.includes(a), 'detail should name the discovered-pick root');
  } finally {
    await rmTmp(dir);
  }
});

test('checkRootDivergence: paths.c3project == discovery pick → null', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    await fs.mkdir(a);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');

    const scan = await scanC3ProjectMarkers(dir);
    const projectRoot = resolveProjectRoot(dir, { paths: { c3project: 'a/project.c3proj' } });

    const finding = checkRootDivergence({ repoRoot: dir, projectRoot, scan, env: {} });
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

test('checkRootDivergence: ≥2-child ambiguous discovery → null (discovery-ambiguity warning owns this)', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await fs.mkdir(a);
    await fs.mkdir(b);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    await fs.writeFile(join(b, 'project.c3proj'), '{}');

    const scan = await scanC3ProjectMarkers(dir);
    const projectRoot = resolveProjectRoot(dir, { paths: { c3project: 'a/project.c3proj' } });

    const finding = checkRootDivergence({ repoRoot: dir, projectRoot, scan, env: {} });
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

test('checkRootDivergence: rooted (root has marker) but paths.c3project elsewhere → fires', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(join(dir, 'project.c3proj'), '{}'); // root marker → pick = repoRoot
    const sub = join(dir, 'sub');
    await fs.mkdir(sub);
    await fs.writeFile(join(sub, 'x.c3proj'), '{}');

    const scan = await scanC3ProjectMarkers(dir);
    const projectRoot = resolveProjectRoot(dir, { paths: { c3project: 'sub/x.c3proj' } });

    const finding = checkRootDivergence({ repoRoot: dir, projectRoot, scan, env: {} });
    assert.ok(finding, 'expected a divergence finding');
    assert.equal(finding.severity, 'info');
  } finally {
    await rmTmp(dir);
  }
});

test('checkRootDivergence: explicit override pinned → suppressed (null) despite divergence', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    await fs.mkdir(a);
    await fs.mkdir(b);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    await fs.writeFile(join(b, 'project.c3proj'), '{}');

    const scan = await scanC3ProjectMarkers(dir);
    const projectRoot = resolveProjectRoot(dir, { paths: { c3project: 'b/project.c3proj' } });

    const finding = checkRootDivergence({
      repoRoot: dir,
      projectRoot,
      scan,
      env: {},
      explicitOverride: 'somewhere',
    });
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

test('checkRootDivergence: env C3_PROJECT_DIR set → suppressed (null) despite divergence', async () => {
  const dir = await mkTmp();
  try {
    const a = join(dir, 'a');
    await fs.mkdir(a);
    await fs.writeFile(join(a, 'project.c3proj'), '{}');
    const sub = join(dir, 'sub');
    await fs.mkdir(sub);
    await fs.writeFile(join(sub, 'x.c3proj'), '{}');

    const scan = await scanC3ProjectMarkers(dir);
    const projectRoot = resolveProjectRoot(dir, { paths: { c3project: 'sub/x.c3proj' } });

    const finding = checkRootDivergence({
      repoRoot: dir,
      projectRoot,
      scan,
      env: { C3_PROJECT_DIR: '/pinned' },
    });
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

test('checkRootDivergence: 0-children cwd-fallback pick but paths.c3project elsewhere → fires', async () => {
  const dir = await mkTmp();
  try {
    // no markers anywhere at repoRoot or any child → pick = repoRoot (cwd fallback)
    const sub = join(dir, 'sub');
    await fs.mkdir(sub);
    await fs.writeFile(join(sub, 'x.c3proj'), '{}');

    const scan = await scanC3ProjectMarkers(dir);
    const projectRoot = resolveProjectRoot(dir, { paths: { c3project: 'sub/x.c3proj' } });

    const finding = checkRootDivergence({ repoRoot: dir, projectRoot, scan, env: {} });
    assert.ok(finding, 'expected a divergence finding');
    assert.equal(finding.severity, 'info');
  } finally {
    await rmTmp(dir);
  }
});

test('checkRootDivergence: no paths.c3project + 0 children → null (agree, both repoRoot)', async () => {
  const dir = await mkTmp();
  try {
    const scan = await scanC3ProjectMarkers(dir);
    const projectRoot = resolveProjectRoot(dir, {});

    const finding = checkRootDivergence({ repoRoot: dir, projectRoot, scan, env: {} });
    assert.equal(finding, null);
  } finally {
    await rmTmp(dir);
  }
});

// ---- component-load tests ---------------------------------------------------

import { walkComponents } from '@genvidtech/audit-core';

test('evaluateComponentLoad: readable component returns null', () => {
  const c = { type: 'skill', name: 'ok', expects: {}, frontmatter: { name: 'ok' } };
  assert.equal(evaluateComponentLoad(c), null);
});

test('evaluateComponentLoad: skill readError → error finding on SKILL.md', () => {
  const c = {
    type: 'skill',
    name: 'foo',
    expects: null,
    frontmatter: null,
    readError: { code: 'EACCES', message: 'permission denied' },
  };
  const f = evaluateComponentLoad(c);
  assert.equal(f.kind, 'component');
  assert.equal(f.component, 'foo');
  assert.equal(f.target, 'skills/foo/SKILL.md');
  assert.equal(f.ok, false);
  assert.equal(f.severity, 'error');
  assert.equal(f.required, true);
  assert.match(f.detail, /EACCES: permission denied/);
  assert.ok(f.reason.length > 0);
});

test('evaluateComponentLoad: agent readError → error finding on agents/<name>.md', () => {
  const c = {
    type: 'agent',
    name: 'bar',
    expects: null,
    frontmatter: null,
    readError: { code: 'EISDIR', message: 'is a directory' },
  };
  const f = evaluateComponentLoad(c);
  assert.equal(f.target, 'agents/bar.md');
  assert.equal(f.severity, 'error');
  assert.equal(f.required, true);
  assert.match(f.detail, /EISDIR: is a directory/);
});

test('evaluateComponentLoad: malformed frontmatter via real walkComponents → error finding', async () => {
  const dir = await mkTmp();
  try {
    await fs.mkdir(join(dir, 'skills', 'bad'), { recursive: true });
    await fs.writeFile(join(dir, 'skills', 'bad', 'SKILL.md'), '---\nname: bad\ndescription: a: b\n---\n');
    const comps = await walkComponents(dir);
    const bad = comps.filter((c) => 'parseError' in c);
    assert.equal(bad.length, 1);
    const f = evaluateComponentLoad(bad[0]);
    assert.equal(f.severity, 'error');
    assert.equal(f.target, 'skills/bad/SKILL.md');
    assert.ok(f.detail.includes(`${bad[0].parseError.code}: `));
    assert.match(f.detail, /malformed/);
    // yaml's first message line ends with a colon introducing an excerpt that
    // audit-core drops; the detail carries the message without it.
    assert.ok(f.detail.includes(bad[0].parseError.message.replace(/:$/, '')));
    assert.doesNotMatch(f.detail, /:\)$/);
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateComponentLoad: a real fs error message names its code once', async () => {
  let readError;
  try {
    await fs.readFile(join(os.tmpdir(), 'gvt-c3-no-such-dir', 'SKILL.md'), 'utf8');
  } catch (err) {
    readError = { code: err.code, message: err.message };
  }
  assert.equal(readError.code, 'ENOENT');
  const f = evaluateComponentLoad({ type: 'skill', name: 'gone', expects: null, frontmatter: null, readError });
  assert.ok(f.detail.includes(readError.message));
  assert.equal(f.detail.split('ENOENT:').length - 1, 1);
});

test('formatReport: a component load error renders as "could not be loaded from"', () => {
  const f = evaluateComponentLoad({
    type: 'agent',
    name: 'bar',
    expects: null,
    frontmatter: null,
    readError: { code: 'EACCES', message: 'permission denied' },
  });
  const report = formatReport([f]);
  assert.match(report, /- \*\*bar\*\* could not be loaded from `agents\/bar\.md` — file could not be read \(EACCES: permission denied\)\./);
  assert.doesNotMatch(report, /expects `agents\/bar\.md`/);
});

// The per-component step main() runs. A malformed component must contribute its
// load error, not the empty list a component without expects contributes.
test('evaluateComponentFindings: malformed component via real walkComponents → exactly its load error', async () => {
  const dir = await mkTmp();
  try {
    await fs.mkdir(join(dir, 'skills', 'bad'), { recursive: true });
    await fs.writeFile(join(dir, 'skills', 'bad', 'SKILL.md'), '---\nname: bad\ndescription: a: b\n---\n');
    const [bad] = await walkComponents(dir);
    assert.ok('parseError' in bad);
    const findings = await evaluateComponentFindings(bad, dir, dir);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, 'component');
    assert.equal(findings[0].severity, 'error');
    assert.equal(findings[0].target, 'skills/bad/SKILL.md');
  } finally {
    await rmTmp(dir);
  }
});

test('evaluateComponentFindings: readable component → one finding per expectation', async () => {
  const c = {
    type: 'skill',
    name: 'ok',
    expects: { tools: [{ command: 'node', reason: 'runs scripts' }] },
    frontmatter: { name: 'ok' },
  };
  const findings = await evaluateComponentFindings(c);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'tool');
  assert.equal(findings[0].ok, true);
});

test('evaluateComponentFindings: readable component without expects → no findings', async () => {
  const c = { type: 'agent', name: 'plain', expects: null, frontmatter: { name: 'plain' } };
  assert.deepEqual(await evaluateComponentFindings(c), []);
});

// ---- malformed metadata.expects ---------------------------------------------

// Namespace import so the helper's absence fails its own tests, not the file load.
import * as auditLib from '../lib/audit.mjs';

// Writes a temp skills/<name>/SKILL.md whose frontmatter ends with `extraYaml`,
// walks it with the real walkComponents, and returns the findings.
async function findingsForSkill(extraYaml) {
  const dir = await mkTmp();
  try {
    await fs.mkdir(join(dir, 'skills', 'shape'), { recursive: true });
    await fs.writeFile(join(dir, 'skills', 'shape', 'SKILL.md'), `---\nname: shape\ndescription: x\n${extraYaml}---\n`);
    const [c] = await walkComponents(dir);
    return await evaluateComponentFindings(c, dir, dir);
  } finally {
    await rmTmp(dir);
  }
}

const SHAPE_CASES = [
  ['expects is a string', 'metadata:\n  expects: oops\n', /`metadata\.expects` is a string/],
  ['expects is a number', 'metadata:\n  expects: 42\n', /`metadata\.expects` is a number/],
  ['expects is an array', 'metadata:\n  expects:\n    - a\n', /`metadata\.expects` is an array/],
  ['metadata is a string', 'metadata: oops\n', /`metadata` is a string/],
  ['files is a string', 'metadata:\n  expects:\n    files: abc\n', /`metadata\.expects\.files`/],
  ['files is a mapping', 'metadata:\n  expects:\n    files:\n      path: x\n', /`metadata\.expects\.files`/],
  ['mcp is a string', 'metadata:\n  expects:\n    mcp: x\n', /`metadata\.expects\.mcp`/],
  ['files entry is a string', 'metadata:\n  expects:\n    files:\n      - abc\n', /`metadata\.expects\.files\[0\]`/],
  ['files entry lacks path', 'metadata:\n  expects:\n    files:\n      - {}\n', /`metadata\.expects\.files\[0\]` has no string `path`/],
  ['config entry lacks key', 'metadata:\n  expects:\n    config:\n      - {}\n', /`metadata\.expects\.config\[0\]` has no string `key`/],
  ['tools entry lacks command', 'metadata:\n  expects:\n    tools:\n      - {}\n', /`metadata\.expects\.tools\[0\]` has no string `command`/],
  ['tools entry is a string', 'metadata:\n  expects:\n    tools:\n      - x\n', /`metadata\.expects\.tools\[0\]`/],
  ['mcp entry lacks server and package', 'metadata:\n  expects:\n    mcp:\n      - {}\n', /`metadata\.expects\.mcp\[0\]` has no string `server`, `package`/],
  ['unknown key', 'metadata:\n  expects:\n    filez:\n      - path: x\n', /`metadata\.expects\.filez` is not a known key \(files, config, tools, mcp\)/],
];

for (const [label, yaml, detailRe] of SHAPE_CASES) {
  test(`evaluateComponentFindings: ${label} → one expects error`, async () => {
    const findings = await findingsForSkill(yaml);
    assert.equal(findings.length, 1);
    const [f] = findings;
    assert.equal(f.kind, 'expects');
    assert.equal(f.severity, 'error');
    assert.equal(f.ok, false);
    assert.equal(f.required, true);
    assert.equal(f.component, 'shape');
    assert.equal(f.target, 'skills/shape/SKILL.md');
    assert.match(f.detail, detailRe);
    assert.ok(f.reason);
  });
}

test('evaluateComponentFindings: a bad key does not stop a sibling key being evaluated', async () => {
  const findings = await findingsForSkill('metadata:\n  expects:\n    files: abc\n    tools:\n      - command: node\n');
  assert.deepEqual(findings.map((f) => f.kind).sort(), ['expects', 'tool']);
  assert.equal(findings.find((f) => f.kind === 'tool').ok, true);
});

test('evaluateComponentFindings: a bad entry does not stop a sibling entry being evaluated', async () => {
  const findings = await findingsForSkill('metadata:\n  expects:\n    files:\n      - path: x\n      - {}\n');
  assert.deepEqual(findings.map((f) => f.kind).sort(), ['expects', 'file']);
  assert.match(findings.find((f) => f.kind === 'expects').detail, /files\[1\]/);
});

test('evaluateComponentFindings: absent metadata, null files, and a good tool stay unflagged', async () => {
  assert.equal((await findingsForSkill('')).length, 0);
  assert.equal((await findingsForSkill('metadata:\n  expects:\n    files:\n')).length, 0);
  const tool = await findingsForSkill('metadata:\n  expects:\n    tools:\n      - command: node\n');
  assert.equal(tool.length, 1);
  assert.equal(tool[0].kind, 'tool');
  assert.equal(tool[0].ok, true);
});

test('evaluateExpectsShape: returns only the well-formed entries per key', () => {
  const c = {
    type: 'skill',
    name: 'u',
    frontmatter: { metadata: {} },
    expects: { files: [{ path: 'a' }, {}], tools: null, config: [{ key: 'k' }] },
  };
  const { errors, expects } = auditLib.evaluateExpectsShape(c);
  assert.equal(errors.length, 1);
  assert.deepEqual(expects.files, [{ path: 'a' }]);
  assert.deepEqual(expects.config, [{ key: 'k' }]);
  assert.deepEqual(expects.tools, []);
  assert.deepEqual(expects.mcp, []);
});

test('evaluateExpectsShape: a non-mapping expects yields one error and no entries', () => {
  const c = { type: 'agent', name: 'u', frontmatter: { metadata: { expects: 'x' } }, expects: 'x' };
  const { errors, expects } = auditLib.evaluateExpectsShape(c);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].target, 'agents/u.md');
  assert.deepEqual(expects, { files: [], config: [], tools: [], mcp: [] });
});

test('formatReport: an expects shape error names the component, file and detail', async () => {
  const findings = await findingsForSkill('metadata:\n  expects:\n    files:\n      - {}\n');
  const report = formatReport(findings);
  assert.match(report, /- \*\*shape\*\* has malformed expectations in `skills\/shape\/SKILL\.md`/);
  assert.ok(report.includes(findings[0].detail));
  assert.doesNotMatch(report, /could not be loaded/);
  assert.doesNotMatch(report, /expects `undefined`/);
});
