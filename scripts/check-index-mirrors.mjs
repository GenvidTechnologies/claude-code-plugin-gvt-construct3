#!/usr/bin/env node
// Dev-workspace index-mirror checker.
//
// NOT part of the shipped plugin/ artifact and NOT wired into
// .gvt-agent.json's commands.validate — run it directly, e.g.:
//
//   node scripts/check-index-mirrors.mjs
//   node scripts/check-index-mirrors.mjs wiki/decisions/index.md wiki/index.md
//
// Checks that every row of an index file mirrors the frontmatter
// `description` of the page it links to (wiki/decisions/index.md:9-13,
// wiki/index.md:15-16). With no arguments, checks the two known indexes.
// Exits 1 if any index has a diverged row, 0 otherwise. A `skipped` row
// (target has no frontmatter at all, e.g. a subdirectory index.md) never
// fails the run on its own.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { parseIndexRows, extractFrontmatterDescription, checkIndex } from './lib/index-mirrors.mjs';

const DEFAULT_INDEXES = ['wiki/decisions/index.md', 'wiki/index.md'];

const indexPaths = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_INDEXES;

function loadTarget(path) {
  if (!existsSync(path)) {
    return { exists: false, hasFrontmatter: false, hasDescription: false, description: null };
  }
  const content = readFileSync(path, 'utf8');
  const { hasFrontmatter, hasDescription, description } = extractFrontmatterDescription(content);
  return { exists: true, hasFrontmatter, hasDescription, description };
}

let anyDiverged = false;

for (const indexPath of indexPaths) {
  const indexContent = readFileSync(indexPath, 'utf8');
  const indexDir = dirname(indexPath);

  const rows = parseIndexRows(indexContent);
  const targets = new Map();
  for (const row of rows) {
    if (targets.has(row.file)) continue;
    targets.set(row.file, loadTarget(resolve(join(indexDir, row.file))));
  }

  const { rows: results, counts } = checkIndex(indexContent, targets);

  console.log(`== ${indexPath} ==`);
  console.log(
    `rows=${results.length} exact=${counts.exact} appended=${counts.appended} skipped=${counts.skipped} diverged=${counts.diverged}`,
  );

  for (const row of results) {
    if (row.outcome === 'exact') continue;

    if (row.outcome === 'skipped') {
      console.log(`SKIPPED ${indexPath}:${row.line} -> ${row.file}  (${row.reason})`);
      continue;
    }

    if (row.outcome === 'appended') {
      console.log(`APPENDED ${indexPath}:${row.line} -> ${row.file}  (+ "${row.annotation}")`);
      continue;
    }

    // diverged
    console.log(`DIVERGED ${indexPath}:${row.line} -> ${row.file}  (${row.reason})`);
    if (row.description !== null) {
      console.log('  --- target frontmatter description ---');
      console.log(`  ${row.description}`);
      console.log('  --- index row text ---');
      console.log(`  ${row.rowText}`);
    }
  }

  console.log('');

  if (counts.diverged > 0) anyDiverged = true;
}

process.exitCode = anyDiverged ? 1 : 0;
