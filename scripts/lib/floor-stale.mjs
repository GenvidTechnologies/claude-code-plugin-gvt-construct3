// Pure, disk-free helpers for detecting when a suite's declared file
// inventory or pass-count floor has drifted from what the suite actually
// contains.
//
// gate.mjs derives each suite's file-count floor from a declared `expect`
// list rather than a free-standing literal, so a missing declared file is
// still fatal (see checkGlobFloor in test-surface.mjs) but an undeclared
// PRESENT file no longer needs a matching literal bump to stay green — it is
// merely stale. This module answers "is the declared inventory stale?" and
// "has the pass-count floor fallen behind actual?", and reports both as a
// single non-fatal advisory line. It never signals failure on its own:
// `pass < minPass` stays the fatal condition owned by checkSuiteFloor in
// test-surface.mjs, and is deliberately NOT reproduced here.
//
// This module does no I/O: callers glob the files and run the suite, then
// pass the resulting paths, the declared inventory, and the pass counts in.

/**
 * Normalises a path's separators to `/`.
 *
 * `fs.globSync` returns platform-native separators — backslashes on Windows,
 * forward slashes on Linux/CI. A declared `expect` entry is always written
 * POSIX-style, so both sides of an inventory comparison are normalised
 * through this function before comparing; otherwise the comparison is green
 * on whichever platform it was written on and red everywhere else.
 */
export function toPosix(p) {
  return p.split('\\').join('/');
}

/**
 * Compares a glob's actual matches against a declared inventory.
 *
 * Both `files` and `expect` are normalised through `toPosix` before
 * comparing, so a Windows glob result and a POSIX-declared entry compare
 * equal. Returns `{ missing, unlisted }`:
 * - `missing` — declared in `expect` but not present in `files`;
 * - `unlisted` — present in `files` but not declared in `expect`.
 *
 * Both arrays are sorted, so output is deterministic regardless of glob or
 * declaration order.
 */
export function checkInventory(files, expect) {
  const actual = new Set(files.map(toPosix));
  const declared = new Set(expect.map(toPosix));

  const missing = [...declared].filter((f) => !actual.has(f)).sort();
  const unlisted = [...actual].filter((f) => !declared.has(f)).sort();

  return { missing, unlisted };
}

/**
 * Reports whether a suite's declared inventory or pass-count floor has gone
 * stale, and renders the pinned `STALE …` advisory when it has.
 *
 * Takes `{ name, unlisted, pass, minPass }` and returns `{ stale, message }`.
 * Staleness is advisory ONLY — never fatal, never thrown — and fires on
 * either or both of two independent conditions:
 * - `unlisted` non-empty: a present file is undeclared;
 * - `minPass < pass`: the pass-count floor has fallen behind actual.
 *
 * `pass < minPass` (the floor UNDER-performing actual) is the fatal
 * condition owned by `checkSuiteFloor` in test-surface.mjs and is
 * deliberately not reproduced or folded in here.
 *
 * The message is pinned to:
 *   STALE <name>: N unlisted test file(s): a, b; pass-count floor F < P actual
 * with only the applicable half(s) present, joined by `; ` when both apply.
 * It never contains the substrings `files matched:` or `FAIL `, so it cannot
 * be mistaken for either of gate.mjs's other pinned lines.
 */
export function checkFloorStale({ name, unlisted, pass, minPass }) {
  const parts = [];

  if (unlisted.length > 0) {
    parts.push(`${unlisted.length} unlisted test file(s): ${unlisted.join(', ')}`);
  }

  if (minPass < pass) {
    parts.push(`pass-count floor ${minPass} < ${pass} actual`);
  }

  if (parts.length === 0) {
    return { stale: false, message: '' };
  }

  return { stale: true, message: `STALE ${name}: ${parts.join('; ')}` };
}
