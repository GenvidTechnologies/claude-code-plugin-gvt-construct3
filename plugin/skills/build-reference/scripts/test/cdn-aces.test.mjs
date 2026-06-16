// node --test cdn-aces.test.mjs
// Unit tests for the cdn-aces flattener lib used by the build-reference skill.
// Verifies that the C3 editor CDN allAces.json shape maps cleanly to the
// AceEntrySchema fields required by the construct3-chef c3-reference cache.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flattenAllAces } from '../lib/cdn-aces.mjs';

// ---- fixtures ---------------------------------------------------------------

// A minimal allAces.json document with two plugins and two categories.
// Sprite has one category with conditions + actions + expressions.
// Tilemap has a second category to exercise multi-category flattening.
const SPRITE_CATEGORY = {
  conditions: [
    {
      id: 'compare-animation-frame',
      scriptName: 'CompareFrame',
      params: [
        { id: 'comparison', type: 'cmp' },
        { id: 'number', type: 'number' },
      ],
      isTrigger: false,
    },
  ],
  actions: [
    {
      id: 'set-animation',
      scriptName: 'SetAnimation',
      params: [{ id: 'animation', type: 'string' }],
    },
  ],
  expressions: [
    {
      id: 'animationframe',
      expressionName: 'AnimationFrame',
      returnType: 'number',
      params: [],
    },
  ],
};

const TILEMAP_CATEGORY_1 = {
  actions: [
    {
      id: 'set-tile',
      scriptName: 'SetTile',
      params: [
        { id: 'x', type: 'number' },
        { id: 'y', type: 'number' },
        { id: 'tile', type: 'number' },
      ],
    },
  ],
};

const TILEMAP_CATEGORY_2 = {
  conditions: [
    {
      id: 'is-tile-at',
      scriptName: 'IsTileAt',
      params: [{ id: 'x', type: 'number' }],
    },
  ],
};

const FIXTURE = {
  Sprite: {
    animation: SPRITE_CATEGORY,
  },
  Tilemap: {
    tile: TILEMAP_CATEGORY_1,
    query: TILEMAP_CATEGORY_2,
  },
};

// ---- helpers ----------------------------------------------------------------

function findRecord(records, { objectClass, kind, id }) {
  return records.find((r) => r.objectClass === objectClass && r.kind === kind && r.id === id);
}

// ---- flattenAllAces ---------------------------------------------------------

test('flattenAllAces: condition flattens to kind "condition" with scriptName and params', () => {
  const records = flattenAllAces(FIXTURE);
  const rec = findRecord(records, { objectClass: 'Sprite', kind: 'condition', id: 'compare-animation-frame' });
  assert.ok(rec, 'expected a condition record for compare-animation-frame');
  assert.equal(rec.scriptName, 'CompareFrame');
  assert.deepEqual(rec.params, [
    { name: 'comparison', type: 'cmp' },
    { name: 'number', type: 'number' },
  ]);
});

test('flattenAllAces: action flattens to kind "action"', () => {
  const records = flattenAllAces(FIXTURE);
  const rec = findRecord(records, { objectClass: 'Sprite', kind: 'action', id: 'set-animation' });
  assert.ok(rec, 'expected an action record for set-animation');
  assert.equal(rec.kind, 'action');
  assert.equal(rec.scriptName, 'SetAnimation');
  assert.deepEqual(rec.params, [{ name: 'animation', type: 'string' }]);
});

test('flattenAllAces: expression flattens to kind "expression" with scriptName from expressionName', () => {
  const records = flattenAllAces(FIXTURE);
  const rec = findRecord(records, { objectClass: 'Sprite', kind: 'expression', id: 'animationframe' });
  assert.ok(rec, 'expected an expression record for animationframe');
  assert.equal(rec.kind, 'expression');
  assert.equal(rec.scriptName, 'AnimationFrame');
});

