// Pure, disk-free checks for plugin/.claude-plugin/plugin.json's shape.
//
// This module does no I/O: callers read the file and JSON.parse it, then pass
// the resulting object in. That split is what makes the decisions
// unit-testable without touching disk, and keeps the parse-failure message
// (which names the file path — an I/O concern) in the CLI where it belongs.
//
// Checks:
//   - `name`, `version`, `description` are present and non-empty strings;
//   - `mcpServers` carries BOTH construct3-chef and c3-domain-manager, each
//     with an argument of the exact form `@genvidtech/<pkg>@<x.y.z>`. A range
//     (`^1.2.0`), a dist-tag (`latest`), or a bare package name is a failure:
//     the pin is the point (wiki/pin-bump-verification.md).

export const REQUIRED_KEYS = ['name', 'version', 'description'];
export const REQUIRED_SERVERS = ['construct3-chef', 'c3-domain-manager'];
export const SCOPE = '@genvidtech/';

/** A non-empty run of ASCII digits — no regex, no Number() coercion slack. */
function isDigits(text) {
  if (text.length === 0) return false;
  for (const ch of text) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

/**
 * `@genvidtech/<pkg>@<x.y.z>` → `{ pkg, version }`, else `null`.
 * The version must be exactly three numeric segments: anything carrying a
 * range operator or a dist-tag fails `isDigits` and is rejected.
 */
export function parsePinnedArg(arg) {
  if (typeof arg !== 'string' || !arg.startsWith(SCOPE)) return null;
  const at = arg.lastIndexOf('@');
  // Belt-and-suspenders, and NON-DISCRIMINATING — deliberately left in place,
  // but do not write a test for it: no input can distinguish its presence from
  // its absence, so any such test would pass either way.
  //
  // `startsWith(SCOPE)` above fixes the first 12 characters as `@genvidtech/`,
  // whose only `@` is at index 0. So this guard fires only when `at === 0`
  // (no second `@`), and in that case `pkg` is `''`, which the `pkg.length`
  // check two lines down already rejects. Every input that trips this line
  // trips that one too. Established by mutation testing during #127: fully
  // disabling this line leaves the whole suite green, and a 23-input sweep
  // (including `@genvidtech/@1.2.3` and `@genvidtech/` alone) found zero
  // behavioural disagreement between the two variants.
  if (at <= SCOPE.length - 1) return null;
  const pkg = arg.slice(0, at);
  const version = arg.slice(at + 1);
  if (pkg.length <= SCOPE.length) return null;
  const segments = version.split('.');
  if (segments.length !== 3 || !segments.every(isDigits)) return null;
  return { pkg, version };
}

/**
 * Validates an already-parsed manifest object.
 *
 * Returns `{ ok, problems, pins }`:
 * - `problems` is `{ key, message }[]`, in the order each check ran — the
 *   caller owns how (and to which stream) they're printed;
 * - `pins` is `{ key, pkg, version }[]`, one entry per required server whose
 *   pin resolved cleanly, in `REQUIRED_SERVERS` order.
 *
 * Never prints, never exits — a pure transform over one object.
 */
export function checkManifest(manifest) {
  const problems = [];
  const pins = [];

  function problem(key, message) {
    problems.push({ key, message });
  }

  for (const key of REQUIRED_KEYS) {
    const value = manifest[key];
    if (typeof value !== 'string' || value.trim() === '') {
      problem(key, 'missing or not a non-empty string');
    }
  }

  const servers = manifest.mcpServers;
  if (servers === null || typeof servers !== 'object' || Array.isArray(servers)) {
    problem('mcpServers', 'missing or not an object');
  } else {
    for (const name of REQUIRED_SERVERS) {
      const key = `mcpServers.${name}`;
      const server = servers[name];
      if (server === null || typeof server !== 'object' || Array.isArray(server)) {
        problem(key, 'missing or not an object');
        continue;
      }
      if (!Array.isArray(server.args)) {
        problem(`${key}.args`, 'missing or not an array');
        continue;
      }
      const pinned = server.args.map(parsePinnedArg).filter((p) => p !== null);
      if (pinned.length === 0) {
        problem(
          `${key}.args`,
          `no pinned ${SCOPE}<pkg>@<x.y.z> argument — got ${JSON.stringify(server.args)}`,
        );
        continue;
      }
      // The pinned package must be the one this server key names. Accepting any
      // pinned @genvidtech/* argument would pass a manifest that launches
      // c3-domain-manager under the construct3-chef key — a check that cannot tell
      // the two servers apart is not checking the pin, only its shape.
      const expected = `${SCOPE}${name}`;
      const match = pinned.find((p) => p.pkg === expected);
      if (!match) {
        problem(
          `${key}.args`,
          `pinned package does not match the server key — expected ${expected}, got ${pinned
            .map((p) => p.pkg)
            .join(', ')}`,
        );
        continue;
      }
      pins.push({ key, pkg: match.pkg, version: match.version });
    }
  }

  return { ok: problems.length === 0, problems, pins };
}
