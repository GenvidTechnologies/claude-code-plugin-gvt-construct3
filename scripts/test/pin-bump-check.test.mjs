// Tests for scripts/lib/pin-bump-check.mjs. The load-bearing ones are the
// anti-fake-pass cases: an unreadable side, an empty corpus, or an unresolved
// range must come back as 'error', never as identical/pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseReviewedBaseline,
  compareBytes,
  compareFileSets,
  evaluateRange,
  normalizeNpmViewVersions,
  diffPackageFields,
  mcpUtilsRange,
  sweepPinSites,
  formatReport,
  exitCodeFor,
} from '../lib/pin-bump-check.mjs';

const ok = (...b) => ({ ok: true, bytes: Uint8Array.from(b) });
const bytes = (...b) => Uint8Array.from(b);

// --- parseReviewedBaseline

test('parseReviewedBaseline: real audit.mjs, semver-sorted', () => {
  const text = readFileSync(
    new URL('../../plugin/skills/audit-c3-conventions/scripts/lib/audit.mjs', import.meta.url),
    'utf8',
  );
  assert.deepEqual(parseReviewedBaseline(text), ['0.5.1', '0.7.0', '0.8.0', '0.10.0']);
});

test('parseReviewedBaseline: sorts by semver not lexically', () => {
  assert.deepEqual(parseReviewedBaseline('// Reviewed baseline: {0.10.0, 0.9.0}. more'), [
    '0.9.0',
    '0.10.0',
  ]);
});

