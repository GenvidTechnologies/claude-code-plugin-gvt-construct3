import { test } from 'node:test';
import assert from 'node:assert/strict';

import { preflight } from '../lib/preflight.mjs';

// ---- failing importer ---------------------------------------------------

test('preflight: failing importer → exit code 2, message names the package and npm ci, no stack', async () => {
  const failingImporter = async () => {
    throw new Error("Cannot find package '@genvidtech/audit-core'");
  };

  const result = await preflight({ importer: failingImporter, pluginRoot: '/plugin' });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 2);
  assert.match(result.message, /@genvidtech\/audit-core/);
  assert.match(result.message, /npm ci --prefix \/plugin --ignore-scripts/);
  assert.match(result.message, /Cannot find package '@genvidtech\/audit-core'/);
  assert.equal(result.message.includes('    at '), false); // no stack trace
});

test('preflight: failing importer with no pluginRoot falls back to a generic hint', async () => {
  const failingImporter = async () => {
    throw new Error('boom');
  };

  const result = await preflight({ importer: failingImporter });

  assert.equal(result.ok, false);
  assert.match(result.message, /npm ci --prefix <plugin root> --ignore-scripts/);
});

// ---- succeeding importer --------------------------------------------------

test('preflight: succeeding importer → ok', async () => {
  const okImporter = async () => ({ VERSION: '0.2.0' });

  const result = await preflight({ importer: okImporter });

  assert.deepEqual(result, { ok: true });
});

// ---- real import ------------------------------------------------------------

test('preflight: real dynamic import of the installed @genvidtech/audit-core passes', async () => {
  const result = await preflight();

  assert.deepEqual(result, { ok: true });
});
