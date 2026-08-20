// Pure, disk-free helpers for checking intra-repo markdown anchor links.
//
// These mirror GitHub's heading-slug algorithm closely enough to catch dead
// anchors in this repo's docs: lowercase, strip punctuation that isn't a
// letter/number/space/hyphen/underscore, then turn each whitespace run into
// hyphens one-for-one. That last step is what produces GitHub's well-known
// double-hyphen artifact — a stripped character sitting between two spaces
// (e.g. an em dash: "Async — Signal") leaves both spaces behind, so the slug
// gets "async--signal", not "async-signal". This is real GitHub behavior,
// not a bug to smooth over.

import { dirname, resolve } from 'node:path';

const EXTERNAL_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LINK_RE = /\]\(([^)\s]+)\)/g;

/** GitHub's heading-slug rule. */
export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Strip markdown inline markup (links, backticks, emphasis) from heading text before slugging. */
export function stripInline(heading) {
  return heading
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '');
}

/**
 * All `#`..`######` headings in `content`, converted to GitHub-style slugs,
 * fence-aware (headings inside ``` or ~~~ blocks are ignored), with duplicate
 * slugs suffixed `-1`, `-2`, … in document order.
 */
export function extractHeadingSlugs(content) {
  const lines = content.split(/\r?\n/);
  const slugs = [];
  const seen = new Map();
  let fenceChar = null;

  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fenceChar = fenceChar === marker ? null : (fenceChar === null ? marker : fenceChar);
      continue;
    }
    if (fenceChar) continue;

    const m = HEADING_RE.exec(line);
    if (!m) continue;

    const base = slugify(stripInline(m[2]));
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    slugs.push(count ? `${base}-${count}` : base);
  }

  return slugs;
}

/**
 * All markdown link targets in `content`, one entry per link, in document
 * order. Skips external-scheme links (`http:`, `https:`, `mailto:`,
 * `construct3-chef:`, or any other `scheme:` form).
 */
export function findLinkTargets(content) {
  const lines = content.split(/\r?\n/);
  const results = [];

  lines.forEach((line, idx) => {
    LINK_RE.lastIndex = 0;
    let m;
    while ((m = LINK_RE.exec(line))) {
      const raw = m[1];
      if (EXTERNAL_SCHEME_RE.test(raw)) continue;
      const hashIdx = raw.indexOf('#');
      const file = hashIdx === -1 ? raw : raw.slice(0, hashIdx);
      const anchor = hashIdx === -1 ? null : raw.slice(hashIdx + 1);
      results.push({ line: idx + 1, file, anchor: anchor || null, raw });
    }
  });

  return results;
}

/**
 * Checks markdown links in `files` (an array of `{ path, content }`) against
 * the heading anchors of each link's resolved target, restricted to the
 * files present in `files` itself:
 *
 * - A link's target file is resolved relative to the *linking* file's own
 *   directory.
 * - A link to a file not present in `files` is skipped entirely (not
 *   counted, not dead) — anchor checking is only meaningful within the
 *   passed set.
 * - A link with no anchor is counted but can never be dead.
 *
 * By default every entry in `files` plays both roles: it is an *anchor
 * source* (its headings are indexed, so other files' links into it can be
 * resolved) and a *link source* (its own outgoing links are scanned and
 * counted). Pass `{ linkSources }` — an iterable of the paths that should be
 * treated as link sources — to narrow that second role: any file in `files`
 * whose path is not in `linkSources` still contributes its headings (anchor
 * source) but its own links are never scanned or counted (not a link
 * source). This lets a caller pre-load a file purely to resolve anchors
 * *into* it without pulling that file's own outgoing links — including any
 * dead ones — into scope.
 *
 * Returns `{ checked, dead, deadLines: [{ file, line, target }] }`.
 */
export function checkAnchors(files, { linkSources } = {}) {
  const headingIndex = new Map();
  const pathSet = new Set();
  for (const { path, content } of files) {
    const resolved = resolve(path);
    pathSet.add(resolved);
    headingIndex.set(resolved, extractHeadingSlugs(content));
  }

  // null means "every file is a link source" (the back-compat default).
  const linkSourceSet = linkSources ? new Set([...linkSources].map((p) => resolve(p))) : null;

  let checked = 0;
  let dead = 0;
  const deadLines = [];

  for (const { path, content } of files) {
    if (linkSourceSet && !linkSourceSet.has(resolve(path))) continue;

    const links = findLinkTargets(content);
    for (const link of links) {
      const targetPath = link.file ? resolve(dirname(path), link.file) : resolve(path);
      if (!pathSet.has(targetPath)) continue;

      checked++;
      if (!link.anchor) continue;

      const slugs = headingIndex.get(targetPath) || [];
      if (!slugs.includes(link.anchor)) {
        dead++;
        deadLines.push({ file: path, line: link.line, target: link.raw });
      }
    }
  }

  return { checked, dead, deadLines };
}
