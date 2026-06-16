// node --test merge.test.mjs
// Unit tests for the merge lib used by the build-reference skill.
// Verifies that CDN ACE records and manual-PDF description records are joined
// correctly via normalized name matching (tier-1 exact and tier-2 token-subset)
// and that the coverage report is accurate.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalize, tokenize, joinDescriptions } from '../lib/merge.mjs';

// ---- normalize unit cases ---------------------------------------------------

test('normalize: lowercases and strips non-alphanumeric characters', () => {
  assert.equal(normalize('Compare frame'), 'compareframe');
  assert.equal(normalize('CompareFrame'), 'compareframe');
  assert.equal(normalize('Is playing'), 'isplaying');
  assert.equal(normalize('IsAnimPlaying'), 'isanimplaying');
  assert.equal(normalize('set-animation'), 'setanimation');
  assert.equal(normalize(''), '');
  assert.equal(normalize('ABC 123!'), 'abc123');
});

// ---- tokenize unit cases ----------------------------------------------------

test('tokenize: splits camelCase "IsAnimPlaying" into is/anim/playing', () => {
  assert.deepEqual(tokenize('IsAnimPlaying'), ['is', 'anim', 'playing']);
});

test('tokenize: splits PascalCase "CompareFrame" into compare/frame', () => {
  assert.deepEqual(tokenize('CompareFrame'), ['compare', 'frame']);
});

test('tokenize: splits spaced "Is playing" into is/playing', () => {
  assert.deepEqual(tokenize('Is playing'), ['is', 'playing']);
});

test('tokenize: splits spaced "Compare frame" into compare/frame', () => {
  assert.deepEqual(tokenize('Compare frame'), ['compare', 'frame']);
});

test('tokenize: hyphenated "set-animation" → set/animation', () => {
  assert.deepEqual(tokenize('set-animation'), ['set', 'animation']);
});

test('tokenize: uppercase run "ABCDef" → abc/def', () => {
  assert.deepEqual(tokenize('ABCDef'), ['abc', 'def']);
});

test('tokenize: single word "Playing" → ["playing"]', () => {
  assert.deepEqual(tokenize('Playing'), ['playing']);
});

test('tokenize: empty string → []', () => {
  assert.deepEqual(tokenize(''), []);
});

// ---- joinDescriptions: tier-1 exact match -----------------------------------

test('tier-1: CDN CompareFrame (Sprite, condition) matches manual "Compare frame"', () => {
  const cdnAces = [
    {
      source: 'builtin',
      objectClass: 'Sprite',
      kind: 'condition',
      id: 'compare-animation-frame',
      scriptName: 'CompareFrame',
      params: [{ name: 'comparison', type: 'cmp' }],
    },
  ];
  const descriptions = [
    {
      objectClass: 'Sprite',
      kind: 'condition',
      name: 'Compare frame',
      description: 'Compare the current animation frame.',
      canonicalUrl: 'https://www.construct.net/en/make-games/manuals/construct-3/plugin-reference/sprite',
    },
  ];

  const { aces, coverage } = joinDescriptions(cdnAces, descriptions);

  assert.equal(aces.length, 1);
  assert.equal(aces[0].description, 'Compare the current animation frame.');
  assert.equal(aces[0].canonicalUrl, 'https://www.construct.net/en/make-games/manuals/construct-3/plugin-reference/sprite');
  assert.equal(coverage.matched, 1);
  assert.equal(coverage.tier1, 1);
  assert.equal(coverage.tier2, 0);
});

// ---- joinDescriptions: tier-2 token-subset match ----------------------------

test('tier-2: CDN IsAnimPlaying (Sprite, condition) matches manual "Is playing" via token subset', () => {
  const cdnAces = [
    {
      source: 'builtin',
      objectClass: 'Sprite',
      kind: 'condition',
      id: 'is-anim-playing',
      scriptName: 'IsAnimPlaying',
      params: [],
    },
  ];
  const descriptions = [
    {
      objectClass: 'Sprite',
      kind: 'condition',
      name: 'Is playing',
      description: 'Check if an animation is currently playing.',
    },
  ];

  const { aces, coverage } = joinDescriptions(cdnAces, descriptions);

  assert.equal(aces.length, 1);
  assert.equal(aces[0].description, 'Check if an animation is currently playing.');
  assert.equal(coverage.matched, 1);
  assert.equal(coverage.tier1, 0);
  assert.equal(coverage.tier2, 1);
});

// ---- joinDescriptions: alias map --------------------------------------------

