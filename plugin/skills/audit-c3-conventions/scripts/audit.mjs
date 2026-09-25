#!/usr/bin/env node
// Thin CLI entry point for the audit-c3-conventions skill. Runs a usability
// preflight against `@genvidtech/audit-core` before loading `./lib/audit.mjs`
// (the audit implementation, which depends on audit-core), so an uninstalled or
// partially-installed dependency reports a one-line, no-stack-trace
// remediation message on exit 2 instead of a raw MODULE_NOT_FOUND stack.
//
// Invoked by SKILL.md as:
//   node "${CLAUDE_PLUGIN_ROOT}/skills/audit-c3-conventions/scripts/audit.mjs"
// This must keep working from any cwd — the audit itself evaluates
// process.cwd() as the target repo, not this script's own location.
//
// Exit code: 0 if all required expectations are satisfied; 1 if any error
// finding; 2 on a failed preflight or unexpected script error.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { preflight } from './lib/preflight.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// scripts -> audit-c3-conventions -> skills -> plugin root
const PLUGIN_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');

async function run() {
  const result = await preflight({ pluginRoot: PLUGIN_ROOT });
  if (!result.ok) {
    console.error(result.message);
    process.exit(result.exitCode ?? 2);
    return;
  }

  const { main } = await import('./lib/audit.mjs');
  await main();
}

run().catch((err) => {
  console.error('audit failed:', err);
  process.exit(2);
});
