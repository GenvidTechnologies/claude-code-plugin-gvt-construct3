#!/usr/bin/env node
// Dev-workspace pin-bump verification. Maintainer tooling only.
//
// NOT part of the shipped plugin/ artifact and NOT wired into
// .gvt-agent.json's commands.validate — run it directly, e.g.:
//
//   node scripts/pin-bump-check.mjs @genvidtech/c3-domain-manager@0.11.0 @genvidtech/c3-domain-manager@0.11.1
//   node scripts/pin-bump-check.mjs --keep <old-spec> <new-spec>
//
// Scripts the ADR 0007 tarball checks wiki/pin-bump-verification.md
// prescribes for a pin bump: installs OLD and NEW into separately sealed temp
// directories and compares them. Both specs must name the same package.
// Checks, in report order:
//
//   1. control        package.json of the two sides must DIFFER; if they compare
//                     identical the comparator is not seeing the two installs,
//                     and the run aborts (exit 1) before reporting anything else.
//   2. ADR 0007 pt 1  dist/adapters/locations.js byte comparison
//                     (c3-domain-manager only; not-applicable otherwise).
//   3. dist           recursive dist/ comparison. Differences are informational
//                     (a bump is expected to change dist); an empty corpus is an
//                     error.
//   4. ADR 0007 pt 2  the @genvidtech/mcp-utils range declared by each side, and
//                     every published version the NEW range resolves to, judged
//                     against the "Reviewed baseline" in audit.mjs.
//   5. package.json   fields that differ (informational).
//   6. pin sites      every line under plugin/ carrying the bare OLD version,
//                     excluding node_modules and binary files (informational;
//                     hits are listed, not classified).
//
// Offline mode, used by scripts/test/pin-bump-check.test.mjs so the suite makes
// no network calls and never runs npm:
//   --from-dirs <oldPkgDir> <newPkgDir>   skip install; dirs are package roots
//   --published <v1,v2,...>               skip `npm view`; "" = no match
//   --plugin-root <dir>                   sweep root override (default plugin/)
// The specs are still required (they carry the package name and old version).
//
// Exit codes: 0 when every check is pass/identical/not-applicable/informational;
// 1 when any check fails or errors, an install fails, or the control fails;
// 2 on a usage error (message plus these usage lines on stderr).
//
// Design decisions:
//
// - Same setup traps as scripts/mcp-surface.mjs: temp dir sealed with a `{}`
//   package.json BEFORE `npm install` (%TEMP% can itself be an npm project);
//   npm's stderr is captured and shown, never discarded; the temp base is
//   realpathSync.native(os.tmpdir()) because the 8.3 short path trips
//   permission checks on this machine.
// - The verdict logic is pure and lives in scripts/lib/pin-bump-check.mjs; this
//   file only gathers bytes, runs npm, and prints.
// - A side that cannot be read is an 'error' side, never "identical".

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compareBytes,
  compareFileSets,
  diffPackageFields,
  evaluateRange,
  exitCodeFor,
  formatReport,
  mcpUtilsRange,
  normalizeNpmViewVersions,
  parseReviewedBaseline,
  sweepPinSites,
} from './lib/pin-bump-check.mjs';
import { buildNpmInvocation } from './lib/npm-invocation.mjs';

const USAGE = [
  'Usage:',
  '  node scripts/pin-bump-check.mjs [--keep] <old-spec> <new-spec>',
  '  node scripts/pin-bump-check.mjs --from-dirs <oldPkgDir> <newPkgDir> [--published <v1,v2>] [--plugin-root <dir>] <old-spec> <new-spec>',
  '  (specs look like @genvidtech/c3-domain-manager@0.11.1 and must name the same package)',
].join('\n');

const DM = '@genvidtech/c3-domain-manager';
const MCP_UTILS = '@genvidtech/mcp-utils';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const AUDIT_LIB = join(SCRIPT_DIR, '..', 'plugin', 'skills', 'audit-c3-conventions', 'scripts', 'lib', 'audit.mjs');
const DEFAULT_PLUGIN_ROOT = join(SCRIPT_DIR, '..', 'plugin');
const REPO_ROOT = join(SCRIPT_DIR, '..');

function parseSpec(spec) {
  const at = spec.lastIndexOf('@');
  if (at <= 0) throw new Error(`spec "${spec}" must look like <name>@<x.y.z>`);
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`spec "${spec}" must pin an exact x.y.z version, got "${version}"`);
  }
  return { name, version };
}

