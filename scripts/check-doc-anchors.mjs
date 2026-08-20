#!/usr/bin/env node
// Dev-workspace intra-repo markdown anchor checker.
//
// NOT part of the shipped plugin/ artifact and NOT wired into
// .gvt-agent.json's commands.validate — run it directly, e.g.:
//
//   node scripts/check-doc-anchors.mjs plugin/docs/c3/*.md
//
// Exits 1 if any dead anchor is found, 0 otherwise.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkAnchors, findLinkTargets } from './lib/doc-anchors.mjs';

const argvPaths = process.argv.slice(2);

const byResolvedPath = new Map();

function load(path) {
  const resolved = resolve(path);
  if (byResolvedPath.has(resolved)) return byResolvedPath.get(resolved);
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  const entry = { path, content };
  byResolvedPath.set(resolved, entry);
  return entry;
}

// Load the files given on the command line. These are the only link
// sources: only links that originate in one of these files get checked.
const primary = argvPaths.map((path) => load(path)).filter(Boolean);

// A file passed on the command line may link into a file that wasn't itself
// passed (e.g. checking a single agent doc that links into
// plugin/docs/c3/construct3-guide.md#...). Load those cross-file targets too
// — one hop, from the command-line files only — so their headings are
// available for anchor lookup. This does NOT make the discovered file a
// link source: its own outgoing links (including any dead ones) stay out of
// scope for this invocation, so this invocation's dead=0 is a claim about
// the command-line files' links, not an artifact of which other files
// happened to get pulled in along the way.
for (const { path, content } of primary) {
  for (const link of findLinkTargets(content)) {
    if (!link.file) continue;
    load(resolve(dirname(path), link.file));
  }
}

const files = [...byResolvedPath.values()];
const linkSources = primary.map(({ path }) => path);

const { checked, dead, deadLines } = checkAnchors(files, { linkSources });

for (const { file, line, target } of deadLines) {
  console.log(`DEAD ${file}:${line} -> ${target}`);
}
console.log(`checked=${checked} dead=${dead}`);

process.exitCode = dead > 0 ? 1 : 0;
