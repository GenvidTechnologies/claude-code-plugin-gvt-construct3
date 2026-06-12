// Pure helpers for assembling and validating the construct3-chef `c3-reference`
// cache document (`<extractedDir>/c3-reference/index.json`).
//
// This mirrors chef's `ReferenceIndexSchema` (dist/c3/c3Reference.js) so the
// build-reference skill can validate its output locally BEFORE writing the cache.
// It is a *preview* validator: chef's own `search-docs` (which runs
// `loadReferenceCache` + the live addon registry) is the authoritative check.
//
// Scope note (grounded in chef's aceRegistry.js / aceLookup.js): the cache holds
// `source:"builtin"` (and `"manual"`) ACEs plus prose chunks ONLY. Custom-addon
// ACEs are read LIVE by chef from `addons/*/aces.json` and merged at query time —
// writing them into the cache too would double-count them. This module therefore
// assembles built-in ACEs + chunks; it does not transform `aces.json`.
//
// No fs, no process — all pure functions. The CLI entry (build-index.mjs) owns I/O
// and the `generatedAt` timestamp.

export const SCHEMA_VERSION = 1;

const ACE_SOURCES = ['builtin', 'addon', 'manual'];
const ACE_KINDS = ['action', 'condition', 'expression'];
const CHUNK_CATEGORIES = ['layout', 'scripting', 'expression', 'plugin'];

// ---- low-level field checks -------------------------------------------------

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkString(obj, key, path, errors, { optional = false } = {}) {
  if (!(key in obj) || obj[key] === undefined) {
    if (!optional) errors.push(`${path}.${key}: required string is missing`);
    return;
  }
  if (typeof obj[key] !== 'string') {
    errors.push(`${path}.${key}: expected string, got ${typeof obj[key]}`);
  }
}

function checkEnum(obj, key, allowed, path, errors) {
  if (!(key in obj) || obj[key] === undefined) {
    errors.push(`${path}.${key}: required (one of ${allowed.join(', ')}) is missing`);
    return;
  }
  if (!allowed.includes(obj[key])) {
    errors.push(`${path}.${key}: ${JSON.stringify(obj[key])} not one of ${allowed.join(', ')}`);
  }
}

// ---- entry validators -------------------------------------------------------

/**
 * Validate one AceEntry against chef's AceEntrySchema (push errors, never throw).
 * Mirrors zod `.strip()` — unknown keys are tolerated, not rejected.
 */
export function validateAceEntry(entry, path, errors) {
  if (!isPlainObject(entry)) {
    errors.push(`${path}: expected object`);
    return;
  }
  checkEnum(entry, 'source', ACE_SOURCES, path, errors);
  checkString(entry, 'objectClass', path, errors);
  checkEnum(entry, 'kind', ACE_KINDS, path, errors);
  checkString(entry, 'id', path, errors);
  checkString(entry, 'scriptName', path, errors, { optional: true });
  checkString(entry, 'description', path, errors, { optional: true });
  checkString(entry, 'canonicalUrl', path, errors, { optional: true });

  if (!Array.isArray(entry.params)) {
    errors.push(`${path}.params: expected array of {name,type}`);
  } else {
    entry.params.forEach((p, i) => {
      const pPath = `${path}.params[${i}]`;
      if (!isPlainObject(p)) {
        errors.push(`${pPath}: expected object {name,type}`);
        return;
      }
      checkString(p, 'name', pPath, errors);
      checkString(p, 'type', pPath, errors);
    });
  }
}

/**
 * Validate one ChunkEntry against chef's ChunkEntrySchema. Note `canonicalUrl`
 * is REQUIRED for chunks (unlike ACEs, where it is optional).
 */
export function validateChunkEntry(entry, path, errors) {
  if (!isPlainObject(entry)) {
    errors.push(`${path}: expected object`);
    return;
  }
  checkString(entry, 'title', path, errors);
  checkString(entry, 'text', path, errors);
  checkString(entry, 'canonicalUrl', path, errors); // required
  checkEnum(entry, 'category', CHUNK_CATEGORIES, path, errors);
}

// ---- top-level validator ----------------------------------------------------

/**
 * Validate a full reference-index object against chef's ReferenceIndexSchema.
 *
 * @param {unknown} index
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateReferenceIndex(index) {
  const errors = [];

  if (!isPlainObject(index)) {
    return { valid: false, errors: ['index: expected an object'] };
  }

  if (typeof index.schemaVersion !== 'number') {
    errors.push('index.schemaVersion: expected number');
  }
  checkString(index, 'manualVersion', 'index', errors);
  checkString(index, 'generatedAt', 'index', errors);

  if ('aces' in index && index.aces !== undefined) {
    if (!Array.isArray(index.aces)) {
      errors.push('index.aces: expected array (or omit)');
    } else {
      index.aces.forEach((a, i) => validateAceEntry(a, `index.aces[${i}]`, errors));
    }
  }

  if ('chunks' in index && index.chunks !== undefined) {
    if (!Array.isArray(index.chunks)) {
      errors.push('index.chunks: expected array (or omit)');
    } else {
      index.chunks.forEach((c, i) => validateChunkEntry(c, `index.chunks[${i}]`, errors));
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---- assembler --------------------------------------------------------------

/**
 * Assemble a reference-index document from extracted built-in ACEs and chunks.
 * Pure: the caller supplies `generatedAt` (an ISO string) so this stays
 * deterministic and testable. Throws if the assembled document is invalid, so a
 * malformed input never reaches disk.
 *
 * @param {{
 *   manualVersion: string,
 *   generatedAt: string,
 *   aces?: object[],
 *   chunks?: object[],
 * }} input
 * @returns {object} a validated ReferenceIndex object
 */
export function assembleIndex({ manualVersion, generatedAt, aces = [], chunks = [] }) {
  const index = {
    schemaVersion: SCHEMA_VERSION,
    manualVersion,
    generatedAt,
    aces,
    chunks,
  };

  const { valid, errors } = validateReferenceIndex(index);
  if (!valid) {
    throw new Error(
      `assembleIndex: refusing to produce an invalid c3-reference index:\n- ${errors.join('\n- ')}`,
    );
  }
  return index;
}
