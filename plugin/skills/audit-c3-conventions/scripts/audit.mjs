#!/usr/bin/env node
// Validates the consuming repo against the genvid-c3 plugin's convention
// contract. Checks:
//   1. C3-project marker (project.c3proj present, or .genvid-agent.json
//      features.c3 === true, or paths.c3project pointing at an existing file)
//   2. MCP servers reachable at minimum versions (construct3-chef >= 0.4.0,
//      c3-domain-manager >= 0.1.1) — probed via `npx -y <package> --version`
//   3. Walk plugin skills/agents metadata.expects (files, config, tools, mcp)
//
// Read-only — no --fix / migration mode.
//
// Exit code: 0 if all required expectations are satisfied; 1 if any error
// finding; 2 on unexpected script error.

import { promises as fs, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { extractFrontmatter } from './lib/frontmatter.mjs';
import { resolveKey } from './lib/config-resolve.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// scripts -> audit-c3-conventions -> skills -> plugin root
const PLUGIN_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');

const REPO_ROOT = process.cwd();

async function main() {
  const components = await walkComponents(PLUGIN_ROOT);
  const findings = [];

  // 1. C3-project marker check (bespoke OR-check across three indicators)
  findings.push(await checkC3Marker(REPO_ROOT));

  // 2. Walk component expects: files, config, tools, mcp
  for (const component of components) {
    const expects = component.expects;
    if (!expects) continue;

    for (const entry of expects.files ?? []) {
      findings.push(await evaluateFile(component, entry));
    }
    for (const entry of expects.config ?? []) {
      findings.push(await evaluateConfig(component, entry));
    }
    for (const entry of expects.tools ?? []) {
      findings.push(evaluateTool(component, entry));
    }
    for (const entry of expects.mcp ?? []) {
      findings.push(await evaluateMcp(component, entry));
    }
  }

  const report = formatReport(findings);
  console.log(report);

  const hasErrors = findings.some((f) => f.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

// ---- C3 marker check --------------------------------------------------------

async function checkC3Marker(repoRoot) {
  const COMPONENT = 'genvid-c3';
  const KIND = 'marker';
  const REASON =
    'genvid-c3 only applies to Construct 3 projects; this repo does not look like one.';

  // Option A: project.c3proj exists
  const c3projPath = join(repoRoot, 'project.c3proj');
  if (await fileExists(c3projPath)) {
    return { kind: KIND, component: COMPONENT, target: 'project.c3proj', ok: true };
  }

  // Option B / C: .genvid-agent.json
  const agentJsonPath = join(repoRoot, '.genvid-agent.json');
  let parsed = null;
  try {
    const raw = await fs.readFile(agentJsonPath, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    // Either file missing or invalid JSON — fall through to error
  }

  if (parsed !== null) {
    // Option B: features.c3 === true
    const featuresResult = resolveKey(parsed, 'features.c3');
    if (featuresResult.found && featuresResult.value === true) {
      return {
        kind: KIND,
        component: COMPONENT,
        target: '.genvid-agent.json features.c3',
        ok: true,
      };
    }

    // Option C: paths.c3project points at existing file
    const pathsResult = resolveKey(parsed, 'paths.c3project');
    if (pathsResult.found && typeof pathsResult.value === 'string') {
      const override = resolve(repoRoot, pathsResult.value);
      if (await fileExists(override)) {
        return {
          kind: KIND,
          component: COMPONENT,
          target: `paths.c3project → ${pathsResult.value}`,
          ok: true,
        };
      }
    }
  }

  return {
    kind: KIND,
    component: COMPONENT,
    target: 'C3-project marker',
    ok: false,
    severity: 'error',
    detail:
      'No C3-project marker found (need `project.c3proj`, or `.genvid-agent.json` `features.c3: true`, or `paths.c3project`)',
    reason: REASON,
  };
}

// ---- walk -------------------------------------------------------------------

async function walkComponents(pluginRoot) {
  const components = [];

  const skillsDir = join(pluginRoot, 'skills');
  if (await dirExists(skillsDir)) {
    const skills = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of skills) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(skillsDir, entry.name, 'SKILL.md');
      if (!(await fileExists(skillFile))) continue;
      const component = await loadComponent('skill', entry.name, skillFile);
      if (component) components.push(component);
    }
  }

  const agentsDir = join(pluginRoot, 'agents');
  if (await dirExists(agentsDir)) {
    const agents = await fs.readdir(agentsDir, { withFileTypes: true });
    for (const entry of agents) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const name = entry.name.replace(/\.md$/, '');
      const component = await loadComponent('agent', name, join(agentsDir, entry.name));
      if (component) components.push(component);
    }
  }

  return components;
}

async function loadComponent(type, name, filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const fm = extractFrontmatter(content);
  if (!fm) return { type, name, expects: null };
  return { type, name, expects: fm.metadata?.expects ?? null };
}

// ---- evaluate ---------------------------------------------------------------

export async function evaluateFile(component, entry, repoRoot = REPO_ROOT) {
  const required = entry.required !== false;
  const path = join(repoRoot, entry.path);
  const exists = await fileExists(path);

  if (exists) {
    return { kind: 'file', component: component.name, target: entry.path, ok: true };
  }
  return {
    kind: 'file',
    component: component.name,
    target: entry.path,
    ok: false,
    severity: required ? 'error' : 'info',
    detail: `file not found${required ? '' : ' (optional)'}`,
    reason: entry.reason,
  };
}

export async function evaluateConfig(component, entry, repoRoot = REPO_ROOT) {
  const required = entry.required !== false;
  const inFile = entry.in ?? '.genvid-agent.json';
  const filePath = join(repoRoot, inFile);

  let parsed;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      kind: 'config',
      component: component.name,
      target: `${entry.key} in ${inFile}`,
      ok: false,
      severity: required ? 'error' : 'info',
      detail:
        err.code === 'ENOENT'
          ? `${inFile} not found`
          : `${inFile} unreadable (${err.message})`,
      reason: entry.reason,
    };
  }

  const result = resolveKey(parsed, entry.key);
  if (result.found) {
    return {
      kind: 'config',
      component: component.name,
      target: `${entry.key} in ${inFile}`,
      ok: true,
    };
  }
  return {
    kind: 'config',
    component: component.name,
    target: `${entry.key} in ${inFile}`,
    ok: false,
    severity: required ? 'error' : 'info',
    detail: `key not found (path broke at "${result.missingAt}")${required ? '' : ' (optional)'}`,
    reason: entry.reason,
  };
}

