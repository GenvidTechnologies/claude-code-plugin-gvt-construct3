#!/usr/bin/env node
// build-index.mjs — assemble + validate + write the construct3-chef c3-reference
// cache from extracted built-in-ACE and chunk record files.
//
// The PDF extraction itself is done by the build-reference SKILL (Claude reads the
// version-pinned manual PDF and emits intermediate JSON record files). This script
// is the deterministic seam: it reads those records, assembles a schema-valid
// `index.json`, validates it against chef's ReferenceIndexSchema shape (via the
// lib), and writes it to the gitignored cache. It NEVER fetches anything and never
// writes manual prose anywhere but the cache path.
//
// Usage:
//   node build-index.mjs \
//     --manual-version v1769 \
//     --out <extractedDir>/c3-reference/index.json \
//     [--aces builtin-aces.json] [--chunks chunks.json]
//
// --aces / --chunks point at JSON files each containing an array of records
// (built-in AceEntry objects / ChunkEntry objects). Either may be omitted (→ []).
// Records must already be in chef's schema shape; this script validates, it does
// not transform. (Custom-addon ACEs are NOT included — chef reads those live.)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { assembleIndex, validateReferenceIndex } from './lib/reference-index.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

function readJsonArray(file, label) {
  if (!file) return [];
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    throw new Error(`--${label}: cannot read ${file}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`--${label}: ${file} is not valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`--${label}: ${file} must contain a JSON array of records`);
  }
  return parsed;
}

function summarize(index) {
  const bySource = {};
  for (const ace of index.aces) {
    bySource[ace.source] = (bySource[ace.source] ?? 0) + 1;
  }
  const byCategory = {};
  for (const chunk of index.chunks) {
    byCategory[chunk.category] = (byCategory[chunk.category] ?? 0) + 1;
  }
  const lines = [
    `c3-reference index assembled (schemaVersion ${index.schemaVersion}, manual ${index.manualVersion})`,
    `- ACEs: ${index.aces.length}${Object.keys(bySource).length ? ` (${Object.entries(bySource).map(([s, n]) => `${s}:${n}`).join(', ')})` : ''}`,
    `- chunks: ${index.chunks.length}${Object.keys(byCategory).length ? ` (${Object.entries(byCategory).map(([c, n]) => `${c}:${n}`).join(', ')})` : ''}`,
  ];
  // Coverage honesty: surface that addon ACEs are intentionally absent.
  if (!index.aces.some((a) => a.source === 'addon')) {
    lines.push('- note: addon ACEs are NOT in this cache (chef reads addons/*/aces.json live).');
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args['manual-version']) {
    console.error('Error: --manual-version is required (e.g. --manual-version v1769)');
    process.exit(2);
  }
  if (!args.out) {
    console.error('Error: --out is required (e.g. --out extracted/c3-reference/index.json)');
    process.exit(2);
  }

  let aces;
  let chunks;
  try {
    aces = readJsonArray(args.aces === 'true' ? null : args.aces, 'aces');
    chunks = readJsonArray(args.chunks === 'true' ? null : args.chunks, 'chunks');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }

  let index;
  try {
    index = assembleIndex({
      manualVersion: args['manual-version'],
      generatedAt: new Date().toISOString(),
      aces,
      chunks,
    });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // Defensive re-validation of the serialized form before writing.
  const { valid, errors } = validateReferenceIndex(index);
  if (!valid) {
    console.error(`Error: assembled index failed validation:\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }

  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2) + '\n', 'utf-8');

  console.log(summarize(index));
  console.log(`Wrote ${outPath}`);
}

main();