test('flattenAllAces: returnType and isTrigger are NOT present on output records', () => {
  const records = flattenAllAces(FIXTURE);
  for (const rec of records) {
    assert.ok(!('returnType' in rec), `unexpected returnType on ${rec.objectClass}/${rec.id}`);
    assert.ok(!('isTrigger' in rec), `unexpected isTrigger on ${rec.objectClass}/${rec.id}`);
  }
});

test('flattenAllAces: every output record has source "builtin"', () => {
  const records = flattenAllAces(FIXTURE);
  assert.ok(records.length > 0, 'expected at least one record');
  for (const rec of records) {
    assert.equal(rec.source, 'builtin', `expected source:"builtin" on ${rec.objectClass}/${rec.id}`);
  }
});

test('flattenAllAces: a plugin spread across multiple categories flattens all entries', () => {
  const records = flattenAllAces(FIXTURE);
  const tilemapRecords = records.filter((r) => r.objectClass === 'Tilemap');
  // Tilemap has 1 action in category "tile" + 1 condition in category "query"
  assert.equal(tilemapRecords.length, 2);
  const action = tilemapRecords.find((r) => r.kind === 'action');
  const condition = tilemapRecords.find((r) => r.kind === 'condition');
  assert.ok(action, 'expected a Tilemap action');
  assert.ok(condition, 'expected a Tilemap condition');
});

test('flattenAllAces: params missing on entry → empty params array', () => {
  const input = {
    System: {
      cat: {
        actions: [{ id: 'wait', scriptName: 'Wait' }], // no params field
      },
    },
  };
  const records = flattenAllAces(input);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].params, []);
});

test('flattenAllAces: missing name field (no scriptName) → scriptName omitted from record', () => {
  const input = {
    Mouse: {
      cat: {
        conditions: [
          {
            id: 'on-click',
            // no scriptName
            params: [],
          },
        ],
      },
    },
  };
  const records = flattenAllAces(input);
  assert.equal(records.length, 1);
  assert.ok(!('scriptName' in records[0]), 'scriptName should be absent when not provided');
});

test('flattenAllAces: missing expressionName → scriptName omitted from expression record', () => {
  const input = {
    System: {
      cat: {
        expressions: [
          {
            id: 'time',
            returnType: 'number',
            params: [],
            // no expressionName
          },
        ],
      },
    },
  };
  const records = flattenAllAces(input);
  assert.equal(records.length, 1);
  assert.ok(!('scriptName' in records[0]), 'scriptName should be absent when expressionName not provided');
});

test('flattenAllAces: malformed top-level input throws a clear Error', () => {
  assert.throws(() => flattenAllAces(null), /flattenAllAces/);
  assert.throws(() => flattenAllAces('string'), /flattenAllAces/);
  assert.throws(() => flattenAllAces([]), /flattenAllAces/);
  assert.throws(() => flattenAllAces(42), /flattenAllAces/);
});

test('flattenAllAces: malformed category value (not an object) is skipped gracefully', () => {
  const input = {
    Sprite: {
      broken: 'not-an-object', // malformed — should be skipped
      valid: {
        actions: [{ id: 'do-thing', scriptName: 'DoThing', params: [] }],
      },
    },
  };
  // should not throw; valid category still produces a record
  const records = flattenAllAces(input);
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'do-thing');
});

test('flattenAllAces: missing bucket in category (no conditions key) is skipped gracefully', () => {
  const input = {
    Sprite: {
      cat: {
        // no conditions — only actions
        actions: [{ id: 'do-thing', scriptName: 'DoThing', params: [] }],
      },
    },
  };
  // should not throw; only the action is produced
  const records = flattenAllAces(input);
  assert.equal(records.length, 1);
  assert.equal(records[0].kind, 'action');
});

test('flattenAllAces: output records have no description or canonicalUrl (merge step adds those)', () => {
  const records = flattenAllAces(FIXTURE);
  for (const rec of records) {
    assert.ok(!('description' in rec), `unexpected description on ${rec.objectClass}/${rec.id}`);
    assert.ok(!('canonicalUrl' in rec), `unexpected canonicalUrl on ${rec.objectClass}/${rec.id}`);
  }
});
