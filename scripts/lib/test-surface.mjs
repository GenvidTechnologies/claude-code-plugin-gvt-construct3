// Pure, disk-free helpers for asserting that a test suite actually RAN.
//
// The defect these exist to close: the plugin test glob
// `skills/*/scripts/test/*.test.mjs` is relative to `plugin/`. Run from the
// repo root it matches nothing, the runner prints `# pass 0`, and the process
// exits 0 — a green run that verified nothing (CLAUDE.md, "the `cd plugin &&`
// is load-bearing, and dropping it fails *open*"). Exit code alone cannot
// distinguish "everything passed" from "nothing ran", so a suite is only
// trusted here when BOTH its matched-file count and its reported pass count
// clear a floor.
//
// Floors are `>=`, so adding tests never breaks the gate; only losing them
// does.
//
// This module does no I/O and spawns nothing: callers glob the files and run
// the runner, then pass the resulting paths and raw stdout in. That split is
// what makes the decisions unit-testable without executing a test suite.

const TESTS_PREFIX = '# tests ';
const PASS_PREFIX = '# pass ';
const FAIL_PREFIX = '# fail ';

/**
 * Parses a decimal count, with no regex and no `Number()` coercion slack:
 * the text must be a non-empty run of ASCII digits. Returns `null` otherwise,
 * so `''`, `'  '`, `'12ms'`, and `'-1'` are all rejected rather than silently
 * becoming a number.
 */
function parseCount(text) {
  const digits = text.trim();
  if (digits.length === 0) return null;
  for (const ch of digits) {
    if (ch < '0' || ch > '9') return null;
  }
  return Number.parseInt(digits, 10);
}

/**
 * The value on the LAST line of `text` that begins with `prefix`, or `null`
 * when no line does.
 *
 * Matching is a LITERAL prefix test against the un-trimmed line — deliberately
 * not a regex. Two reasons, both load-bearing:
 *
 * 1. A regex written into this file through a shell heredoc loses one level of
 *    backslash escaping silently, turning `\d` into `d`; the result still
 *    compiles and still matches, just the wrong thing. A literal prefix check
 *    has no escape sequences to corrupt.
 * 2. Node's TAP reporter indents nested summaries. Requiring the prefix at
 *    column 0 keeps a subtest's own tally from being read as the run's.
 *
 * The last match wins because the run-level summary is emitted last.
 */
function lastPrefixedValue(text, prefix) {
  let found = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith(prefix)) found = line.slice(prefix.length);
  }
  return found;
}

/**
 * Extracts the `tests` / `pass` / `fail` counters from a TAP run's stdout.
 *
 * Returns `{ ok: true, tests, pass, fail }` when all three are present and
 * numeric, otherwise `{ ok: false, reason }`.
 *
 * "Unparseable" is never folded into zero. Text carrying no `# pass ` line at
 * all must NOT read as `pass: 0`, because "the runner produced no summary"
 * (it crashed, or emitted the default non-ASCII reporter) and "the runner ran
 * and everything failed" call for different handling — and only one of them is
 * a test failure.
 */
export function parseTapSummary(text) {
  const raw = {
    tests: lastPrefixedValue(text, TESTS_PREFIX),
    pass: lastPrefixedValue(text, PASS_PREFIX),
    fail: lastPrefixedValue(text, FAIL_PREFIX),
  };

  const missing = Object.keys(raw).filter((key) => raw[key] === null);
  if (missing.length > 0) {
    return { ok: false, reason: `no TAP summary line for: ${missing.join(', ')}` };
  }

  const counts = {};
  for (const key of Object.keys(raw)) {
    const value = parseCount(raw[key]);
    if (value === null) {
      return { ok: false, reason: `TAP summary "${key}" is not a count: ${JSON.stringify(raw[key])}` };
    }
    counts[key] = value;
  }

  return { ok: true, ...counts };
}

/**
 * Checks a glob's matched-file count against `minFiles`.
 *
 * Returns `{ ok, count, floor, message }`. The message is pinned to
 * `files matched: N (floor F)` — CI criteria grep for that text literally, so
 * the failure case reads `files matched: 0 (floor 10)`. Callers print it on
 * success as well as failure: positive evidence is the only way a reader can
 * tell "passed" from "ran nothing".
 */
export function checkGlobFloor(files, minFiles) {
  const count = files.length;
  return {
    ok: count >= minFiles,
    count,
    floor: minFiles,
    message: `files matched: ${count} (floor ${minFiles})`,
  };
}

/**
 * Renders a parsed summary as the pinned one-line tally
 * `tests=N pass=N fail=N`. CI criteria grep for e.g. `pass=197`.
 */
export function formatTapSummary(summary) {
  return `tests=${summary.tests} pass=${summary.pass} fail=${summary.fail}`;
}

/**
 * Compares a parsed TAP summary against a pass floor.
 *
 * Returns `{ ok, reasons }`. `reasons` lists every problem found, not just the
 * first, so a caller reports the whole picture in one run:
 * - the summary was unparseable (`ok: false` from `parseTapSummary`);
 * - `fail` is nonzero;
 * - `pass` is below `minPass` — the check that catches a suite which silently
 *   stopped running most of itself.
 */
export function checkSuiteFloor(summary, minPass) {
  if (!summary.ok) {
    return { ok: false, reasons: [`TAP summary unparseable: ${summary.reason}`] };
  }

  const reasons = [];
  if (summary.fail !== 0) {
    reasons.push(`${summary.fail} test(s) failed`);
  }
  if (summary.pass < minPass) {
    reasons.push(`pass ${summary.pass} is below floor ${minPass}`);
  }

  return { ok: reasons.length === 0, reasons };
}
