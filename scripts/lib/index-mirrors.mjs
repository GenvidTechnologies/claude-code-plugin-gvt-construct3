// Pure, disk-free helpers for checking that an index row's description text
// mirrors the frontmatter `description` of the page it links to.
//
// Convention (wiki/decisions/index.md:9-13, wiki/index.md:15-16): each row
// mirrors its target's frontmatter `description` VERBATIM. A later page's
// amendment is appended AFTER the mirrored text, never spliced into it. So a
// row is conforming iff its (whitespace-normalised) text equals the
// description exactly, or starts with it followed by an appended annotation.
//
// This module does no I/O: callers read files and pass their raw text in.

const ROW_RE = /^\*\s+\[([^\]]+)\]\(([^)]+)\)\s+-\s+(.*)$/;
const BLOCK_SCALAR_INDICATORS = new Set(['>-', '>', '>+', '|-', '|', '|+']);
const DESCRIPTION_KEY_RE = /^description:\s*(.*)$/;
const TOP_LEVEL_KEY_RE = /^[A-Za-z_][A-Za-z0-9_-]*:/;

/** Collapse all whitespace runs to a single space and trim. */
export function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * All index rows in `content`, in document order. Row shape:
 * `* [Title](target.md) - description text`. The link target is returned
 * exactly as written (relative to the index file's own directory — resolving
 * it is the caller's job, since this module never touches paths on disk).
 *
 * Returns `[{ line, title, file, rawText }]` (1-based `line`).
 */
export function parseIndexRows(content) {
  const lines = content.split(/\r?\n/);
  const rows = [];
  lines.forEach((line, idx) => {
    const m = ROW_RE.exec(line);
    if (!m) return;
    rows.push({ line: idx + 1, title: m[1], file: m[2], rawText: m[3] });
  });
  return rows;
}

/**
 * Extracts the frontmatter `description` from a page's raw content.
 *
 * Handles a folded/literal block scalar (`description: >-` etc., with
 * indented continuation lines that get space-joined) and a plain or quoted
 * inline scalar (`description: some text` / `description: "some text"`).
 *
 * A file "has no frontmatter" when its first line is not `---`.
 *
 * Returns `{ hasFrontmatter, hasDescription, description }`. `description` is
 * already whitespace-normalised, or `null` when absent.
 */
export function extractFrontmatterDescription(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') {
    return { hasFrontmatter: false, hasDescription: false, description: null };
  }

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;

    const m = DESCRIPTION_KEY_RE.exec(lines[i]);
    if (!m) continue;

    const inline = m[1].trim();

    if (BLOCK_SCALAR_INDICATORS.has(inline)) {
      const body = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j] === '---') break;
        if (TOP_LEVEL_KEY_RE.test(lines[j])) break; // a new key ends the block
        if (lines[j].trim() === '') {
          body.push('');
          continue;
        }
        if (!/^\s/.test(lines[j])) break;
        body.push(lines[j].trim());
      }
      return { hasFrontmatter: true, hasDescription: true, description: normalizeWhitespace(body.join(' ')) };
    }

    let value = inline;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return { hasFrontmatter: true, hasDescription: true, description: normalizeWhitespace(value) };
  }

  return { hasFrontmatter: true, hasDescription: false, description: null };
}

/**
 * Classifies one index row against its target's description info (as
 * returned by `extractFrontmatterDescription`, plus an `exists` flag the
 * caller sets after resolving the row's link target on disk).
 *
 * Outcomes:
 * - `exact` — row text equals the description verbatim (after normalising).
 * - `appended` — row text starts with the description; the remainder is a
 *   legal appended annotation.
 * - `skipped` — the target file has no frontmatter at all. Never folded into
 *   `exact`.
 * - `diverged` — anything else, including a missing target file or a target
 *   whose frontmatter has no `description` key at all (both are reported via
 *   a `reason` rather than a text diff, since there is no description to
 *   diff against).
 */
export function classifyRow(rowText, target) {
  if (!target.exists) {
    return { outcome: 'diverged', reason: 'target file does not exist', description: null };
  }
  if (!target.hasFrontmatter) {
    return { outcome: 'skipped', reason: 'target has no frontmatter' };
  }
  if (!target.hasDescription) {
    return { outcome: 'diverged', reason: 'target frontmatter has no description key', description: null };
  }

  const normalizedRow = normalizeWhitespace(rowText);
  const description = target.description;

  if (normalizedRow === description) {
    return { outcome: 'exact' };
  }
  if (normalizedRow.startsWith(description)) {
    return { outcome: 'appended', annotation: normalizedRow.slice(description.length).trim() };
  }
  return { outcome: 'diverged', reason: 'text is not a verbatim mirror', description, rowText: normalizedRow };
}

/**
 * Checks every row of an index file's content against a `targets` lookup.
 *
 * `targets` is a `Map` keyed by the row's link target exactly as written
 * (i.e. `row.file`), whose values are `{ exists, hasFrontmatter,
 * hasDescription, description }` — the caller resolves paths and reads files,
 * this function stays disk-free. A row whose file has no entry in `targets`
 * is treated as `exists: false`.
 *
 * Returns `{ rows, counts }`, where `rows` is each parsed row merged with its
 * classification outcome, and `counts` tallies `exact`, `appended`,
 * `skipped`, and `diverged`.
 */
export function checkIndex(content, targets) {
  const rows = parseIndexRows(content).map((row) => {
    const target = targets.get(row.file) ?? { exists: false };
    return { ...row, ...classifyRow(row.rawText, target) };
  });

  const counts = { exact: 0, appended: 0, skipped: 0, diverged: 0 };
  for (const row of rows) counts[row.outcome]++;

  return { rows, counts };
}