test('alias map: CDN objectClass "TiledBg" joins manual entry with objectClass "tiled-background"', () => {
  const aliasMap = { TiledBg: 'tiled-background' };
  const cdnAces = [
    {
      source: 'builtin',
      objectClass: 'TiledBg',
      kind: 'action',
      id: 'set-offset',
      scriptName: 'SetOffset',
      params: [],
    },
  ];
  const descriptions = [
    {
      objectClass: 'tiled-background',
      kind: 'action',
      name: 'Set offset',
      description: 'Set the scroll offset of the tiled background.',
    },
  ];

  const { aces, coverage } = joinDescriptions(cdnAces, descriptions, aliasMap);

  assert.equal(aces.length, 1);
  assert.equal(aces[0].description, 'Set the scroll offset of the tiled background.');
  // Output objectClass must stay as the CDN key verbatim
  assert.equal(aces[0].objectClass, 'TiledBg');
  assert.equal(coverage.matched, 1);
});

test('alias map: CDN objectClass "system" (lowercased) joins manual entry with objectClass "System"', () => {
  const aliasMap = { system: 'System' };
  const cdnAces = [
    {
      source: 'builtin',
      objectClass: 'system',
      kind: 'action',
      id: 'wait',
      scriptName: 'Wait',
      params: [{ name: 'seconds', type: 'number' }],
    },
  ];
  const descriptions = [
    {
      objectClass: 'System',
      kind: 'action',
      name: 'Wait',
      description: 'Wait for a number of seconds.',
    },
  ];

  const { aces, coverage } = joinDescriptions(cdnAces, descriptions, aliasMap);

  assert.equal(aces.length, 1);
  assert.equal(aces[0].description, 'Wait for a number of seconds.');
  assert.equal(aces[0].objectClass, 'system'); // CDN key preserved
  assert.equal(coverage.matched, 1);
});

// ---- joinDescriptions: kind mismatch does NOT join --------------------------

test('kind mismatch: same normalized name but different kind → no join', () => {
  const cdnAces = [
    {
      source: 'builtin',
      objectClass: 'Sprite',
      kind: 'action', // action
      id: 'play',
      scriptName: 'Play',
      params: [],
    },
  ];
  const descriptions = [
    {
      objectClass: 'Sprite',
      kind: 'condition', // condition — different kind
      name: 'Play',
      description: 'Should not match.',
    },
  ];

  const { aces, coverage } = joinDescriptions(cdnAces, descriptions);

  assert.equal(aces.length, 1);
  assert.ok(!('description' in aces[0]), 'description should NOT be joined on kind mismatch');
  assert.equal(coverage.matched, 0);
  assert.equal(coverage.unmatched, 1);
});

// ---- joinDescriptions: no match → ace emitted unchanged --------------------

test('no match: ace emitted unchanged when no description matches', () => {
  const cdnAces = [
    {
      source: 'builtin',
      objectClass: 'Sprite',
      kind: 'action',
      id: 'set-animation',
      scriptName: 'SetAnimation',
      params: [{ name: 'anim', type: 'string' }],
    },
  ];
  const descriptions = [
    {
      objectClass: 'Sprite',
      kind: 'action',
      name: 'Completely unrelated name',
      description: 'No match here.',
    },
  ];

  const { aces, coverage } = joinDescriptions(cdnAces, descriptions);

  assert.equal(aces.length, 1);
  assert.ok(!('description' in aces[0]), 'description should be absent when unmatched');
  assert.equal(aces[0].scriptName, 'SetAnimation'); // other fields intact
  assert.equal(coverage.matched, 0);
  assert.equal(coverage.unmatched, 1);
});

// ---- joinDescriptions: no scriptName → ace unchanged, counted unmatched ----

test('no scriptName: ace emitted unchanged and counted as unmatched', () => {
  const cdnAces = [
    {
      source: 'builtin',
      objectClass: 'Mouse',
      kind: 'condition',
      id: 'on-click',
      // no scriptName
      params: [],
    },
  ];
  const descriptions = [
    {
      objectClass: 'Mouse',
      kind: 'condition',
      name: 'On click',
      description: 'On click description.',
    },
  ];

  const { aces, coverage } = joinDescriptions(cdnAces, descriptions);

  assert.equal(aces.length, 1);
  assert.ok(!('scriptName' in aces[0]), 'scriptName should remain absent');
  assert.ok(!('description' in aces[0]), 'description should not be added');
  assert.equal(coverage.matched, 0);
  assert.equal(coverage.unmatched, 1);
});

// ---- joinDescriptions: inputs not mutated -----------------------------------

