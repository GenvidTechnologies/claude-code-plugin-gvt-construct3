// Edge-input behaviours of `parseYaml` that this repo's frontmatter handling
// relies on, pinned against audit-core's yaml-based parser (YAML 1.2). The
// string API never throws: a parse error, or a root that is not a mapping,
// yields `{}`. `frontmatter.test.mjs` is a byte-identical mirror of gvt-dev's
// and must stay one (ADR 0014) — local cases belong here instead, so the mirror
// stays diffable against upstream with a single sha256.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseYaml } from '@genvidtech/audit-core';

// A root that is a sequence rather than a mapping is not frontmatter.
test('parseYaml: a bare top-level sequence yields an empty object', () => {
  assert.deepEqual(parseYaml('- a: 1'), {});
});

// A malformed document is reported as `{}`, never as an exception.
test('parseYaml: a malformed document yields an empty object and does not throw', () => {
  assert.doesNotThrow(() => parseYaml('no colon here\nname: foo'));
  assert.deepEqual(parseYaml('no colon here\nname: foo'), {});
});

// A key with an empty value and nothing after it parses as null.
test('parseYaml: a dangling key at end of input parses as null', () => {
  assert.deepEqual(parseYaml('key:'), { key: null });
});

// A key with an empty value followed by a dedented sibling also parses as null.
test('parseYaml: a dangling key followed by a dedented sibling parses as null', () => {
  assert.deepEqual(
    parseYaml('outer:\n  inner:\nnext: v'),
    { outer: { inner: null }, next: 'v' },
  );
});

// Blank lines and comments between sequence items do not break the sequence.
test('parseYaml: blank lines and comments between sequence items are ignored', () => {
  const yaml = `files:
  - path: a

  # a comment between items
  - path: b`;
  assert.deepEqual(parseYaml(yaml), { files: [{ path: 'a' }, { path: 'b' }] });
});
