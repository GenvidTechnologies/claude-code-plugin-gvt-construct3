import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsePinnedArg, checkManifest } from '../lib/plugin-manifest.mjs';

function validManifest() {
  return {
    name: 'gvt-construct3',
    version: '1.2.3',
    description: 'a plugin description',
    mcpServers: {
      'construct3-chef': {
        command: 'npx',
        args: ['-y', '@genvidtech/construct3-chef@1.2.3', 'server'],
      },
      'c3-domain-manager': {
        command: 'npx',
        args: ['-y', '@genvidtech/c3-domain-manager@0.9.0', 'server'],
      },
    },
  };
}

function problemFor(result, key) {
  return result.problems.find((p) => p.key === key);
}

// --- parsePinnedArg ---------------------------------------------------

test('parsePinnedArg accepts a valid pinned scoped specifier', () => {
  assert.deepEqual(parsePinnedArg('@genvidtech/construct3-chef@1.2.3'), {
    pkg: '@genvidtech/construct3-chef',
    version: '1.2.3',
  });
});

test('parsePinnedArg rejects a caret range', () => {
  assert.equal(parsePinnedArg('@genvidtech/construct3-chef@^1.2.0'), null);
});

test('parsePinnedArg rejects a tilde range', () => {
  assert.equal(parsePinnedArg('@genvidtech/construct3-chef@~1.2.0'), null);
});

test('parsePinnedArg rejects a dist-tag', () => {
  assert.equal(parsePinnedArg('@genvidtech/construct3-chef@latest'), null);
});

test('parsePinnedArg rejects a specifier with no version at all', () => {
  assert.equal(parsePinnedArg('@genvidtech/construct3-chef'), null);
});

test('parsePinnedArg rejects a pre-release version', () => {
  assert.equal(parsePinnedArg('@genvidtech/x@1.2.0-rc.1'), null);
});

test('parsePinnedArg rejects a version carrying build metadata', () => {
  assert.equal(parsePinnedArg('@genvidtech/x@1.2.0+build.1'), null);
});

test('parsePinnedArg rejects an empty package name', () => {
  assert.equal(parsePinnedArg('@genvidtech/@1.2.0'), null);
});

test('parsePinnedArg rejects a bare unscoped package name', () => {
  assert.equal(parsePinnedArg('construct3-chef@1.2.0'), null);
});

test('parsePinnedArg rejects the scope alone with no package or version', () => {
  assert.equal(parsePinnedArg('@genvidtech/'), null);
});

test('parsePinnedArg rejects a two-segment version', () => {
  assert.equal(parsePinnedArg('@genvidtech/x@1.2'), null);
});

test('parsePinnedArg rejects a four-segment version', () => {
  assert.equal(parsePinnedArg('@genvidtech/x@1.2.3.4'), null);
});

test('parsePinnedArg rejects non-string arguments', () => {
  assert.equal(parsePinnedArg(42), null);
  assert.equal(parsePinnedArg(null), null);
  assert.equal(parsePinnedArg(undefined), null);
});

// --- checkManifest ------------------------------------------------------

test('checkManifest accepts a manifest with both servers pinned', () => {
  const result = checkManifest(validManifest());
  assert.equal(result.ok, true);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.pins, [
    { key: 'mcpServers.construct3-chef', pkg: '@genvidtech/construct3-chef', version: '1.2.3' },
    { key: 'mcpServers.c3-domain-manager', pkg: '@genvidtech/c3-domain-manager', version: '0.9.0' },
  ]);
});

test('checkManifest flags name/version/description when the keys are missing entirely', () => {
  const manifest = validManifest();
  delete manifest.name;
  delete manifest.version;
  delete manifest.description;
  const result = checkManifest(manifest);
  assert.equal(result.ok, false);
  for (const key of ['name', 'version', 'description']) {
    assert.deepEqual(problemFor(result, key), { key, message: 'missing or not a non-empty string' });
  }
});

test('checkManifest flags name/version/description when they are empty strings', () => {
  const manifest = validManifest();
  manifest.name = '';
  manifest.version = '';
  manifest.description = '';
  const result = checkManifest(manifest);
  assert.equal(result.ok, false);
  for (const key of ['name', 'version', 'description']) {
    assert.deepEqual(problemFor(result, key), { key, message: 'missing or not a non-empty string' });
  }
});

