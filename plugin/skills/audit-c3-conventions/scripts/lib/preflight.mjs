// Usability preflight for `@genvidtech/audit-core`, run by the thin
// `../audit.mjs` CLI before it dynamically imports `./audit.mjs` (the audit
// implementation, which depends on audit-core). The check is USABILITY, not
// directory presence — a partial/corrupt node_modules (missing a file inside
// the package, a broken `exports` map, etc.) must fail here too, so this
// probes with a real dynamic `import()` rather than checking that some
// directory exists. Never imports audit-core statically itself: doing so
// would defeat the whole point, since a static import failure at the top of
// a module throws before any of this code could run.
//
// Claude Code installs a copied marketplace plugin's npm dependencies
// (`npm ci --ignore-scripts`) into its cache automatically; a git checkout or
// a local-directory plugin does not get that treatment, so this is the
// failure most likely to hit a contributor running the audit straight out of
// a clone.

const PACKAGE = '@genvidtech/audit-core';

/**
 * Probes whether `@genvidtech/audit-core` can be imported.
 *
 * @param {object} [opts]
 * @param {(spec: string) => Promise<unknown>} [opts.importer] — injected in
 *   place of dynamic `import()`, so tests can simulate a failing or
 *   succeeding install without touching the real package.
 * @param {string} [opts.pluginRoot] — the plugin root, used only to render
 *   the `npm ci --prefix <root>` remediation hint; falls back to a generic
 *   placeholder when omitted.
 * @returns {Promise<{ ok: true } | { ok: false, message: string, exitCode: number }>}
 */
export async function preflight({ importer = (spec) => import(spec), pluginRoot } = {}) {
  try {
    await importer(PACKAGE);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: buildMessage(err, pluginRoot), exitCode: 2 };
  }
}

function buildMessage(err, pluginRoot) {
  const prefix = pluginRoot ? `npm ci --prefix ${pluginRoot} --ignore-scripts` : 'npm ci --prefix <plugin root> --ignore-scripts';
  const underlying = (err && err.message) || String(err);
  return [
    `error: cannot load ${PACKAGE} — this plugin's npm dependencies are not installed.`,
    `Claude Code installs them automatically when it copies a marketplace plugin into its cache; a git checkout or local-directory plugin needs a manual install: run \`${prefix}\`.`,
    `underlying error: ${underlying}`,
  ].join('\n');
}
