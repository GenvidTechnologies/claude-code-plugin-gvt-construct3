import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKTREE,
  DEFAULT_BEFORE,
  DEFAULT_AFTER,
  parseArgs,
  normalise,
  combinedOutput,
  fixtureVerdict,
  evaluateControl,
  computeExitCode,
  formatReport,
} from '../lib/audit-diff.mjs';

// ---------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------

test('parseArgs: no arguments uses the documented defaults', () => {
  const args = parseArgs([]);
  assert.deepEqual(args, { before: DEFAULT_BEFORE, after: DEFAULT_AFTER, keep: false });
  assert.equal(DEFAULT_BEFORE, 'origin/main');
  assert.equal(DEFAULT_AFTER, WORKTREE);
});

test('parseArgs: one positional sets before, after stays default', () => {
  const args = parseArgs(['v3.0.0']);
  assert.deepEqual(args, { before: 'v3.0.0', after: DEFAULT_AFTER, keep: false });
});

test('parseArgs: two positionals set before and after', () => {
  const args = parseArgs(['v3.0.0', 'HEAD']);
  assert.deepEqual(args, { before: 'v3.0.0', after: 'HEAD', keep: false });
});

test('parseArgs: WORKTREE sentinel is accepted on either side', () => {
  assert.deepEqual(parseArgs([WORKTREE, WORKTREE]), {
    before: WORKTREE,
    after: WORKTREE,
    keep: false,
  });
});

test('parseArgs: --keep is recognised anywhere in argv and defaults elsewhere', () => {
  assert.deepEqual(parseArgs(['--keep']), { before: DEFAULT_BEFORE, after: DEFAULT_AFTER, keep: true });
  assert.deepEqual(parseArgs(['v1', '--keep', 'v2']), { before: 'v1', after: 'v2', keep: true });
});

test('parseArgs: throws on more than two positional arguments', () => {
  assert.throws(() => parseArgs(['a', 'b', 'c']), /too many arguments/);
});

test('parseArgs: throws on an unrecognised flag, including --help', () => {
  assert.throws(() => parseArgs(['--help']), /unknown flag "--help"/);
  assert.throws(() => parseArgs(['--bogus']), /unknown flag "--bogus"/);
});

test('parseArgs: throws on an empty ref string', () => {
  assert.throws(() => parseArgs(['']), /before ref must not be empty/);
  assert.throws(() => parseArgs(['v1', '  ']), /after ref must not be empty/);
});

// ---------------------------------------------------------------------
// normalise — R5
// ---------------------------------------------------------------------

test('normalise: (node:NNNN) becomes (node:PID)', () => {
  const text = '(node:62908) [DEP0190] DeprecationWarning: …';
  assert.equal(normalise(text), '(node:PID) [DEP0190] DeprecationWarning: …');
});

test('normalise: a different PID normalises to the same text', () => {
  const a = normalise('(node:62908) [DEP0190] DeprecationWarning: x');
  const b = normalise('(node:4102) [DEP0190] DeprecationWarning: x');
  assert.equal(a, b);
});

test('normalise: CRLF becomes LF', () => {
  assert.equal(normalise('a\r\nb\r\n'), 'a\nb\n');
});

test('normalise: null/undefined text is treated as empty', () => {
  assert.equal(normalise(undefined), '');
  assert.equal(normalise(null), '');
});

test('fixtureVerdict: outputs that differ only in their stderr PID compare as identical — R5', () => {
  const before = {
    status: 0,
    stdout: '## gvt-construct3 Audit Results\n',
    stderr: '(node:62908) [DEP0190] DeprecationWarning: x\n',
  };
  const after = {
    status: 0,
    stdout: '## gvt-construct3 Audit Results\n',
    stderr: '(node:4102) [DEP0190] DeprecationWarning: x\n',
  };
  assert.deepEqual(fixtureVerdict(before, after), { verdict: 'identical' });
});

test('fixtureVerdict: a genuine stdout difference is reported as different', () => {
  const before = { status: 0, stdout: 'a', stderr: '' };
  const after = { status: 0, stdout: 'b', stderr: '' };
  assert.deepEqual(fixtureVerdict(before, after), { verdict: 'different' });
});

