#!/usr/bin/env node
// Dev-workspace before/after diff for audit-c3-conventions' own output. Kept
// per #136, so a change to the audit script has a repeatable way to prove it
// leaves behaviour unchanged, instead of a fresh one-off comparison each time.
//
// NOT part of the shipped plugin/ artifact and NOT wired into
// .gvt-agent.json's commands.validate — run it directly, e.g.:
//
//   node scripts/audit-diff.mjs                  # origin/main vs the working tree
//   node scripts/audit-diff.mjs v3.0.0 HEAD       # any two refs
//   node scripts/audit-diff.mjs --keep v3.0.0     # leave the worktrees/scratch dirs behind
//
// Either ref may be the sentinel `WORKTREE`, meaning this repo's own
// checkout (no detached worktree is created for it). Defaults: before is
// `origin/main`, after is `WORKTREE`.
//
// For each non-WORKTREE ref, the SHA is resolved with `git rev-parse
// --verify <ref>^{commit}`, a detached worktree is created in a fresh
// mkdtemp directory, and that worktree's OWN `plugin/` dependencies are
// installed with `npm ci` — so each side runs exactly what its own lockfile
// pins, not whatever happens to be on disk in the working tree. The
// `WORKTREE` side skips both steps: it runs in place and is assumed already
// installed (as `commands.validate` requires for any normal session).
//
// Each side's `plugin/skills/audit-c3-conventions/scripts/audit.mjs` is then
// run once per fixture under `scripts/test/fixtures/audit-diff/` (`rooted`,
// `nonrooted`, `empty`, `control`), with the fixture directory as the audit's
// cwd and `C3_PROJECT_DIR` removed from its environment. Each run makes live
// `npx` MCP probes and takes on the order of 14s, so a full comparison (two
// sides x four fixtures) takes a couple of minutes; fixtures run
// sequentially. Output is normalised (Node's `(node:PID)` deprecation
// warning, CRLF -> LF — see scripts/lib/audit-diff.mjs) before comparing, and
// a unified diff for a `different` fixture is produced with `git diff
// --no-index --no-color` over two written-out normalised text files.
//
// One further check, the control: the after-side `rooted` and `control`
// fixtures (identical except `control` is missing `domain-config.json`) MUST
// differ. If they don't, the fixture pair can't tell two different repos
// apart and the run fails regardless of what the before/after diffs found.
//
// Exit codes: 0 every fixture identical (output and exit code) and the
// control distinguishes; 1 a
// fixture differs, is not-run (either side's audit exited 2 — missing
// plugin dependencies or a failed preflight), or the control is inert, or a
// side failed to resolve/install/run; 2 a usage error (bad argument, or a
// ref that doesn't resolve to a commit — message plus this header's usage
// lines on stderr).
//
// Cleanup: every worktree this run created is removed (`git worktree
// remove --force` + `git worktree prune`) and every scratch temp dir is
// removed, in a `finally` and on SIGINT, unless `--keep` was given. A
// removal failure is a warning, never a thrown error, so a cleanup problem
// can't hide whether the comparison itself passed.
//
// Design decisions:
//
// - Dependencies come from each ref's OWN `npm ci`, not the working tree's
//   node_modules copied over — the whole point is comparing what each ref's
//   lockfile actually pins (design decision recorded in plan.md for #136).
// - A worktree whose `plugin/package.json` is missing (refs before fa40b7c,
//   #119, which gave plugin/ its manifest) skips the install step and says so,
//   rather than running `npm ci` with no manifest in that directory — npm
//   would otherwise walk up to an ancestor's `package.json` and install the
//   wrong thing (wiki/the-npm-surface-and-ci-gate.md).
// - npm is resolved via scripts/lib/npm-invocation.mjs's `buildNpmInvocation`,
//   the shared decision logic scripts/mcp-surface.mjs's `runNpm` also defers
//   to.
// - Paths handed to `git` as arguments are POSIX-slashed. `mkdtempSync`
//   returns a native (backslash, on Windows) path, and a worktree/diff path
//   embedding one has been the failure mode elsewhere in this repo's
//   tooling (CLAUDE.md, "Resolve external tools explicitly").
// - The lib/CLI split follows wiki/skill-authoring-conventions.md:
//   scripts/lib/audit-diff.mjs is pure (no fs/process/network) and owns
//   every comparison decision; this file owns all I/O (git, npm, spawning
//   the audit, temp dirs) and just calls the lib.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WORKTREE,
  parseArgs,
  combinedOutput,
  fixtureVerdict,
  evaluateControl,
  computeExitCode,
  formatReport,
} from './lib/audit-diff.mjs';
import { buildNpmInvocation } from './lib/npm-invocation.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(__dirname, '..');
const FIXTURES_ROOT = join(REPO_ROOT, 'scripts', 'test', 'fixtures', 'audit-diff');
const FIXTURE_NAMES = ['rooted', 'nonrooted', 'empty', 'control'];
const AUDIT_REL = join('plugin', 'skills', 'audit-c3-conventions', 'scripts', 'audit.mjs');

