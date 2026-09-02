// Branch coverage for `parseYaml` paths that `frontmatter.test.mjs` does not
// reach. That file is a byte-identical mirror of gvt-dev's and must stay one
// (ADR 0014) — local cases belong here instead, so the mirror stays diffable
// against upstream with a single sha256.
//
// Not covered here: frontmatter.mjs:79-81, the blank/comment skip at the top of
// `parseArray`'s loop. It is unreachable — `parseArray`'s only call site passes
// `peekNextNonBlank`'s index, and inside the loop `i` advances only through
// `parseBlock`, whose return sites are all non-blank or past end-of-input.
// Blank lines and comments between array items are consumed by parseBlock's own
// skip (lines 29-32) before parseArray ever sees them, which the last test here
// pins. Reported upstream as GenvidTechnologies/claude-code-plugin-gvt-dev#471;
// deliberately not patched locally, since that would break the byte-identity
// #95 depends on.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseYaml } from '../lib/frontmatter.mjs';

// frontmatter.mjs:39-41 — parseBlock meets a sequence item where it expected a key
test('parseYaml: a bare top-level sequence yields an empty object', () => {
  assert.deepEqual(parseYaml('- a: 1'), {});
});

// frontmatter.mjs:45-47 — a line carrying no colon is skipped rather than throwing
test('parseYaml: a line without a colon is skipped', () => {
  assert.deepEqual(parseYaml('no colon here\nname: foo'), { name: 'foo' });
});

// frontmatter.mjs:63-65 and :115 — empty value, nothing follows at all
test('parseYaml: a dangling key at end of input parses as null', () => {
  assert.deepEqual(parseYaml('key:'), { key: null });
});

// frontmatter.mjs:63-65 reached by dedent rather than end-of-input
test('parseYaml: a dangling key followed by a dedented sibling parses as null', () => {
  assert.deepEqual(
    parseYaml('outer:\n  inner:\nnext: v'),
    { outer: { inner: null }, next: 'v' },
  );
});

// Pins the behaviour that makes frontmatter.mjs:79-81 unreachable: blank lines
// and comments between sequence items are handled, but by parseBlock, not by
// parseArray. If a future change moves that handling, this test still passes and
// the dead branch becomes live — which is the outcome gvt-dev#471 asks about.
test('parseYaml: blank lines and comments between sequence items are ignored', () => {
  const yaml = `files:
  - path: a

  # a comment between items
  - path: b`;
  assert.deepEqual(parseYaml(yaml), { files: [{ path: 'a' }, { path: 'b' }] });
});
