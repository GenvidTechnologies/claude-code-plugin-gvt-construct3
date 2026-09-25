#!/usr/bin/env node
// Dev-workspace MCP surface probe. Maintainer tooling only.
//
// NOT part of the shipped plugin/ artifact and NOT wired into
// .gvt-agent.json's commands.validate — run it directly, e.g.:
//
//   node scripts/mcp-surface.mjs @genvidtech/construct3-chef@2.0.0
//   node scripts/mcp-surface.mjs @genvidtech/construct3-chef@1.2.0 @genvidtech/construct3-chef@2.0.0
//   node scripts/mcp-surface.mjs --timeout 60000 --server node ./some/already-installed/server.js server
//   node scripts/mcp-surface.mjs --timeout 60000 --keep @genvidtech/c3-domain-manager@0.11.0
//
// Given one or more npm package specs, installs each into a freshly sealed
// temp directory, starts the server it ships over stdio (mirroring how
// plugin.json launches both C3 MCP servers: `npx -y <spec> server`), speaks
// MCP to it, and prints its sorted tool names, resource URIs, and
// resource-template count. With more than one spec, also prints the
// added/removed set differences between each consecutive pair — this is
// the live-`resources/list` verification wiki/pin-bump-verification.md
// prescribes for a pin bump, scripted instead of hand-run each time.
//
// `--server <cmd> [args...]` skips the install step entirely and speaks MCP
// to an already-running command instead — the offline path, and what the
// end-to-end tests in scripts/test/mcp-surface.test.mjs use so the suite
// makes no network calls and never runs npm. `--server` swallows every
// argv token after it (the target command's own args may look like flags),
// so `--timeout`/`--keep` must be given BEFORE `--server`, never after.
//
// Exit codes: 0 on a clean probe of every spec; 1 if any install, spawn, or
// protocol step failed (message on stderr); 2 on a usage error (message plus
// this header's usage lines on stderr).
//
// Design decisions:
//
// - Installs via `npm install <spec>` into a sealed temp dir rather than
//   `npm pack` + extract: this machine has no single `tar` binary that both
//   GNU tar and bsdtar agree on the flags for (CLAUDE.md, "Resolve external
//   tools explicitly"), and `npm install` already resolves the server's own
//   runtime dependencies the way `npx -y` does — a packed tarball carries no
//   `node_modules` and would need a second install step anyway.
// - No MCP SDK dependency: the repo root deliberately has no package.json
//   (the npm surface lives in plugin/ only — see wiki/the-npm-surface-and-
//   ci-gate.md), so this script speaks newline-delimited JSON-RPC 2.0 by
//   hand via scripts/lib/mcp-surface.mjs rather than pulling in a client
//   library.
// - Three setup traps, each cost an iteration during #130's live pin-bump
//   probe (wiki/pin-bump-verification.md) and are guarded against here:
//     1. `%TEMP%` can itself be an npm project (a `package.json` an
//        ancestor directory owns), so npm's upward walk installs into the
//        wrong tree unless the temp dir is sealed with its own `{}`
//        `package.json` FIRST, before `npm install` runs.
//     2. The resolved bin path is made ABSOLUTE before spawning, because the
//        server is spawned with `cwd` set to the temp dir — a path still
//        relative to the package directory would resolve against the wrong
//        cwd and point nowhere.
//     3. The child's stderr is captured and kept, never discarded — a
//        crashed or hung server otherwise looks identical to "no reply yet"
//        and the probe times out with no clue why.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { createInterface } from 'node:readline';

import {
  DEFAULT_TIMEOUT_MS,
  formatReport,
  parsePackageSpec,
  probeSurface,
  resolveBinEntry,
} from './lib/mcp-surface.mjs';

const USAGE = [
  'Usage:',
  '  node scripts/mcp-surface.mjs <spec> [<spec>...] [--timeout <ms>] [--keep]',
  '  node scripts/mcp-surface.mjs [--timeout <ms>] --server <cmd> [args...]',
  '  (--server swallows every remaining argument, so --timeout/--keep must come before it)',
].join('\n');

function parseArgs(argv) {
  const args = { specs: [], server: null, timeoutMs: DEFAULT_TIMEOUT_MS, keep: false };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--timeout') {
      const value = argv[i + 1];
      const ms = Number(value);
      if (!value || !Number.isFinite(ms) || ms <= 0) {
        throw new Error(`--timeout needs a positive number of milliseconds, got "${value ?? ''}"`);
      }
      args.timeoutMs = ms;
      i += 2;
      continue;
    }
    if (arg === '--keep') {
      args.keep = true;
      i += 1;
      continue;
    }
    if (arg === '--server') {
      const rest = argv.slice(i + 1);
      if (rest.length === 0) throw new Error('--server needs a command, e.g. --server node ./server.js');
      args.server = rest;
      i = argv.length;
      continue;
    }
    args.specs.push(arg);
    i += 1;
  }
  if (args.server === null && args.specs.length === 0) {
    throw new Error('provide one or more package specs, or --server <cmd> [args...]');
  }
  return args;
}