// ---------------------------------------------------------------------
// control check — R6
// ---------------------------------------------------------------------

test('evaluateControl: identical rooted/control output is reported inert', () => {
  const rooted = { status: 0, stdout: 'same', stderr: '' };
  const control = { status: 0, stdout: 'same', stderr: '' };
  assert.deepEqual(evaluateControl(rooted, control), { inert: true });
});

test('evaluateControl: differing rooted/control output is not inert', () => {
  const rooted = { status: 0, stdout: '0 errors', stderr: '' };
  const control = { status: 1, stdout: '1 error: domain-config.json missing', stderr: '' };
  assert.deepEqual(evaluateControl(rooted, control), { inert: false });
});

test('computeExitCode: an inert control fails the run even when every fixture is identical', () => {
  const fixtures = [{ verdict: 'identical' }, { verdict: 'identical' }];
  assert.equal(computeExitCode({ fixtures, control: { inert: true } }), 1);
});

test('computeExitCode: 0 only when every fixture is identical and the control is not inert', () => {
  const fixtures = [{ verdict: 'identical' }, { verdict: 'identical' }];
  assert.equal(computeExitCode({ fixtures, control: { inert: false } }), 0);
});

test('formatReport: a run with an inert control names the control as inert, even with no fixture differences', () => {
  const report = formatReport({
    before: { ref: 'origin/main', sha: 'aaa', auditPath: '/a/audit.mjs', isWorktree: false },
    after: { ref: WORKTREE, sha: 'bbb', auditPath: '/b/audit.mjs', isWorktree: true },
    fixtures: [
      { name: 'rooted', verdict: 'identical', beforeStatus: 0, afterStatus: 0 },
      { name: 'control', verdict: 'identical', beforeStatus: 1, afterStatus: 1 },
    ],
    control: { inert: true },
  });
  assert.match(report, /control: INERT/);
});

// ---------------------------------------------------------------------
// not-run — R10
// ---------------------------------------------------------------------

test('fixtureVerdict: exit 2 on the before side gives not-run, never different', () => {
  const before = { status: 2, stdout: 'preflight failed', stderr: '' };
  const after = { status: 0, stdout: 'totally different text', stderr: '' };
  assert.deepEqual(fixtureVerdict(before, after), {
    verdict: 'not-run',
    reason: 'plugin dependencies are missing, or the audit failed its preflight (exit 2)',
  });
});

test('fixtureVerdict: exit 2 on the after side gives not-run, never different', () => {
  const before = { status: 0, stdout: 'totally different text', stderr: '' };
  const after = { status: 2, stdout: 'preflight failed', stderr: '' };
  assert.deepEqual(fixtureVerdict(before, after), {
    verdict: 'not-run',
    reason: 'plugin dependencies are missing, or the audit failed its preflight (exit 2)',
  });
});

test('fixtureVerdict: exit 2 on BOTH sides with identical text is still not-run, not identical', () => {
  const before = { status: 2, stdout: 'preflight failed', stderr: '' };
  const after = { status: 2, stdout: 'preflight failed', stderr: '' };
  assert.equal(fixtureVerdict(before, after).verdict, 'not-run');
});

test('computeExitCode: a not-run fixture fails the run', () => {
  const fixtures = [
    { verdict: 'identical' },
    { verdict: 'not-run', reason: 'plugin dependencies are missing, or the audit failed its preflight (exit 2)' },
  ];
  assert.equal(computeExitCode({ fixtures, control: { inert: false } }), 1);
});

// ---------------------------------------------------------------------
// combinedOutput — the format the CLI diffs verbatim
// ---------------------------------------------------------------------

test('combinedOutput: normalises both stdout and stderr and separates them', () => {
  const text = combinedOutput({ stdout: 'out\r\n', stderr: '(node:99) warn\r\n' });
  assert.equal(text, 'out\n\n--- stderr ---\n(node:PID) warn\n');
});
