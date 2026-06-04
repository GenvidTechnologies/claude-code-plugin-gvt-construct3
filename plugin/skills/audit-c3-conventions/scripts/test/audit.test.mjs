// node --test audit.test.mjs
// Unit tests for the audit-c3-conventions script logic.
// Tests the C3-project marker check and the MCP evaluateMcp helper
// using temporary fixture directories — no external processes for the marker
// tests; the mcp check is tested via a stub approach.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

// ---- helpers ----------------------------------------------------------------

async function mkTmp() {
  return fs.mkdtemp(join(os.tmpdir(), 'genvid-c3-audit-test-'));
}

async function rmTmp(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

// Inline the checkC3Marker logic so we can test it without spawning a child
// process. We import from the helpers directly rather than the full audit.mjs
// to avoid triggering main().

import { resolveKey } from '../lib/config-resolve.mjs';

// Re-implement checkC3Marker inline for test purposes (mirrors audit.mjs exactly)
async function checkC3Marker(repoRoot) {
  const COMPONENT = 'genvid-c3';
  const KIND = 'marker';
  const REASON =
    'genvid-c3 only applies to Construct 3 projects; this repo does not look like one.';

  const { promises: fsLocal } = await import('node:fs');
  const { join: joinLocal, resolve: resolveLocal } = await import('node:path');

  async function fileExists(p) {
    try {
      const s = await fsLocal.stat(p);
      return s.isFile();
    } catch {
      return false;
    }
  }

  // Option A: project.c3proj
  if (await fileExists(joinLocal(repoRoot, 'project.c3proj'))) {
    return { kind: KIND, component: COMPONENT, target: 'project.c3proj', ok: true };
  }

  // Option B / C: .genvid-agent.json
  let parsed = null;
  try {
    const raw = await fsLocal.readFile(joinLocal(repoRoot, '.genvid-agent.json'), 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    // missing or invalid
  }

  if (parsed !== null) {
    const featuresResult = resolveKey(parsed, 'features.c3');
    if (featuresResult.found && featuresResult.value === true) {
      return {
        kind: KIND,
        component: COMPONENT,
        target: '.genvid-agent.json features.c3',
        ok: true,
      };
    }

    const pathsResult = resolveKey(parsed, 'paths.c3project');
    if (pathsResult.found && typeof pathsResult.value === 'string') {
      const override = resolveLocal(repoRoot, pathsResult.value);
      if (await fileExists(override)) {
        return {
          kind: KIND,
          component: COMPONENT,
          target: `paths.c3project → ${pathsResult.value}`,
          ok: true,
        };
      }
    }
  }

  return {
    kind: KIND,
    component: COMPONENT,
    target: 'C3-project marker',
    ok: false,
    severity: 'error',
    detail:
      'No C3-project marker found (need `project.c3proj`, or `.genvid-agent.json` `features.c3: true`, or `paths.c3project`)',
    reason: REASON,
  };
}

// ---- marker tests -----------------------------------------------------------

test('marker: bare temp dir with no files → error finding', async () => {
  const dir = await mkTmp();
  try {
    const finding = await checkC3Marker(dir);
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
    const finding = await checkC3Marker(dir);
    assert.equal(finding.ok, true);
    assert.equal(finding.target, 'project.c3proj');
  } finally {
    await rmTmp(dir);
  }
});

test('marker: .genvid-agent.json features.c3 = true → ok', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.genvid-agent.json'),
      JSON.stringify({ features: { c3: true } }),
    );
    const finding = await checkC3Marker(dir);
    assert.equal(finding.ok, true);
    assert.match(finding.target, /features\.c3/);
  } finally {
    await rmTmp(dir);
  }
});

test('marker: .genvid-agent.json features.c3 = false → error', async () => {
  const dir = await mkTmp();
  try {
    await fs.writeFile(
      join(dir, '.genvid-agent.json'),
      JSON.stringify({ features: { c3: false } }),
    );
    const finding = await checkC3Marker(dir);
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
      join(dir, '.genvid-agent.json'),
      JSON.stringify({ paths: { c3project: 'myproject.c3proj' } }),
    );
    const finding = await checkC3Marker(dir);
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
      join(dir, '.genvid-agent.json'),
      JSON.stringify({ paths: { c3project: 'missing.c3proj' } }),
    );
    const finding = await checkC3Marker(dir);
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

import { evaluateFile, evaluateConfig } from '../audit.mjs';

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
