// node --test reference-index.test.mjs
// Unit tests for the reference-index assembler/validator lib used by the
// build-reference skill. These mirror chef's ReferenceIndexSchema shape so the
// local preview validator agrees with chef's loadReferenceCache.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION,
  validateAceEntry,
  validateChunkEntry,
  validateReferenceIndex,
  assembleIndex,
} from '../lib/reference-index.mjs';

// ---- fixtures ---------------------------------------------------------------

const goodAce = {
  source: 'builtin',
  objectClass: 'Sprite',
  kind: 'action',
  id: 'set-position',
  scriptName: 'setPosition',
  params: [
    { name: 'x', type: 'number' },
    { name: 'y', type: 'number' },
  ],
  description: 'Set the object position.',
  canonicalUrl: 'https://www.construct.net/en/make-games/manuals/construct-3/plugin-reference/sprite',
};

const goodChunk = {
  title: 'Expressions',
  text: 'The expression language evaluates...',
  canonicalUrl: 'https://www.construct.net/en/make-games/manuals/construct-3/project-primitives/events/expressions',
  category: 'expression',
};

// ---- validateAceEntry -------------------------------------------------------

test('validateAceEntry: a complete builtin ACE is valid', () => {
  const errors = [];
  validateAceEntry(goodAce, 'a', errors);
  assert.deepEqual(errors, []);
});

test('validateAceEntry: optional fields may be omitted', () => {
  const errors = [];
  validateAceEntry(
    { source: 'manual', objectClass: 'System', kind: 'expression', id: 'time', params: [] },
    'a',
    errors,
  );
  assert.deepEqual(errors, []);
});

test('validateAceEntry: bad source enum is rejected', () => {
  const errors = [];
  validateAceEntry({ ...goodAce, source: 'plugin' }, 'a', errors);
  assert.ok(errors.some((e) => e.includes('source')));
});

test('validateAceEntry: bad kind enum is rejected', () => {
  const errors = [];
  validateAceEntry({ ...goodAce, kind: 'trigger' }, 'a', errors);
  assert.ok(errors.some((e) => e.includes('kind')));
});

test('validateAceEntry: missing id is rejected', () => {
  const errors = [];
  const { id, ...noId } = goodAce;
  validateAceEntry(noId, 'a', errors);
  assert.ok(errors.some((e) => e.includes('id')));
});

test('validateAceEntry: missing source is rejected', () => {
  const errors = [];
  const { source, ...noSource } = goodAce;
  validateAceEntry(noSource, 'a', errors);
  assert.ok(errors.some((e) => e.includes('source')));
});

test('validateAceEntry: missing objectClass is rejected', () => {
  const errors = [];
  const { objectClass, ...noClass } = goodAce;
  validateAceEntry(noClass, 'a', errors);
  assert.ok(errors.some((e) => e.includes('objectClass')));
});

test('validateAceEntry: missing kind is rejected', () => {
  const errors = [];
  const { kind, ...noKind } = goodAce;
  validateAceEntry(noKind, 'a', errors);
  assert.ok(errors.some((e) => e.includes('kind')));
});

test('validateAceEntry: params must be {name,type} objects', () => {
  const errors = [];
  validateAceEntry({ ...goodAce, params: [{ id: 'x', type: 'number' }] }, 'a', errors);
  // `id` is not `name` → name is reported missing (the exact field-mapping trap).
  assert.ok(errors.some((e) => e.includes('params[0].name')));
});

test('validateAceEntry: params must be an array', () => {
  const errors = [];
  validateAceEntry({ ...goodAce, params: undefined }, 'a', errors);
  assert.ok(errors.some((e) => e.includes('params')));
});

test('validateAceEntry: unknown keys are tolerated (zod strip)', () => {
  const errors = [];
  validateAceEntry({ ...goodAce, displayText: 'whatever' }, 'a', errors);
  assert.deepEqual(errors, []);
});

// ---- validateChunkEntry -----------------------------------------------------

test('validateChunkEntry: a complete chunk is valid', () => {
  const errors = [];
  validateChunkEntry(goodChunk, 'c', errors);
  assert.deepEqual(errors, []);
});