test('inputs not mutated: original cdnAces objects are unchanged after join', () => {
  const ace = {
    source: 'builtin',
    objectClass: 'Sprite',
    kind: 'condition',
    id: 'compare-animation-frame',
    scriptName: 'CompareFrame',
    params: [{ name: 'n', type: 'number' }],
  };
  const cdnAces = [ace];
  const origAceCopy = JSON.parse(JSON.stringify(ace));

  const descriptions = [
    {
      objectClass: 'Sprite',
      kind: 'condition',
      name: 'Compare frame',
      description: 'Should be joined.',
    },
  ];

  const { aces } = joinDescriptions(cdnAces, descriptions);

  // The returned record has the description
  assert.equal(aces[0].description, 'Should be joined.');
  // But the original object is unmodified
  assert.deepEqual(ace, origAceCopy);
  // And it is a different object reference
  assert.notEqual(aces[0], ace);
});

test('inputs not mutated: original descriptions array objects are unchanged', () => {
  const desc = {
    objectClass: 'Sprite',
    kind: 'condition',
    name: 'Compare frame',
    description: 'Desc text.',
    canonicalUrl: 'https://example.com',
  };
  const descriptions = [desc];
  const origDescCopy = JSON.parse(JSON.stringify(desc));

  const cdnAces = [
    {
      source: 'builtin',
      objectClass: 'Sprite',
      kind: 'condition',
      id: 'compare-animation-frame',
      scriptName: 'CompareFrame',
      params: [],
    },
  ];

  joinDescriptions(cdnAces, descriptions);

  assert.deepEqual(desc, origDescCopy);
});

// ---- joinDescriptions: coverage numbers are internally consistent -----------

test('coverage: matched + unmatched === total', () => {
  const cdnAces = [
    { source: 'builtin', objectClass: 'Sprite', kind: 'condition', id: 'c1', scriptName: 'CompareFrame', params: [] },
    { source: 'builtin', objectClass: 'Sprite', kind: 'action', id: 'a1', scriptName: 'SetAnimation', params: [] },
    { source: 'builtin', objectClass: 'Sprite', kind: 'condition', id: 'c2', scriptName: 'IsAnimPlaying', params: [] },
    { source: 'builtin', objectClass: 'Mouse', kind: 'condition', id: 'm1', /* no scriptName */ params: [] },
    { source: 'builtin', objectClass: 'Mouse', kind: 'condition', id: 'm2', scriptName: 'NoMatchHere', params: [] },
  ];
  const descriptions = [
    { objectClass: 'Sprite', kind: 'condition', name: 'Compare frame', description: 'D1' },
    { objectClass: 'Sprite', kind: 'condition', name: 'Is playing', description: 'D2' }, // tier-2
  ];

  const { coverage } = joinDescriptions(cdnAces, descriptions);

  assert.equal(coverage.matched + coverage.unmatched, coverage.total);
  assert.equal(coverage.total, 5);
  assert.equal(coverage.matched, 2); // c1 (tier1) + c2 (tier2)
  assert.equal(coverage.unmatched, 3); // a1 (no desc), m1 (no scriptName), m2 (no match)
});

test('coverage: byObjectClass totals sum to overall total', () => {
  const cdnAces = [
    { source: 'builtin', objectClass: 'Sprite', kind: 'condition', id: 'c1', scriptName: 'CompareFrame', params: [] },
    { source: 'builtin', objectClass: 'Sprite', kind: 'action', id: 'a1', scriptName: 'SetAnimation', params: [] },
    { source: 'builtin', objectClass: 'Tilemap', kind: 'action', id: 't1', scriptName: 'SetTile', params: [] },
  ];
  const descriptions = [
    { objectClass: 'Sprite', kind: 'condition', name: 'Compare frame', description: 'D1' },
  ];

  const { coverage } = joinDescriptions(cdnAces, descriptions);

  const byClassTotal = Object.values(coverage.byObjectClass).reduce((s, v) => s + v.total, 0);
  assert.equal(byClassTotal, coverage.total);

  // Sprite: 2 total, 1 matched (CompareFrame)
  assert.equal(coverage.byObjectClass['Sprite'].total, 2);
  assert.equal(coverage.byObjectClass['Sprite'].matched, 1);
  // Tilemap: 1 total, 0 matched
  assert.equal(coverage.byObjectClass['Tilemap'].total, 1);
  assert.equal(coverage.byObjectClass['Tilemap'].matched, 0);
});

// ---- joinDescriptions: edge cases -------------------------------------------

test('empty cdnAces → empty aces, zero coverage', () => {
  const { aces, coverage } = joinDescriptions([], []);
  assert.deepEqual(aces, []);
  assert.equal(coverage.total, 0);
  assert.equal(coverage.matched, 0);
  assert.equal(coverage.unmatched, 0);
  assert.deepEqual(coverage.byObjectClass, {});
});

