// Pure comparison logic for scripts/audit-diff.mjs. No fs, no process, no
// network — every input is a plain `{status, stdout, stderr}` result the CLI
// captured by spawning `audit.mjs`, and every output is text or a plain
// object the CLI decides what to do with. This split follows
// wiki/skill-authoring-conventions.md's "split a pure transform from a thin
// I/O CLI" rule.
//
// The sentinel `WORKTREE` names the repo's own checkout rather than a
// detached worktree of some other ref — the CLI is the one that knows how to
// turn that into an actual directory, this module only needs to recognise it
// as a valid ref value.

export const WORKTREE = 'WORKTREE';
export const DEFAULT_BEFORE = 'origin/main';
export const DEFAULT_AFTER = WORKTREE;

/**
 * Parses CLI argv into `{ before, after, keep }`. Accepted forms:
 *   []                    -> before=DEFAULT_BEFORE, after=DEFAULT_AFTER
 *   [before]              -> after=DEFAULT_AFTER
 *   [before, after]
 * Either ref may be the sentinel `WORKTREE`. `--keep` (may appear anywhere)
 * leaves the temporary worktrees and diff scratch directories in place
 * instead of cleaning them up, for debugging a failed comparison.
 *
 * Throws on anything else: an unrecognised flag (including `--help`, which
 * is deliberately not a special case — the CLI's catch block prints usage
 * for any parse error, so `--help` and a genuine mistake behave the same
 * way), more than two positional arguments, or an empty ref string.
 */
export function parseArgs(argv) {
  let keep = false;
  const positional = [];

  for (const arg of argv) {
    if (arg === '--keep') {
      keep = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`unknown flag "${arg}"`);
    }
    positional.push(arg);
  }

  if (positional.length > 2) {
    throw new Error(
      `too many arguments: expected at most [before] [after], got ${positional.length}`,
    );
  }

  const before = positional.length >= 1 ? positional[0] : DEFAULT_BEFORE;
  const after = positional.length >= 2 ? positional[1] : DEFAULT_AFTER;

  if (before.trim() === '') throw new Error('before ref must not be empty');
  if (after.trim() === '') throw new Error('after ref must not be empty');

  return { before, after, keep };
}

/**
 * Strips the volatile parts of a captured run's text: Node's DEP0190
 * deprecation warning carries a real PID (`(node:62908)`), and Windows
 * writes CRLF where the fixture text and `git diff --no-index` expect LF.
 */
export function normalise(text) {
  return (text ?? '').replace(/\(node:\d+\)/g, '(node:PID)').replace(/\r\n/g, '\n');
}

/**
 * Renders one captured `{stdout, stderr}` result as the single normalised
 * text block both the verdict comparison and the CLI's unified diff operate
 * on, so the two can never disagree about what "the output" is.
 */
export function combinedOutput({ stdout, stderr } = {}) {
  return `${normalise(stdout)}\n--- stderr ---\n${normalise(stderr)}`;
}

/**
 * Verdict for one fixture, comparing the before-side and after-side captured
 * runs. `not-run` applies when EITHER side exited 2 — the audit's own
 * preflight-failure/unexpected-error code — because a run that never
 * completed cannot be meaningfully diffed against one that did, and must
 * never be reported as `different` just because its (incomplete) output text
 * happens to differ.
 */
export function fixtureVerdict(before, after) {
  if (before.status === 2 || after.status === 2) {
    return {
      verdict: 'not-run',
      reason:
        'plugin dependencies are missing, or the audit failed its preflight (exit 2)',
    };
  }
  if (combinedOutput(before) === combinedOutput(after)) {
    return { verdict: 'identical' };
  }
  return { verdict: 'different' };
}

/**
 * The control check: compares the after-side `rooted` fixture's output
 * against the after-side `control` fixture's output (`control` is `rooted`
 * minus `domain-config.json`, so it must report a missing-file error
 * `rooted` does not). Identical output means the control fixture pair is
 * inert — it cannot tell two genuinely different repos apart — and the
 * comparison run must fail regardless of what the before/after fixture
 * diffs found.
 */
export function evaluateControl(rootedAfter, controlAfter) {
  const inert = combinedOutput(rootedAfter) === combinedOutput(controlAfter);
  return { inert };
}

/**
 * Overall exit code: 0 only when every fixture verdict is `identical` and
 * the control distinguishes (is not inert). Any `different` fixture, any
 * `not-run` fixture, or an inert control all produce 1. Usage errors (2) are
 * the CLI's own concern — `parseArgs` throwing is what signals those, before
 * this function is ever reached.
 */
export function computeExitCode({ fixtures, control }) {
  const allIdentical = fixtures.every((f) => f.verdict === 'identical');
  return allIdentical && !control.inert ? 0 : 1;
}

function formatSide(label, side) {
  const worktreeNote = side.isWorktree ? ' (working tree)' : '';
  return `${label}: ${side.ref} (${side.sha})${worktreeNote} audit: ${side.auditPath}`;
}

/**
 * Renders the full report: one header line per side (ref, SHA, and the
 * audit.mjs path that ref actually ran), then per fixture the verdict and
 * each side's exit code — plus the unified diff text when the verdict is
 * `different` — then the control line last.
 *
 * `fixtures` entries: `{ name, verdict, reason?, beforeStatus, afterStatus,
 * diff? }`. `diff` is a caller-supplied `git diff --no-index` text (this
 * module does not run git); it is only rendered when `verdict === 'different'`.
 */
export function formatReport({ before, after, fixtures, control }) {
  const lines = [];
  lines.push(formatSide('before', before));
  lines.push(formatSide('after ', after));
  lines.push('');

  for (const f of fixtures) {
    lines.push(`== ${f.name} ==`);
    const verdictLine =
      f.verdict === 'identical'
        ? 'IDENTICAL'
        : f.verdict === 'not-run'
          ? `NOT RUN (${f.reason})`
          : 'DIFFERENT';
    lines.push(verdictLine);
    lines.push(`exit: before=${f.beforeStatus} after=${f.afterStatus}`);
    if (f.verdict === 'different' && f.diff) {
      lines.push(f.diff.trimEnd());
    }
    lines.push('');
  }

  lines.push(
    control.inert
      ? 'control: INERT — the after-side `rooted` and `control` fixtures produced identical output; the comparison is not meaningful.'
      : 'control: ok — the after-side `rooted` and `control` fixtures differ.',
  );

  return lines.join('\n');
}
