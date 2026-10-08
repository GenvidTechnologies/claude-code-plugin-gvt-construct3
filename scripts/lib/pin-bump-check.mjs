// Pure verdict logic for the pin-bump verification script (issue #148). No
// filesystem, no child process, no network: the CLI counterpart
// (scripts/pin-bump-check.mjs) installs packages into sealed directories,
// runs `npm view`, reads files, and hands the results to these functions.
//
// The organising rule is wiki/pin-bump-verification.md's "three ways this
// check fakes a pass": a check must never turn a failure to LOOK into a
// clean verdict. So every comparison here has three outcomes, not two, and
// the third ('error') is never reported as identical/pass:
//   - a side that could not be read is 'error', not "no differences";
//   - an empty corpus is 'error', not "nothing differs";
//   - an empty / unresolved range is 'error', not "no versions outside".
// The report also prints the corpus behind each verdict (how many files per
// side) so a reader can tell "compared 12 files" from "compared nothing".

const SEMVER = /^\d+\.\d+\.\d+$/;

function semverCmp(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * Parse the `// Reviewed baseline: {a, b, c}.` line out of audit.mjs source.
 * Only the braces are parsed; prose after the closing brace is ignored.
 * @param {string} auditSourceText
 * @returns {string[]} versions sorted by semver
 */
export function parseReviewedBaseline(auditSourceText) {
  const re = /^\s*\/\/\s*Reviewed baseline:\s*\{([^}]*)\}/gm;
  const matches = [...String(auditSourceText).matchAll(re)];
  if (matches.length === 0) {
    throw new Error('no "// Reviewed baseline: {...}" line found');
  }
  if (matches.length > 1) {
    throw new Error(`expected exactly one "Reviewed baseline" line, found ${matches.length}`);
  }
  const members = matches[0][1].split(',').map((s) => s.trim());
  for (const m of members) {
    if (!SEMVER.test(m)) {
      throw new Error(`Reviewed baseline member "${m}" is not x.y.z`);
    }
  }
  return [...new Set(members)].sort(semverCmp);
}

/**
 * @typedef {{ ok: true, bytes: Uint8Array } | { ok: false, error: string }} Side
 */

/**
 * Compare two byte payloads. A side that failed to read is 'error' — never
 * 'identical'.
 * @param {Side} a
 * @param {Side} b
 * @returns {{ verdict: 'identical'|'different'|'error', detail: string }}
 */
export function compareBytes(a, b) {
  if (!a || !a.ok) {
    return { verdict: 'error', detail: `old side unreadable: ${a?.error ?? 'no result'}` };
  }
  if (!b || !b.ok) {
    return { verdict: 'error', detail: `new side unreadable: ${b?.error ?? 'no result'}` };
  }
  const x = a.bytes;
  const y = b.bytes;
  if (x.length !== y.length) {
    return { verdict: 'different', detail: `length ${x.length} vs ${y.length}` };
  }
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) {
      return { verdict: 'different', detail: `first difference at byte ${i}` };
    }
  }
  return { verdict: 'identical', detail: `${x.length} bytes` };
}

/**
 * Compare two sets of files keyed by relative POSIX path.
 * @param {Map<string, Uint8Array>|Record<string, Uint8Array>} oldMap
 * @param {Map<string, Uint8Array>|Record<string, Uint8Array>} newMap
 */
export function compareFileSets(oldMap, newMap) {
  const o = oldMap instanceof Map ? oldMap : new Map(Object.entries(oldMap ?? {}));
  const n = newMap instanceof Map ? newMap : new Map(Object.entries(newMap ?? {}));
  const identical = [];
  const different = [];
  const onlyOld = [];
  const onlyNew = [];
  for (const [path, bytes] of o) {
    if (!n.has(path)) {
      onlyOld.push(path);
      continue;
    }
    const r = compareBytes({ ok: true, bytes }, { ok: true, bytes: n.get(path) });
    (r.verdict === 'identical' ? identical : different).push(path);
  }
  for (const path of n.keys()) {
    if (!o.has(path)) onlyNew.push(path);
  }
  for (const list of [identical, different, onlyOld, onlyNew]) list.sort();
  const compared = { old: o.size, new: n.size };
  let verdict;
  if (o.size === 0 || n.size === 0) verdict = 'error';
  else if (different.length || onlyOld.length || onlyNew.length) verdict = 'different';
  else verdict = 'identical';
  return { compared, identical, different, onlyOld, onlyNew, verdict };
}

/**
 * Judge a dependency range against the reviewed baseline.
 * @param {{ range: string, resolvable: string[], baseline: string[] }} input
 * @returns {{ verdict: 'pass'|'fail'|'error', outside: string[], message: string }}
 */