function evaluateTool(component, entry) {
  const required = entry.required !== false;
  const exists = commandExists(entry.command);

  if (exists) {
    return { kind: 'tool', component: component.name, target: entry.command, ok: true };
  }
  return {
    kind: 'tool',
    component: component.name,
    target: entry.command,
    ok: false,
    severity: required ? 'error' : 'info',
    detail: `command not found on PATH${required ? '' : ' (optional)'}`,
    reason: entry.reason,
  };
}

async function evaluateMcp(component, entry) {
  const required = entry.required !== false;
  const server = entry.server;
  const minVersion = entry.minVersion;
  const pkg = entry.package; // npm package name backing the bin (e.g. @genvid/construct3-chef)

  const fail = (detail) => ({
    kind: 'mcp',
    component: component.name,
    target: server,
    ok: false,
    severity: required ? 'error' : 'info',
    detail,
    reason: entry.reason,
  });

  // 1. Reachability — confirm the package actually runs via npx (the same way
  //    the plugin's plugin.json launches it: `npx -y <package> server`). npx
  //    resolves by *package* name, so we probe the scoped `package` (e.g.
  //    @genvid/construct3-chef), not the bare bin name — `npx construct3-chef`
  //    would 404. Fall back to the bin name only when no package is declared.
  const probeTarget = pkg ?? server;
  let result;
  try {
    result = spawnSync('npx', ['-y', probeTarget, '--version'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
  } catch (err) {
    return fail(`MCP server \`${server}\` not reachable via npx (${err.message})`);
  }
  if (result.status !== 0) {
    return fail(`MCP server \`${server}\` not reachable via npx`);
  }

  // 2. Version — resolve from the installed package.json. Both CLIs currently
  //    report `--version` as "unknown" (yargs default), so the bin output is an
  //    unreliable source; the installed package.json is authoritative. Fall back
  //    to parsing the --version output in case a future CLI wires a real version.
  let found = pkg ? resolvePackageVersion(pkg, REPO_ROOT) : null;
  if (!found) {
    const m = (result.stdout ?? '').match(/(\d+)\.(\d+)\.(\d+)/);
    if (m) found = `${m[1]}.${m[2]}.${m[3]}`;
  }
  if (!found) {
    return fail(
      `\`${server}\` is reachable but its version could not be determined` +
        (pkg ? ` (could not resolve ${pkg}/package.json)` : ' (no package name declared)'),
    );
  }

  if (minVersion && !semverGte(found, minVersion)) {
    return fail(`\`${server}\` is ${found}, needs >= ${minVersion}`);
  }

  return { kind: 'mcp', component: component.name, target: server, ok: true, detail: found };
}

// Resolve an installed package's version by walking node_modules from the
// consuming repo upward. Reads package.json directly (not via require.resolve)
// so a package `exports` map that omits `./package.json` can't block us, and
// walking up handles monorepo hoisting to a parent node_modules.
function resolvePackageVersion(pkgName, repoRoot) {
  let dir = repoRoot;
  for (;;) {
    const pkgJsonPath = join(dir, 'node_modules', pkgName, 'package.json');
    try {
      return JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version ?? null;
    } catch {
      // not here — climb to the parent
    }
    const parent = dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

// ---- semver comparison ------------------------------------------------------

function semverGte(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return true; // equal
}

// ---- helpers ----------------------------------------------------------------

async function fileExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

async function dirExists(path) {
  try {
    const s = await fs.stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

function commandExists(cmd) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [cmd], { stdio: 'pipe' });
  return result.status === 0;
}

// ---- report -----------------------------------------------------------------

function formatReport(findings) {
  const errors = findings.filter((f) => f.severity === 'error');
  const infos = findings.filter((f) => f.severity === 'info');
  const oks = findings.filter((f) => f.ok);
  // Required = all findings that aren't 'info'-severity (includes oks, which have no severity)
  const requiredTotal = findings.filter((f) => f.severity !== 'info').length;

  const lines = [];
  lines.push('## genvid-c3 Audit Results');
  lines.push('');

  if (errors.length > 0) {
    lines.push('### Errors (must fix)');
    for (const f of errors) lines.push(formatFinding(f));
    lines.push('');
  }
  if (infos.length > 0) {
    lines.push('### Info (optional)');
    for (const f of infos) lines.push(formatFinding(f));
    lines.push('');
  }

  lines.push('### Summary');
  lines.push(`- ${oks.length} of ${requiredTotal} required expectations satisfied.`);
  if (errors.length > 0) {
    lines.push(
      `- ${errors.length} required expectation${errors.length === 1 ? '' : 's'} unmet.`,
    );
  }
  if (infos.length > 0) {
    lines.push(
      `- ${infos.length} optional expectation${infos.length === 1 ? '' : 's'} unmet.`,
    );
  }

  return lines.join('\n');
}

function formatFinding(f) {
  const target =
    f.kind === 'tool'
      ? `tool \`${f.target}\``
      : f.kind === 'mcp'
        ? `MCP server \`${f.target}\``
        : `\`${f.target}\``;
  const reason = f.reason ? ` Reason: ${f.reason}` : '';
  return `- **${f.component}** expects ${target} — ${f.detail}.${reason}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('audit failed:', err);
    process.exit(2);
  });
}