function parseArgs(argv) {
  const args = { keep: false, fromDirs: null, published: null, pluginRoot: null, specs: [] };
  const need = (i, what) => {
    if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs ${what}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--keep') args.keep = true;
    else if (arg === '--from-dirs') {
      if (argv[i + 2] === undefined) throw new Error('--from-dirs needs two directories');
      args.fromDirs = [argv[i + 1], argv[i + 2]];
      i += 2;
    } else if (arg === '--published') {
      args.published = need(i, 'a comma-separated version list');
      i += 1;
    } else if (arg === '--plugin-root') {
      args.pluginRoot = need(i, 'a directory');
      i += 1;
    } else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else args.specs.push(arg);
  }
  if (args.specs.length !== 2) throw new Error('provide exactly two specs: <old-spec> <new-spec>');
  const oldSpec = parseSpec(args.specs[0]);
  const newSpec = parseSpec(args.specs[1]);
  if (oldSpec.name !== newSpec.name) {
    throw new Error(`specs name different packages: ${oldSpec.name} vs ${newSpec.name}`);
  }
  return { ...args, name: oldSpec.name, oldVersion: oldSpec.version, newVersion: newSpec.version };
}

function runNpm(args, cwd) {
  try {
    const inv = buildNpmInvocation(args, { platform: process.platform, execPath: process.execPath, exists: existsSync });
    return spawnSync(inv.command, inv.args, { cwd, encoding: 'utf8', shell: inv.shell });
  } catch (error) {
    return { status: null, stdout: '', stderr: '', error };
  }
}

function removeTempDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    console.error(`warning: could not remove ${dir}: ${err.message}`);
  }
}

function installSpec(spec, tmpBase) {
  const tmpDir = mkdtempSync(join(tmpBase, 'gvt-construct3-pin-bump-'));
  // Seal FIRST — see design decisions.
  writeFileSync(join(tmpDir, 'package.json'), '{}\n');
  const install = runNpm(['install', spec, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], tmpDir);
  if (install.error) throw new Error(`could not run npm install for ${spec}: ${install.error.message}`);
  if (install.status !== 0) {
    throw new Error(`npm install ${spec} failed (exit ${install.status}):\n${(install.stderr || '').trim()}`);
  }
  return tmpDir;
}

function readSide(path) {
  try {
    return { ok: true, bytes: readFileSync(path) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

const toPosix = (p) => p.split(sep).join('/');

function collectFiles(root) {
  const map = new Map();
  if (!existsSync(root)) return map;
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    map.set(toPosix(relative(root, full)), readFileSync(full));
  }
  return map;
}

function collectSweepFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    const rel = toPosix(relative(root, full));
    if (rel.split('/').includes('node_modules')) continue;
    const buf = readFileSync(full);
    if (buf.subarray(0, 8000).includes(0)) continue; // binary
    files.push({ path: rel, text: buf.toString('utf8') });
  }
  return files;
}

function mcpUtilsCheck({ oldPkg, newPkg, args, baseline, newRoot, tmpBase }) {
  const oldRange = mcpUtilsRange(oldPkg);
  const newRange = mcpUtilsRange(newPkg);
  const name = 'ADR 0007 part 2: mcp-utils range vs reviewed baseline';
  if (!newRange) {
    return { name, verdict: 'not-applicable', message: `${args.name}@${args.newVersion} declares no ${MCP_UTILS} dependency` };
  }
  const details = [
    `old range: ${oldRange ?? '(none)'}`,
    `new range: ${newRange}`,
    oldRange === newRange ? 'range did not move' : 'range MOVED',
    `reviewed baseline: {${baseline.join(', ')}}`,
  ];
  const resolved = newRoot ? readJsonSafe(join(newRoot, 'node_modules', ...MCP_UTILS.split('/'), 'package.json')) : null;
  details.push(`sealed install resolved ${MCP_UTILS}: ${resolved?.version ?? '(not available)'} (informational)`);

  let resolvable;
  if (args.published !== null) {
    resolvable = args.published.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    const view = runNpm(['view', `${MCP_UTILS}@${newRange}`, 'version', '--json'], tmpBase);
    if (view.error || view.status !== 0) {
      return {
        name,
        verdict: 'error',
        message: `npm view ${MCP_UTILS}@${newRange} failed: ${view.error?.message ?? `exit ${view.status}`}`,
        details: [...details, ...(view.stderr || '').trim().split('\n').filter(Boolean)],
      };
    }
    try {
      resolvable = normalizeNpmViewVersions(view.stdout);
    } catch (err) {
      return { name, verdict: 'error', message: err.message, details };
    }
  }
  details.push(`published versions the new range resolves to: ${resolvable.join(', ') || '(none)'}`);
  const r = evaluateRange({ range: newRange, resolvable, baseline });
  return { name, verdict: r.verdict, message: r.message, details };
}