const USAGE = [
  'Usage:',
  '  node scripts/audit-diff.mjs [before] [after] [--keep]',
  '  before/after default to origin/main / WORKTREE; either may be the literal WORKTREE',
  '  (this repo\'s own checkout, run in place with no detached worktree created for it).',
].join('\n');

class UsageError extends Error {}

function toPosix(p) {
  return p.split('\\').join('/');
}

// Defers to scripts/lib/npm-invocation.mjs for how to invoke npm — on
// Windows, npm.cmd needs a shell, and DEP0190 wants one validated command
// string rather than an args array paired with `shell: true`.
function runNpm(args, cwd) {
  try {
    const inv = buildNpmInvocation(args, { platform: process.platform, execPath: process.execPath, exists: existsSync });
    return spawnSync(inv.command, inv.args, { cwd, encoding: 'utf8', shell: inv.shell });
  } catch (error) {
    return { status: null, stdout: '', stderr: '', error };
  }
}

function git(args, opts = {}) {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', ...opts });
}

function resolveRef(ref) {
  const result = git(['rev-parse', '--verify', `${ref}^{commit}`]);
  if (result.error) {
    throw new UsageError(`could not run git rev-parse for "${ref}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new UsageError(`ref "${ref}" does not resolve to a commit: ${(result.stderr || '').trim()}`);
  }
  return result.stdout.trim();
}

// Every worktree this run creates, tracked so cleanup can run unconditionally
// in `finally` and on SIGINT — R9 requires that none survive a failed run.
const createdWorktrees = [];
const scratchDirs = [];

function resolveSide(ref) {
  if (ref === WORKTREE) {
    return {
      ref,
      sha: resolveRef('HEAD'),
      isWorktree: true,
      root: REPO_ROOT,
    };
  }
  const sha = resolveRef(ref);
  const parent = mkdtempSync(join(tmpdir(), 'gvt-construct3-audit-diff-'));
  // Track the dir before `git worktree add` can fail, so a failed add
  // doesn't leak it.
  scratchDirs.push(parent);
  const wtPath = join(parent, 'wt');
  const add = git(['worktree', 'add', '--detach', toPosix(wtPath), sha]);
  if (add.error) {
    throw new Error(`could not run git worktree add for "${ref}" (${sha}): ${add.error.message}`);
  }
  if (add.status !== 0) {
    throw new Error(`git worktree add failed for "${ref}" (${sha}):\n${(add.stderr || '').trim()}`);
  }
  createdWorktrees.push(wtPath);
  return { ref, sha, isWorktree: false, root: wtPath };
}

function installSide(side) {
  if (side.isWorktree) return; // assumed already installed — see header note
  const pluginRoot = join(side.root, 'plugin');
  const pkgJsonPath = join(pluginRoot, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    console.error(
      `note: ${side.ref} (${side.sha}) has no plugin/package.json — skipping npm ci, nothing to install`,
    );
    return;
  }
  const install = runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], pluginRoot);
  if (install.error) {
    throw new Error(`could not run npm ci for ${side.ref} (${side.sha}): ${install.error.message}`);
  }
  if (install.status !== 0) {
    throw new Error(
      `npm ci failed for ${side.ref} (${side.sha}) (exit ${install.status}):\n${(install.stderr || '').trim()}`,
    );
  }
}

function auditPathFor(side) {
  return join(side.root, AUDIT_REL);
}

function runAuditAgainstFixture(side, fixtureName) {
  const fixtureDir = join(FIXTURES_ROOT, fixtureName);
  const env = { ...process.env };
  delete env.C3_PROJECT_DIR;
  const result = spawnSync(process.execPath, [auditPathFor(side)], {
    cwd: fixtureDir,
    encoding: 'utf8',
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(
      `could not run audit.mjs for ${side.ref} (${side.sha}) against fixture "${fixtureName}": ${result.error.message}`,
    );
  }
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function writeUnifiedDiff(scratchDir, fixtureName, beforeText, afterText) {
  const beforeFile = join(scratchDir, `${fixtureName}.before.txt`);
  const afterFile = join(scratchDir, `${fixtureName}.after.txt`);
  writeFileSync(beforeFile, beforeText);
  writeFileSync(afterFile, afterText);
  // Run from the scratch dir with bare file names so the diff headers read
  // `a/<fixture>.before.txt`, not a temp path that changes every run.
  const diff = git(
    ['diff', '--no-index', '--no-color', `${fixtureName}.before.txt`, `${fixtureName}.after.txt`],
    { cwd: scratchDir },
  );
  if (diff.error) {
    throw new Error(`could not run git diff --no-index for fixture "${fixtureName}": ${diff.error.message}`);
  }
  // git diff --no-index exits 1 when the files differ — that's the expected
  // case here, not an error. Any status other than 0 or 1 is unexpected.
  if (diff.status !== 0 && diff.status !== 1) {
    throw new Error(
      `git diff --no-index exited ${diff.status} for fixture "${fixtureName}":\n${(diff.stderr || '').trim()}`,
    );
  }
  return diff.stdout;
}

function removeWorktrees() {
  for (const wtPath of createdWorktrees) {
    const remove = git(['worktree', 'remove', '--force', toPosix(wtPath)]);
    if (remove.status !== 0) {
      console.error(`warning: could not remove worktree ${wtPath}: ${(remove.stderr || '').trim()}`);
    }
  }
  const prune = git(['worktree', 'prune']);
  if (prune.status !== 0) {
    console.error(`warning: git worktree prune failed: ${(prune.stderr || '').trim()}`);
  }
}

function removeScratchDirs() {
  for (const dir of scratchDirs) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (err) {
      console.error(`warning: could not remove ${dir}: ${err.message}`);
    }
  }
}

function cleanup(keep) {
  if (keep) {
    for (const wtPath of createdWorktrees) console.error(`kept worktree: ${wtPath}`);
    for (const dir of scratchDirs) console.error(`kept scratch dir: ${dir}`);
    return;
  }
  removeWorktrees();
  removeScratchDirs();
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  let sigintHandler;
  try {
    const before = resolveSide(args.before);
    const after = resolveSide(args.after);

    sigintHandler = () => {
      cleanup(args.keep);
      process.exit(130);
    };
    process.once('SIGINT', sigintHandler);

    installSide(before);
    installSide(after);

    const beforeAuditPath = auditPathFor(before);
    const afterAuditPath = auditPathFor(after);

    const beforeResults = {};
    const afterResults = {};
    for (const name of FIXTURE_NAMES) {
      beforeResults[name] = runAuditAgainstFixture(before, name);
      afterResults[name] = runAuditAgainstFixture(after, name);
    }

    const diffScratchDir = mkdtempSync(join(tmpdir(), 'gvt-construct3-audit-diff-out-'));
    scratchDirs.push(diffScratchDir);

    const fixtures = FIXTURE_NAMES.map((name) => {
      const beforeResult = beforeResults[name];
      const afterResult = afterResults[name];
      const { verdict, reason } = fixtureVerdict(beforeResult, afterResult);
      const entry = {
        name,
        verdict,
        reason,
        beforeStatus: beforeResult.status,
        afterStatus: afterResult.status,
      };
      if (verdict === 'different') {
        entry.diff = writeUnifiedDiff(
          diffScratchDir,
          name,
          combinedOutput(beforeResult),
          combinedOutput(afterResult),
        );
      }
      return entry;
    });

    const control = evaluateControl(afterResults.rooted, afterResults.control);

    console.log(
      formatReport({
        before: { ...before, auditPath: beforeAuditPath },
        after: { ...after, auditPath: afterAuditPath },
        fixtures,
        control,
      }),
    );

    process.exitCode = computeExitCode({ fixtures, control });
  } catch (err) {
    console.error(err.message);
    if (err instanceof UsageError) {
      console.error(USAGE);
      process.exitCode = 2;
    } else {
      process.exitCode = 1;
    }
  } finally {
    if (sigintHandler) process.removeListener('SIGINT', sigintHandler);
    cleanup(args?.keep ?? false);
  }
}

main();
