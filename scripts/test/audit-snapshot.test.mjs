import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAuditOutput,
  formatDigest,
  isClean,
  PARSE_FAILED,
  SUMMARY_ANCHOR,
} from '../lib/audit-snapshot.mjs';

// A trimmed but structurally faithful audit report: the Summary anchor plus a
// mix of finding lines. Shapes copied from real audit output.
const WELL_FORMED = `## Audit Results

State: migrated

### Warnings
- broken link -> /knowledge-boundaries.md (wiki/index.md:18)
- broken link -> /doc-inventories.md (wiki/index.md:22)

### Info (optional)
- wiki/doc-inventories.md:210 contains retired token 'genvid-c3'
- wiki/log.md:130 contains retired token 'genvid-c3'
- wiki/log.md:131 contains retired token 'genvid-c3'

### Summary
- required: 35 of 35 satisfied.
- optional: 72 of 84 satisfied.
- scanned 17 file(s) under wiki/, CLAUDE.md
`;

test('a well-formed report yields the four counts', () => {
  const d = parseAuditOutput(WELL_FORMED, 0);
  assert.equal(d.intact, true);
  assert.equal(d.brokenLink, 2);
  assert.equal(d.retiredToken, 3);
  assert.equal(d.orphanedDoc, 0);
  assert.equal(d.exit, 0);
  assert.equal(isClean(d), true);
});

// THE test that matters. A kind with genuinely zero findings and a report that
// could not be parsed at all must NOT look alike — conflating them is how a
// broken parser reports a perfectly clean repo.
test('a real zero and an unparseable report are distinguishable, not both 0', () => {
  // orphanedDoc is genuinely 0 in WELL_FORMED: the report is intact, the kind
  // simply has no findings.
  const real = parseAuditOutput(WELL_FORMED, 0);
  assert.equal(real.intact, true);
  assert.equal(real.orphanedDoc, 0, 'a real zero stays 0');

  // Same absence of orphan lines, but no Summary anchor -> the report is not
  // trustworthy, so the count is unknown rather than zero.
  const broken = parseAuditOutput('some unrelated output\nno summary here\n', 0);
  assert.equal(broken.intact, false);
  assert.equal(broken.orphanedDoc, PARSE_FAILED, 'an unparseable report is NOT 0');

  assert.notEqual(real.orphanedDoc, broken.orphanedDoc);
  assert.equal(isClean(real), true);
  assert.equal(isClean(broken), false);
});

test('a drifted report format surfaces as PARSE-FAILED, not as zeros', () => {
  // The finding lines are still present and countable, but the Summary anchor
  // has been renamed. Counting anyway would produce numbers that look
  // authoritative from a report we cannot vouch for.
  const drifted = WELL_FORMED.replace(
    '- required: 35 of 35 satisfied.',
    '- mandatory: 35 of 35 met.',
  );
  const d = parseAuditOutput(drifted, 0);

  assert.equal(d.intact, false);
  assert.equal(d.brokenLink, PARSE_FAILED);
  assert.equal(d.retiredToken, PARSE_FAILED);
  assert.equal(d.orphanedDoc, PARSE_FAILED);
  assert.equal(isClean(d), false);

  const out = formatDigest(d);
  assert.match(out, /^broken-link: PARSE-FAILED$/m);

  // Every COUNT must be PARSE-FAILED. `exit:` is deliberately excluded: it
  // comes from the process status, not from parsing the report text, so it
  // stays legitimately knowable even when the body is gibberish. Asserting
  // over it too would demand the code discard a fact it actually has.
  const countLines = out.split('\n').filter((l) => !l.startsWith('exit:'));
  assert.equal(countLines.length, 3);
  assert.ok(
    countLines.every((l) => l.endsWith('PARSE-FAILED')),
    `no count may render as a number from a drifted report, got: ${countLines.join(' | ')}`,
  );
});

test('empty output is unparseable rather than an all-zero clean run', () => {
  const d = parseAuditOutput('', 0);
  assert.equal(d.intact, false);
  assert.equal(d.brokenLink, PARSE_FAILED);
  assert.equal(isClean(d), false);
});

test("the audit's exit code is reported, not swallowed, including nonzero", () => {
  assert.equal(parseAuditOutput(WELL_FORMED, 0).exit, 0);
  assert.equal(parseAuditOutput(WELL_FORMED, 1).exit, 1);
  // A missing/!integer status is unknown, not 0.
  assert.equal(parseAuditOutput(WELL_FORMED, null).exit, PARSE_FAILED);
});

test('formatDigest emits exactly the four canonical lines in order', () => {
  const out = formatDigest(parseAuditOutput(WELL_FORMED, 0));
  assert.deepEqual(out.split('\n'), [
    'broken-link: 2',
    'retired-token: 3',
    'orphaned-doc: 0',
    'exit: 0',
  ]);
});

test('the Summary anchor matches real audit output and not near-misses', () => {
  // Positive control: this exact line shape is what the live audit prints.
  assert.ok(SUMMARY_ANCHOR.test('- required: 35 of 35 satisfied.'));
  // Must be anchored at line start, so a quotation of it inside prose does not
  // count as a report.
  assert.ok(!SUMMARY_ANCHOR.test('see "- required: 35 of 35 satisfied." above'));
  assert.ok(!SUMMARY_ANCHOR.test('- required: some of them satisfied.'));
});