export function evaluateRange({ range, resolvable, baseline }) {
  if (!Array.isArray(resolvable) || resolvable.length === 0) {
    return {
      verdict: 'error',
      outside: [],
      message: `range ${range} resolved to no published versions — cannot judge it`,
    };
  }
  const base = new Set(baseline ?? []);
  const outside = resolvable.filter((v) => !base.has(v)).sort(semverCmp);
  if (outside.length > 0) {
    return {
      verdict: 'fail',
      outside,
      message:
        `range ${range} FAILS procedurally — escalate per ADR 0009: ` +
        `resolvable version(s) outside the reviewed baseline: ${outside.join(', ')}`,
    };
  }
  return {
    verdict: 'pass',
    outside: [],
    message: `range ${range} resolves only to reviewed versions (${resolvable.join(', ')})`,
  };
}

/**
 * Normalise `npm view pkg@range version --json` output to an array.
 * @param {string} jsonText
 * @returns {string[]}
 */
export function normalizeNpmViewVersions(jsonText) {
  if (typeof jsonText !== 'string' || jsonText.trim() === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`npm view output is not JSON: ${err.message}`);
  }
  if (typeof parsed === 'string') return [parsed];
  if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) return parsed;
  throw new Error('npm view output is neither a string nor an array of strings');
}

export const DEFAULT_PACKAGE_FIELDS = [
  'bin',
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
  'main',
  'exports',
  'engines',
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
    return out;
  }
  return value;
}

/**
 * Fields of package.json that differ (key order ignored).
 * @returns {{ field: string, old: unknown, new: unknown }[]}
 */
export function diffPackageFields(oldPkg, newPkg, fields = DEFAULT_PACKAGE_FIELDS) {
  const out = [];
  for (const field of fields) {
    const a = JSON.stringify(canonical(oldPkg?.[field]) ?? null);
    const b = JSON.stringify(canonical(newPkg?.[field]) ?? null);
    if (a !== b) out.push({ field, old: oldPkg?.[field], new: newPkg?.[field] });
  }
  return out;
}

/** The `@genvidtech/mcp-utils` range declared in dependencies, or undefined. */
export function mcpUtilsRange(pkg) {
  return pkg?.dependencies?.['@genvidtech/mcp-utils'];
}

/**
 * Every line containing `version` as a whole token. Hits are not classified.
 * @param {{ path: string, text: string }[]} files
 * @param {string} version
 * @returns {{ path: string, line: number, text: string }[]}
 */
export function sweepPinSites(files, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Not glued to a longer number on either side: 10.11.1 and 0.11.10 must not
  // match 0.11.1, but a sentence-ending "." after the version is fine.
  const re = new RegExp(`(?<!\\d)(?<!\\d\\.)${escaped}(?!\\d)(?!\\.\\d)`);
  const hits = [];
  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) hits.push({ path: file.path, line: i + 1, text: lines[i] });
    }
  }
  hits.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
  return hits;
}

// 'informational' is a check that reports facts a bump is EXPECTED to change
// (dist differences, package.json fields, pin-site hits); it never fails the run.
// A check that could not be performed is 'error', not 'informational'.
const GOOD = new Set(['pass', 'identical', 'not-applicable', 'informational']);

/**
 * 0 only if every check is pass/identical/not-applicable/informational.
 * @param {{ checks: { verdict: string }[] }} result
 */
export function exitCodeFor(result) {
  const checks = result?.checks;
  if (!Array.isArray(checks) || checks.length === 0) return 1;
  return checks.every((c) => GOOD.has(c.verdict)) ? 0 : 1;
}

/**
 * Render a result as text lines. Each check is
 * `{ name, verdict, message?, fileSet?, details? }` where `fileSet` is the
 * output of compareFileSets. An 'error' verdict is rendered as ERROR and
 * never as identical/PASS.
 * @returns {string[]}
 */
export function formatReport(result) {
  const lines = [];
  for (const c of result?.checks ?? []) {
    const label = c.verdict === 'error' ? 'ERROR' : String(c.verdict).toUpperCase();
    lines.push(`[${label}] ${c.name}${c.message ? ` - ${c.message}` : ''}`);
    if (c.fileSet) {
      const fs = c.fileSet;
      lines.push(`  corpus: ${fs.compared.old} file(s) old, ${fs.compared.new} file(s) new`);
      if (fs.verdict !== 'error') {
        lines.push(`  matching: ${fs.identical.length}`);
      }
      for (const p of fs.different) lines.push(`  differs: ${p}`);
      for (const p of fs.onlyOld) lines.push(`  only in old: ${p}`);
      for (const p of fs.onlyNew) lines.push(`  only in new: ${p}`);
    }
    for (const d of c.details ?? []) lines.push(`  ${d}`);
  }
  lines.push(exitCodeFor(result) === 0 ? 'overall: OK' : 'overall: NOT OK');
  return lines;
}