test('validateChunkEntry: canonicalUrl is REQUIRED for chunks', () => {
  const errors = [];
  const { canonicalUrl, ...noUrl } = goodChunk;
  validateChunkEntry(noUrl, 'c', errors);
  assert.ok(errors.some((e) => e.includes('canonicalUrl')));
});

test('validateChunkEntry: bad category enum is rejected', () => {
  const errors = [];
  validateChunkEntry({ ...goodChunk, category: 'behavior' }, 'c', errors);
  assert.ok(errors.some((e) => e.includes('category')));
});

// ---- validateReferenceIndex -------------------------------------------------

test('validateReferenceIndex: a minimal valid index (no aces/chunks)', () => {
  const res = validateReferenceIndex({
    schemaVersion: 1,
    manualVersion: 'v1769',
    generatedAt: '2026-06-11T00:00:00.000Z',
  });
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
});

test('validateReferenceIndex: full index with aces + chunks is valid', () => {
  const res = validateReferenceIndex({
    schemaVersion: 1,
    manualVersion: 'v1769',
    generatedAt: '2026-06-11T00:00:00.000Z',
    aces: [goodAce],
    chunks: [goodChunk],
  });
  assert.equal(res.valid, true);
});

test('validateReferenceIndex: missing manualVersion is rejected', () => {
  const res = validateReferenceIndex({
    schemaVersion: 1,
    generatedAt: '2026-06-11T00:00:00.000Z',
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('manualVersion')));
});

test('validateReferenceIndex: non-number schemaVersion is rejected', () => {
  const res = validateReferenceIndex({
    schemaVersion: '1',
    manualVersion: 'v1769',
    generatedAt: '2026-06-11T00:00:00.000Z',
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('schemaVersion')));
});

test('validateReferenceIndex: a bad nested ace surfaces a pathed error', () => {
  const res = validateReferenceIndex({
    schemaVersion: 1,
    manualVersion: 'v1769',
    generatedAt: '2026-06-11T00:00:00.000Z',
    aces: [{ ...goodAce, kind: 'nope' }],
  });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.startsWith('index.aces[0]')));
});

test('validateReferenceIndex: non-object input is rejected cleanly', () => {
  assert.equal(validateReferenceIndex(null).valid, false);
  assert.equal(validateReferenceIndex('nope').valid, false);
  assert.equal(validateReferenceIndex([]).valid, false);
});

// ---- assembleIndex ----------------------------------------------------------

test('assembleIndex: stamps schemaVersion and passes through inputs', () => {
  const index = assembleIndex({
    manualVersion: 'v1769',
    generatedAt: '2026-06-11T00:00:00.000Z',
    aces: [goodAce],
    chunks: [goodChunk],
  });
  assert.equal(index.schemaVersion, SCHEMA_VERSION);
  assert.equal(index.manualVersion, 'v1769');
  assert.equal(index.generatedAt, '2026-06-11T00:00:00.000Z');
  assert.equal(index.aces.length, 1);
  assert.equal(index.chunks.length, 1);
});

test('assembleIndex: defaults aces/chunks to empty arrays', () => {
  const index = assembleIndex({ manualVersion: 'v1769', generatedAt: '2026-06-11T00:00:00.000Z' });
  assert.deepEqual(index.aces, []);
  assert.deepEqual(index.chunks, []);
});

test('assembleIndex: throws on invalid input rather than producing a bad cache', () => {
  assert.throws(
    () =>
      assembleIndex({
        manualVersion: 'v1769',
        generatedAt: '2026-06-11T00:00:00.000Z',
        chunks: [{ title: 'x', text: 'y', category: 'layout' }], // missing canonicalUrl
      }),
    /canonicalUrl/,
  );
});

test('assembleIndex: round-trips through JSON and re-validates', () => {
  const index = assembleIndex({
    manualVersion: 'v1769',
    generatedAt: '2026-06-11T00:00:00.000Z',
    aces: [goodAce],
    chunks: [goodChunk],
  });
  const roundTripped = JSON.parse(JSON.stringify(index));
  assert.equal(validateReferenceIndex(roundTripped).valid, true);
});
