#!/usr/bin/env node
// Dev-workspace audit digest.
//
// NOT part of the shipped plugin/ artifact and NOT wired into
// .gvt-agent.json's commands.validate — run it directly, e.g.:
//
//   node scripts/audit-snapshot.mjs
//   node scripts/audit-snapshot.mjs --audit /path/to/audit.mjs
//
// Prints exactly four lines:
//
//   broken-link: <N>
//   retired-token: <N>
//   orphaned-doc: <N>
//   exit: <N>
//
// Compare against the "Expected audit residue" table in
// wiki/the-audit-contract.md. Those counts are known cost (upstream defects
// named in ADR 0012); a CHANGE in them is the regression signal, not the fact
// that they are nonzero.
//
// This script's own exit code is deliberately NOT the audit's: the audit's
// code is reported on the `exit:` line instead, so a nonzero audit does not
// look like a crash here. This script exits nonzero only when the audit could
// not be run or its output could not be parsed.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parseAuditOutput, formatDigest, isClean } from './lib/audit-snapshot.mjs';

const AUDIT_REL = join('skills', 'audit-conventions', 'scripts', 'audit.mjs');

// Resolve the audit's location without pinning a plugin version. A hard-coded
// .../gvt-dev/4.22.0/... path rots on the next plugin bump — which is exactly
// when the residue counts move and this script matters most.
function resolveAuditPath(argv) {
  const flagAt = argv.indexOf('--audit');
  if (flagAt !== -1) {
    const value = argv[flagAt + 1];
    if (!value) {
      console.error('--audit needs a path');
      process.exit(2);
    }
    return value;
  }
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    return join(process.env.CLAUDE_PLUGIN_ROOT, AUDIT_REL);
  }
  console.error(
    'Cannot locate audit.mjs. Set CLAUDE_PLUGIN_ROOT to the installed gvt-dev\n' +
      'plugin root, or pass --audit <path to audit.mjs>.',
  );
  process.exit(2);
}

const auditPath = resolveAuditPath(process.argv.slice(2));

const run = spawnSync(process.execPath, [auditPath], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

if (run.error) {
  console.error(`Could not run the audit at ${auditPath}: ${run.error.message}`);
  process.exit(2);
}

const digest = parseAuditOutput(run.stdout, run.status);
console.log(formatDigest(digest));

if (!isClean(digest)) {
  console.error(
    '\nThe audit output could not be parsed. The counts above are NOT a clean\n' +
      "result — treat PARSE-FAILED as 'unknown', never as zero. The audit's\n" +
      'report format has most likely drifted; re-check the patterns in\n' +
      'scripts/lib/audit-snapshot.mjs against its current output.',
  );
  process.exit(1);
}