test('parseReviewedBaseline: missing line throws', () => {
  assert.throws(() => parseReviewedBaseline('nothing here'), /no "\/\/ Reviewed baseline/);
});

test('parseReviewedBaseline: duplicate line throws', () => {
  const t = '// Reviewed baseline: {1.0.0}.\n// Reviewed baseline: {1.0.0}.\n';
  assert.throws(() => parseReviewedBaseline(t), /exactly one/);
});

test('parseReviewedBaseline: malformed member throws', () => {
  assert.throws(() => parseReviewedBaseline('// Reviewed baseline: {0.5, 0.7.0}.'), /not x\.y\.z/);
  assert.throws(() => parseReviewedBaseline('// Reviewed baseline: {}.'), /not x\.y\.z/);
});

// --- compareBytes

test('compareBytes: equal bytes are identical', () => {
  assert.equal(compareBytes(ok(1, 2, 3), ok(1, 2, 3)).verdict, 'identical');
});

test('compareBytes: unequal bytes are different', () => {
  assert.equal(compareBytes(ok(1, 2, 3), ok(1, 2, 4)).verdict, 'different');
  assert.equal(compareBytes(ok(1, 2), ok(1, 2, 3)).verdict, 'different');
});

test('compareBytes: error on the old side is error, not identical', () => {
  const r = compareBytes({ ok: false, error: 'ENOENT' }, ok(1));
  assert.equal(r.verdict, 'error');
  assert.match(r.detail, /ENOENT/);
});

test('compareBytes: error on the new side is error, not identical', () => {
  assert.equal(compareBytes(ok(1), { ok: false, error: 'boom' }).verdict, 'error');
});

test('compareBytes: both sides in error is error', () => {
  const e = { ok: false, error: 'x' };
  assert.equal(compareBytes(e, e).verdict, 'error');
});

// --- compareFileSets

test('compareFileSets: identical sets', () => {
  const r = compareFileSets(
    new Map([['a.js', bytes(1)], ['b.js', bytes(2)]]),
    new Map([['b.js', bytes(2)], ['a.js', bytes(1)]]),
  );
  assert.equal(r.verdict, 'identical');
  assert.deepEqual(r.compared, { old: 2, new: 2 });
  assert.deepEqual(r.identical, ['a.js', 'b.js']);
});

test('compareFileSets: a changed file is different', () => {
  const r = compareFileSets(
    new Map([['a.js', bytes(1)], ['b.js', bytes(2)]]),
    new Map([['a.js', bytes(1)], ['b.js', bytes(9)]]),
  );
  assert.equal(r.verdict, 'different');
  assert.deepEqual(r.different, ['b.js']);
  assert.deepEqual(r.identical, ['a.js']);
});

test('compareFileSets: only-old and only-new are reported and sorted', () => {
  const r = compareFileSets(
    new Map([['z.js', bytes(1)], ['a.js', bytes(1)], ['k.js', bytes(1)]]),
    new Map([['k.js', bytes(1)], ['n2.js', bytes(1)], ['n1.js', bytes(1)]]),
  );
  assert.equal(r.verdict, 'different');
  assert.deepEqual(r.onlyOld, ['a.js', 'z.js']);
  assert.deepEqual(r.onlyNew, ['n1.js', 'n2.js']);
});

test('compareFileSets: empty side is error, even when both are empty', () => {
  assert.equal(compareFileSets(new Map(), new Map([['a', bytes(1)]])).verdict, 'error');
  assert.equal(compareFileSets(new Map([['a', bytes(1)]]), new Map()).verdict, 'error');
  assert.equal(compareFileSets(new Map(), new Map()).verdict, 'error');
});

test('compareFileSets: accepts plain objects', () => {
  assert.equal(compareFileSets({ a: bytes(1) }, { a: bytes(1) }).verdict, 'identical');
});

// --- evaluateRange

test('evaluateRange: all in baseline passes', () => {
  const r = evaluateRange({
    range: '^0.7.0',
    resolvable: ['0.7.0', '0.8.0'],
    baseline: ['0.5.1', '0.7.0', '0.8.0'],
  });
  assert.equal(r.verdict, 'pass');
  assert.deepEqual(r.outside, []);
});

test('evaluateRange: one outside fails with the escalation message', () => {
  const r = evaluateRange({
    range: '^0.7.0',
    resolvable: ['0.7.0', '0.9.0'],
    baseline: ['0.5.1', '0.7.0', '0.8.0'],
  });
  assert.equal(r.verdict, 'fail');
  assert.deepEqual(r.outside, ['0.9.0']);
  assert.ok(r.message.includes('FAILS procedurally — escalate per ADR 0009'));
});

test('evaluateRange: empty or absent resolvable is error', () => {
  assert.equal(evaluateRange({ range: '^1', resolvable: [], baseline: ['1.0.0'] }).verdict, 'error');
  assert.equal(evaluateRange({ range: '^1', baseline: ['1.0.0'] }).verdict, 'error');
});

// --- normalizeNpmViewVersions

test('normalizeNpmViewVersions: single string', () => {
  assert.deepEqual(normalizeNpmViewVersions('"0.10.0"\n'), ['0.10.0']);
});

test('normalizeNpmViewVersions: array', () => {
  assert.deepEqual(normalizeNpmViewVersions('["0.8.0","0.10.0"]'), ['0.8.0', '0.10.0']);
});

test('normalizeNpmViewVersions: empty or whitespace is []', () => {
  assert.deepEqual(normalizeNpmViewVersions(''), []);
  assert.deepEqual(normalizeNpmViewVersions('  \n'), []);
});

test('normalizeNpmViewVersions: garbage and wrong shapes throw', () => {
  assert.throws(() => normalizeNpmViewVersions('not json'), /not JSON/);
  assert.throws(() => normalizeNpmViewVersions('{"a":1}'), /neither/);
  assert.throws(() => normalizeNpmViewVersions('[1,2]'), /neither/);
  assert.throws(() => normalizeNpmViewVersions('42'), /neither/);
});

// --- diffPackageFields / mcpUtilsRange

test('diffPackageFields: reports changed fields only, ignoring key order', () => {
  const oldPkg = { dependencies: { a: '1', b: '2' }, bin: { x: 'x.js' }, name: 'p' };
  const newPkg = { dependencies: { b: '2', a: '1' }, bin: { x: 'y.js' }, name: 'q' };
  const d = diffPackageFields(oldPkg, newPkg);
  assert.deepEqual(d, [{ field: 'bin', old: { x: 'x.js' }, new: { x: 'y.js' } }]);
});

test('diffPackageFields: added and removed fields differ; identical is empty', () => {
  assert.equal(diffPackageFields({ main: 'a' }, { main: 'a' }).length, 0);
  assert.deepEqual(
    diffPackageFields({}, { engines: { node: '>=20' } }).map((x) => x.field),
    ['engines'],
  );
});

test('diffPackageFields: honours a custom field list', () => {
  assert.equal(diffPackageFields({ name: 'a' }, { name: 'b' }, ['name']).length, 1);
});

test('mcpUtilsRange: present and absent', () => {
  assert.equal(mcpUtilsRange({ dependencies: { '@genvidtech/mcp-utils': '^0.7.0' } }), '^0.7.0');
  assert.equal(mcpUtilsRange({ dependencies: {} }), undefined);
  assert.equal(mcpUtilsRange({}), undefined);
});

// --- sweepPinSites

test('sweepPinSites: matches the token in the documented shapes', () => {
  const files = [
    {
      path: 'a.md',
      text: [
        'plain @0.11.1 here',
        'code `@0.11.1` here',
        '"pkg@0.11.1"',
        'ends 0.11.1;',
        'sentence ends 0.11.1.',
      ].join('\n'),
    },
  ];
  assert.deepEqual(
    sweepPinSites(files, '0.11.1').map((h) => h.line),
    [1, 2, 3, 4, 5],
  );
});

test('sweepPinSites: does not match longer versions', () => {
  const files = [{ path: 'a', text: '10.11.1\n0.11.10\n0.11.1.2\n1.0.11.1' }];
  assert.deepEqual(sweepPinSites(files, '0.11.1'), []);
});

test('sweepPinSites: orders by path then line, no classification', () => {
  const files = [
    { path: 'b.md', text: 'x\n0.1.0' },
    { path: 'a.md', text: '0.1.0\n\n0.1.0' },
  ];
  const hits = sweepPinSites(files, '0.1.0');
  assert.deepEqual(
    hits.map((h) => `${h.path}:${h.line}`),
    ['a.md:1', 'a.md:3', 'b.md:2'],
  );
  assert.deepEqual(Object.keys(hits[0]).sort(), ['line', 'path', 'text']);
});

test('sweepPinSites: handles CRLF', () => {
  const hits = sweepPinSites([{ path: 'a', text: 'x\r\n@0.1.0\r\n' }], '0.1.0');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].text, '@0.1.0');
});

