// Pure helpers for selecting DSL text files from a directory listing.
//
// No fs, no process — all pure functions on strings/arrays.

import { join, extname } from 'node:path';

// ---- isDslFile ---------------------------------------------------------------

/**
 * Decide whether a file name looks like a DSL text file.
 *
 * @param {string} name  File basename (not a full path).
 * @returns {boolean}
 */
export function isDslFile(name) {
  // Check for compound extension .dsl.txt first
  if (name.endsWith('.dsl.txt')) return true;
  const ext = extname(name);
  return ext === '.txt' || ext === '.ts';
}

// ---- selectDslPaths ----------------------------------------------------------

/**
 * Select DSL file paths from a recursive `fs.readdir(dir, { withFileTypes:
 * true, recursive: true })` listing (Node >= 20 semantics: each entry's
 * `.name` is only the basename, and `.parentPath` is the containing
 * directory — which may be nested arbitrarily deep below the scanned root).
 *
 * @param {Array<{ name: string, parentPath: string, isFile: () => boolean }>} dirents
 * @returns {string[]}  Full paths (parentPath joined with name) of DSL files.
 */
export function selectDslPaths(dirents) {
  return dirents
    .filter((e) => e.isFile() && isDslFile(e.name))
    .map((e) => join(e.parentPath, e.name));
}