test('empty descriptions → all aces unmatched', () => {
  const cdnAces = [
    { source: 'builtin', objectClass: 'Sprite', kind: 'action', id: 'set-anim', scriptName: 'SetAnimation', params: [] },
  ];
  const { aces, coverage } = joinDescriptions(cdnAces, []);
  assert.equal(aces.length, 1);
  assert.ok(!('description' in aces[0]));
  assert.equal(coverage.matched, 0);
  assert.equal(coverage.unmatched, 1);
});

test('aliasMap defaults to {} when omitted → no alias bridging', () => {
  // Without aliasMap, CDN key "TiledBg" does NOT match manual "tiled-background"
  const cdnAces = [
    { source: 'builtin', objectClass: 'TiledBg', kind: 'action', id: 'set-offset', scriptName: 'SetOffset', params: [] },
  ];
  const descriptions = [
    { objectClass: 'tiled-background', kind: 'action', name: 'Set offset', description: 'Should not match without alias.' },
  ];
  // No aliasMap passed
  const { coverage } = joinDescriptions(cdnAces, descriptions);
  assert.equal(coverage.matched, 0);
});

test('canonicalUrl from manual is carried only when ace does not already have one', () => {
  const cdnAces = [
    // ACE without canonicalUrl
    { source: 'builtin', objectClass: 'Sprite', kind: 'action', id: 'a1', scriptName: 'SetAnimation', params: [] },
    // ACE that already has canonicalUrl — should not be overwritten
    { source: 'builtin', objectClass: 'Sprite', kind: 'action', id: 'a2', scriptName: 'SetAngle', canonicalUrl: 'https://existing.example.com', params: [] },
  ];
  const descriptions = [
    { objectClass: 'Sprite', kind: 'action', name: 'Set animation', description: 'D1', canonicalUrl: 'https://manual.example.com/setanim' },
    { objectClass: 'Sprite', kind: 'action', name: 'Set angle', description: 'D2', canonicalUrl: 'https://manual.example.com/setangle' },
  ];

  const { aces } = joinDescriptions(cdnAces, descriptions);

  // a1: no existing canonicalUrl → manual's is added
  assert.equal(aces[0].canonicalUrl, 'https://manual.example.com/setanim');
  // a2: existing canonicalUrl → preserved, not overwritten
  assert.equal(aces[1].canonicalUrl, 'https://existing.example.com');
});

test('tier-2 tie-break: candidate with more tokens wins', () => {
  // ace: "IsAnimPlaying" → tokens: {is, anim, playing}
  // desc A: "Is playing" → tokens {is, playing} — subset of ace tokens ✓
  // desc B: "Is anim" → tokens {is, anim} — also a subset ✓
  // Tie-break: desc A has 2 tokens, desc B has 2 tokens → equal count.
  // Lexical tie-break: "Is anim" < "Is playing" alphabetically → "Is anim" wins.
  //
  // Use a different scenario to test the MOST-TOKENS rule clearly:
  // ace: "IsAnimPlaying" → {is, anim, playing}
  // desc A: "Is playing" → {is, playing} (2 tokens, both in ace set)
  // desc B: "Is anim playing" → {is, anim, playing} (3 tokens, all in ace set) → wins
  // Note: normalize("Is anim playing") = "isanimplaying" ≠ normalize("IsAnimPlaying") = "isanimplaying"
  // Actually those ARE equal — so desc B would match tier 1 first, not tier 2.
  // Design a case where NEITHER desc matches tier-1 but both match tier-2:
  // ace: "IsAnimCurrentlyPlaying" → normalize = "isanimcurrentlyplaying"
  // desc A: "Is playing"       → normalize = "isplaying" — no tier-1 match
  // desc B: "Is anim playing"  → normalize = "isanimplaying" — no tier-1 match
  // tokens(ace) = {is, anim, currently, playing}
  // tokens(desc A) = {is, playing} — subset ✓
  // tokens(desc B) = {is, anim, playing} — subset ✓ (3 tokens > 2 tokens → wins)
  const cdnAces = [
    { source: 'builtin', objectClass: 'Sprite', kind: 'condition', id: 'is-anim-currently-playing', scriptName: 'IsAnimCurrentlyPlaying', params: [] },
  ];
  const descriptions = [
    { objectClass: 'Sprite', kind: 'condition', name: 'Is playing', description: 'Short match — 2 tokens.' },
    { objectClass: 'Sprite', kind: 'condition', name: 'Is anim playing', description: 'Longer match — 3 tokens — wins.' },
  ];

  const { aces, coverage } = joinDescriptions(cdnAces, descriptions);

  assert.equal(coverage.matched, 1);
  assert.equal(coverage.tier2, 1);
  assert.equal(aces[0].description, 'Longer match — 3 tokens — wins.');
});