// --- exitCodeFor / formatReport

test('exitCodeFor: 0 only when every check is good', () => {
  const c = (verdict) => ({ name: 'n', verdict });
  assert.equal(exitCodeFor({ checks: [c('pass'), c('identical'), c('not-applicable')] }), 0);
  assert.equal(exitCodeFor({ checks: [c('pass'), c('different')] }), 1);
  assert.equal(exitCodeFor({ checks: [c('pass'), c('fail')] }), 1);
  assert.equal(exitCodeFor({ checks: [c('pass'), c('error')] }), 1);
});

test('exitCodeFor: no checks is not a pass', () => {
  assert.equal(exitCodeFor({ checks: [] }), 1);
  assert.equal(exitCodeFor({}), 1);
});

test('formatReport: prints the corpus and differing files', () => {
  const fileSet = compareFileSets(
    new Map([['a.js', bytes(1)], ['b.js', bytes(2)]]),
    new Map([['a.js', bytes(1)], ['b.js', bytes(3)]]),
  );
  const text = formatReport({ checks: [{ name: 'dist', verdict: fileSet.verdict, fileSet }] }).join('\n');
  assert.match(text, /corpus: 2 file\(s\) old, 2 file\(s\) new/);
  assert.match(text, /differs: b\.js/);
  assert.match(text, /overall: NOT OK/);
});

test('formatReport: an error verdict never reads as identical or PASS', () => {
  const fileSet = compareFileSets(new Map(), new Map([['a', bytes(1)]]));
  const text = formatReport({ checks: [{ name: 'dist', verdict: fileSet.verdict, fileSet }] }).join('\n');
  assert.match(text, /\[ERROR\] dist/);
  assert.match(text, /corpus: 0 file\(s\) old, 1 file\(s\) new/);
  assert.doesNotMatch(text, /identical|pass|overall: OK/i);
});

test('formatReport: all-good result reports OK', () => {
  const text = formatReport({ checks: [{ name: 'range', verdict: 'pass', message: 'fine' }] }).join('\n');
  assert.match(text, /\[PASS\] range - fine/);
  assert.match(text, /overall: OK/);
});