test('checkManifest flags name/version/description when they are whitespace-only', () => {
  const manifest = validManifest();
  manifest.name = '   ';
  manifest.version = '\t';
  manifest.description = '\n  \n';
  const result = checkManifest(manifest);
  assert.equal(result.ok, false);
  for (const key of ['name', 'version', 'description']) {
    assert.deepEqual(problemFor(result, key), { key, message: 'missing or not a non-empty string' });
  }
});

test('checkManifest flags name/version/description when they are not strings', () => {
  const manifest = validManifest();
  manifest.name = 42;
  manifest.version = null;
  manifest.description = {};
  const result = checkManifest(manifest);
  assert.equal(result.ok, false);
  for (const key of ['name', 'version', 'description']) {
    assert.deepEqual(problemFor(result, key), { key, message: 'missing or not a non-empty string' });
  }
});

test('checkManifest flags mcpServers when it is missing entirely', () => {
  const manifest = validManifest();
  delete manifest.mcpServers;
  const result = checkManifest(manifest);
  assert.equal(result.ok, false);
  assert.deepEqual(result.problems, [{ key: 'mcpServers', message: 'missing or not an object' }]);
  assert.deepEqual(result.pins, []);
});

test('checkManifest flags mcpServers when it is not an object', () => {
  const manifest = validManifest();
  manifest.mcpServers = 'nope';
  const result = checkManifest(manifest);
  assert.deepEqual(result.problems, [{ key: 'mcpServers', message: 'missing or not an object' }]);
});

test('checkManifest flags mcpServers when it is an array', () => {
  const manifest = validManifest();
  manifest.mcpServers = [];
  const result = checkManifest(manifest);
  assert.deepEqual(result.problems, [{ key: 'mcpServers', message: 'missing or not an object' }]);
});

test('checkManifest flags a required server that is missing', () => {
  const manifest = validManifest();
  delete manifest.mcpServers['construct3-chef'];
  const result = checkManifest(manifest);
  assert.equal(result.ok, false);
  assert.deepEqual(problemFor(result, 'mcpServers.construct3-chef'), {
    key: 'mcpServers.construct3-chef',
    message: 'missing or not an object',
  });
  // the other, well-formed server still resolves its pin
  assert.deepEqual(result.pins, [
    { key: 'mcpServers.c3-domain-manager', pkg: '@genvidtech/c3-domain-manager', version: '0.9.0' },
  ]);
});

test('checkManifest flags server args when they are not an array', () => {
  const manifest = validManifest();
  manifest.mcpServers['construct3-chef'].args = 'not-an-array';
  const result = checkManifest(manifest);
  assert.deepEqual(problemFor(result, 'mcpServers.construct3-chef.args'), {
    key: 'mcpServers.construct3-chef.args',
    message: 'missing or not an array',
  });
});

test('checkManifest flags args with no pinned argument among them', () => {
  const manifest = validManifest();
  manifest.mcpServers['construct3-chef'].args = ['-y', '--verbose'];
  const result = checkManifest(manifest);
  assert.deepEqual(problemFor(result, 'mcpServers.construct3-chef.args'), {
    key: 'mcpServers.construct3-chef.args',
    message: 'no pinned @genvidtech/<pkg>@<x.y.z> argument — got ["-y","--verbose"]',
  });
});

test('checkManifest flags a range where a pin is required', () => {
  const manifest = validManifest();
  manifest.mcpServers['construct3-chef'].args = ['-y', '@genvidtech/construct3-chef@^1.2.0'];
  const result = checkManifest(manifest);
  assert.deepEqual(problemFor(result, 'mcpServers.construct3-chef.args'), {
    key: 'mcpServers.construct3-chef.args',
    message:
      'no pinned @genvidtech/<pkg>@<x.y.z> argument — got ["-y","@genvidtech/construct3-chef@^1.2.0"]',
  });
});

test('checkManifest flags a package pinned under the wrong server key', () => {
  const manifest = validManifest();
  // The chef key carries a pinned c3-domain-manager argument — the #125 defect.
  manifest.mcpServers['construct3-chef'].args = ['-y', '@genvidtech/c3-domain-manager@0.9.0'];
  const result = checkManifest(manifest);
  assert.deepEqual(problemFor(result, 'mcpServers.construct3-chef.args'), {
    key: 'mcpServers.construct3-chef.args',
    message:
      'pinned package does not match the server key — expected @genvidtech/construct3-chef, got @genvidtech/c3-domain-manager',
  });
  // the other, correctly-keyed server still resolves its pin
  assert.deepEqual(result.pins, [
    { key: 'mcpServers.c3-domain-manager', pkg: '@genvidtech/c3-domain-manager', version: '0.9.0' },
  ]);
});