function buildChecks(args, oldDir, newDir, newRoot, tmpBase) {
  const checks = [];
  const oldPkg = readJsonSafe(join(oldDir, 'package.json'));
  const newPkg = readJsonSafe(join(newDir, 'package.json'));

  // Control (R4): the two package.json files must differ.
  const control = compareBytes(readSide(join(oldDir, 'package.json')), readSide(join(newDir, 'package.json')));
  if (control.verdict !== 'different') {
    return {
      abort:
        control.verdict === 'identical'
          ? 'control FAILED: the two package.json files compare identical, so the comparator is not seeing two different installs. Nothing else is reported.'
          : `control FAILED: could not compare the two package.json files (${control.detail}). Nothing else is reported.`,
    };
  }
  checks.push({ name: 'control: package.json differs between old and new', verdict: 'pass', message: control.detail });

  // ADR 0007 part 1.
  if (args.name === DM) {
    const r = compareBytes(
      readSide(join(oldDir, 'dist', 'adapters', 'locations.js')),
      readSide(join(newDir, 'dist', 'adapters', 'locations.js')),
    );
    checks.push({ name: 'ADR 0007 part 1: dist/adapters/locations.js', verdict: r.verdict, message: r.detail });
  } else {
    checks.push({
      name: 'ADR 0007 part 1: dist/adapters/locations.js',
      verdict: 'not-applicable',
      message: `only ${DM} carries locations.js; this package is ${args.name}`,
    });
  }

  // dist completeness.
  const fileSet = compareFileSets(collectFiles(join(oldDir, 'dist')), collectFiles(join(newDir, 'dist')));
  checks.push({
    name: 'dist/ recursive comparison',
    verdict: fileSet.verdict === 'different' ? 'informational' : fileSet.verdict,
    message:
      fileSet.verdict === 'different'
        ? 'dist differs (expected across a bump; listed below)'
        : fileSet.verdict === 'error'
          ? 'empty dist/ on at least one side - nothing was compared'
          : 'dist identical',
    fileSet,
  });

  // ADR 0007 part 2.
  let baseline;
  try {
    baseline = parseReviewedBaseline(readFileSync(AUDIT_LIB, 'utf8'));
  } catch (err) {
    checks.push({ name: 'ADR 0007 part 2: mcp-utils range vs reviewed baseline', verdict: 'error', message: `cannot read the reviewed baseline: ${err.message}` });
    baseline = null;
  }
  if (baseline) checks.push(mcpUtilsCheck({ oldPkg, newPkg, args, baseline, newRoot, tmpBase }));

  // package.json fields.
  const diffs = diffPackageFields(oldPkg, newPkg);
  checks.push({
    name: 'package.json fields that differ',
    verdict: 'informational',
    message: diffs.length ? diffs.map((d) => d.field).join(', ') : 'none of the watched fields differ',
    details: diffs.flatMap((d) => [`${d.field}:`, `  old: ${JSON.stringify(d.old) ?? '(absent)'}`, `  new: ${JSON.stringify(d.new) ?? '(absent)'}`]),
  });

  // Pin-site sweep.
  const root = args.pluginRoot ?? DEFAULT_PLUGIN_ROOT;
  let sweep;
  try {
    sweep = sweepPinSites(collectSweepFiles(root), args.oldVersion);
  } catch (err) {
    checks.push({ name: `pin sites for ${args.oldVersion}`, verdict: 'error', message: `sweep of ${root} failed: ${err.message}` });
    return { checks };
  }
  const prefix = args.pluginRoot ? '' : `${toPosix(relative(REPO_ROOT, DEFAULT_PLUGIN_ROOT))}/`;
  const files = new Set(sweep.map((h) => h.path));
  checks.push({
    name: `pin sites for ${args.oldVersion} under ${args.pluginRoot ?? 'plugin/'} (node_modules excluded)`,
    verdict: 'informational',
    message: `${sweep.length} line(s) across ${files.size} file(s); hits are not classified`,
    details: sweep.map((h) => `${prefix}${h.path}:${h.line}: ${h.text.trim()}`),
  });
  return { checks };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const tmpBase = realpathSync.native(tmpdir());
  const tmpDirs = [];
  let result;
  try {
    let oldDir;
    let newDir;
    let newRoot = null;
    if (args.fromDirs) {
      [oldDir, newDir] = args.fromDirs;
    } else {
      const oldRoot = installSpec(`${args.name}@${args.oldVersion}`, tmpBase);
      tmpDirs.push(oldRoot);
      newRoot = installSpec(`${args.name}@${args.newVersion}`, tmpBase);
      tmpDirs.push(newRoot);
      oldDir = join(oldRoot, 'node_modules', ...args.name.split('/'));
      newDir = join(newRoot, 'node_modules', ...args.name.split('/'));
    }
    result = buildChecks(args, oldDir, newDir, newRoot, tmpBase);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  } finally {
    for (const dir of tmpDirs) {
      if (args.keep) console.error(`kept: ${dir}`);
      else removeTempDir(dir);
    }
  }

  if (result.abort) {
    console.error(result.abort);
    process.exitCode = 1;
    return;
  }
  console.log(formatReport(result).join('\n'));
  process.exitCode = exitCodeFor(result);
}

main();