// Wraps a spawned child process as the `transport` scripts/lib/mcp-surface.mjs
// expects. `child.stdout` is read through readline so `lines` is an
// AsyncIterable<string> of already-split lines, exactly what the lib wants.
function makeTransport(child) {
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let stderrText = '';
  child.stderr.on('data', (chunk) => {
    stderrText += chunk.toString('utf8');
  });
  const exited = new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
    child.on('error', (err) => resolve({ code: null, signal: null, error: err }));
  });
  return {
    send(line) {
      child.stdin.write(`${line}\n`);
    },
    lines: rl,
    exited,
    getStderr: () => stderrText,
  };
}

// Kills the server and WAITS for it to exit (bounded). On Windows a
// directory cannot be removed while a live process holds it as its cwd or
// has files in it open, so removing the temp dir straight after `kill()`
// fails with EPERM — measured on the first live run of this script.
async function killAndWait(child, graceMs = 5000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', () => resolveExit(true)));
  const waitExit = async () => {
    let timer;
    const done = await Promise.race([exited, new Promise((r) => { timer = setTimeout(() => r(false), graceMs); })]);
    clearTimeout(timer);
    return done;
  };
  child.kill();
  // A server that ignores SIGTERM would otherwise outlive the probe. On
  // Windows `kill()` already terminates the process outright, so this
  // escalation only matters elsewhere.
  if (!(await waitExit())) {
    child.kill('SIGKILL');
    await waitExit();
  }
}

// A cleanup failure must not discard a probe that succeeded, so it is
// reported as a warning naming the leftover path rather than thrown.
function removeTempDir(tmpDir) {
  try {
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (err) {
    console.error(`warning: could not remove ${tmpDir}: ${err.message}`);
  }
}

// Locates npm's own CLI entry point next to the running node binary and
// runs it with `process.execPath`, so `npm install` never depends on how
// `npm` resolves on PATH. On Windows, npm ships as `npm.cmd`, a bare
// `spawn('npm', ...)` fails to resolve it, and Node >=20 refuses to spawn a
// `.cmd` file at all without `shell: true` — running npm-cli.js directly
// with node sidesteps both, and works identically off Windows. Falls back
// to a shell-invoked `npm`/`npm.cmd` only when npm-cli.js isn't where a
// standard Node install puts it (e.g. some non-standard node distributions).
function runNpm(args, cwd) {
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(npmCli)) {
    return spawnSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8' });
  }
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(command, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
}

async function runSpec(spec, opts) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'gvt-construct3-mcp-surface-'));
  let child;
  try {
    // Seal the temp dir FIRST — see design decision (1) above.
    writeFileSync(join(tmpDir, 'package.json'), '{}\n');

    const install = runNpm(['install', spec, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], tmpDir);
    if (install.error) {
      throw new Error(`could not run npm install for ${spec}: ${install.error.message}`);
    }
    if (install.status !== 0) {
      throw new Error(
        `npm install ${spec} failed (exit ${install.status}):\n${(install.stderr || '').trim()}`,
      );
    }

    const { name } = parsePackageSpec(spec);
    const pkgDir = join(tmpDir, 'node_modules', ...name.split('/'));
    const pkgJsonPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      throw new Error(`installed package not found at ${pkgDir} (spec: ${spec})`);
    }
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    const binRel = resolveBinEntry(pkgJson, name);
    const binAbs = resolvePath(pkgDir, binRel); // absolute — see design decision (2) above.

    child = spawn(process.execPath, [binAbs, 'server'], { cwd: tmpDir, stdio: ['pipe', 'pipe', 'pipe'] });
    const transport = makeTransport(child);
    const surface = await probeSurface(transport, { timeoutMs: opts.timeoutMs });
    return { label: spec, surface };
  } finally {
    await killAndWait(child);
    if (opts.keep) {
      console.error(`kept: ${tmpDir}`);
    } else {
      removeTempDir(tmpDir);
    }
  }
}

async function runServer(serverArgv, opts) {
  const [cmd, ...cmdArgs] = serverArgv;
  const child = spawn(cmd, cmdArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    const transport = makeTransport(child);
    const surface = await probeSurface(transport, { timeoutMs: opts.timeoutMs });
    return { label: serverArgv.join(' '), surface };
  } finally {
    await killAndWait(child);
  }
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

  const results = [];
  try {
    if (args.server) {
      results.push(await runServer(args.server, args));
    } else {
      for (const spec of args.specs) {
        results.push(await runSpec(spec, args));
      }
    }
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  console.log(formatReport(results));
}

main();
