// Pure decision logic for how to invoke npm from a workspace script (e.g.
// scripts/audit-diff.mjs, scripts/mcp-surface.mjs). No fs, no process, no
// child_process — every input the caller already has to hand (`platform`,
// `execPath`, and an `exists` check standing in for `existsSync`) and the
// output is a plain `{ command, args, shell }` the caller passes straight to
// `spawnSync`/`spawn`. This split follows wiki/skill-authoring-conventions.md's
// "split a pure transform from a thin I/O CLI" rule.
//
// Why this exists, and why it is not just `spawn('npm', args)`:
//
// - The preferred path everywhere is running npm's own CLI entry point
//   (`npm-cli.js`) directly with `execPath` (the running `node` binary) and
//   no shell at all — this sidesteps platform resolution of the `npm`/
//   `npm.cmd` name entirely, and is what both callers already did before
//   this module existed.
// - Off Windows, the npm-cli.js fallback is a bare `spawn('npm', args)` with
//   no shell — `npm` resolves on PATH there without help.
// - On Windows, npm ships as `npm.cmd`. Since the CVE-2024-27980 hardening,
//   Node refuses to spawn a `.cmd` without a shell, and Node 24 deprecates an
//   `args` array alongside `shell: true` (DEP0190), because the args are
//   concatenated into the cmd.exe line unescaped. So the fallback hands
//   cmd.exe one command string with an empty args array — but only after
//   every argument passes the allow-list below (package-spec and CLI-flag
//   characters). Validating rather than quoting is deliberate: cmd.exe can't
//   reliably escape `"` or `%`. The plugin's npx probe makes the same choice
//   (ADR 0023).

import { dirname, join } from 'node:path';

export function buildNpmInvocation(args, { platform, execPath, exists }) {
  const npmCli = join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (exists(npmCli)) {
    return { command: execPath, args: [npmCli, ...args], shell: false };
  }
  if (platform !== 'win32') {
    return { command: 'npm', args, shell: false };
  }
  const bad = args.find((a) => !/^[A-Za-z0-9@\/._=:-]+$/.test(a));
  if (bad !== undefined) {
    throw new Error(`refusing to pass ${JSON.stringify(bad)} to npm.cmd through a shell`);
  }
  return { command: ['npm.cmd', ...args].join(' '), args: [], shell: true };
}
