#!/usr/bin/env node
// merge.mjs — join CDN-sourced builtin ACE shape with manual-PDF descriptions
// and write the merged builtin-aces.json consumed by build-index.mjs --aces.
//
// The CDN allAces.json (via fetch-aces.mjs) provides the authoritative ACE
// shape — objectClass, kind, id, scriptName, params — but carries no prose.
// This script overlays human-readable descriptions extracted from the C3 manual
// PDF (or equivalent) onto those CDN records, then writes the joined array.
// Unmatched ACEs pass through unchanged — the CDN shape is always authoritative.
//
// Usage:
//   node merge.mjs \
//     --aces <extractedDir>/cdn-aces.json \
//     --descriptions <extractedDir>/descriptions.json \
//     --out <extractedDir>/builtin-aces.json \
//     [--alias-map <file>]
//
// --aces <file>         : cdn-aces.json array produced by fetch-aces.mjs (required)
// --descriptions <file> : JSON array of manual records
//                         { objectClass, kind, name, description, canonicalUrl? }
//                         (required)
// --alias-map <file>    : JSON object { cdnKey: manualSlug } for objectClass name
//                         mismatches between CDN and the manual.  If omitted the
//                         built-in DEFAULT_ALIAS_MAP is used:
//                           { system: "System", TiledBg: "tiled-background",
//                             NinePatch: "9-patch" }
//                         If supplied the file's object REPLACES (not merges over)
//                         the default — supply all necessary aliases explicitly.
// --out <file>          : destination path for the merged builtin-aces.json (required)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { joinDescriptions } from './lib/merge.mjs';

// Default alias map for documented C3 CDN-vs-manual objectClass mismatches.
// cdnKey (CDN objectClass) → manualSlug (manual objectClass).
const DEFAULT_ALIAS_MAP = {
  system: 'System',
  TiledBg: 'tiled-background',
  NinePatch: '9-patch',
};

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

function readJsonObject(file, label) {
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
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`--${label}: ${file} must contain a JSON object (got ${Array.isArray(parsed) ? 'array' : typeof parsed})`);
  }
  return parsed;
}

function printCoverage(coverage) {
  const { total, matched, unmatched, tier1, tier2, byObjectClass } = coverage;
  const pct = total > 0 ? ((matched / total) * 100).toFixed(1) : '0.0';
  const lines = [
    `Coverage: ${matched}/${total} ACEs matched (${pct}%)`,
    `  tier1 (exact name):  ${tier1}`,
    `  tier2 (token-subset): ${tier2}`,
    `  unmatched:           ${unmatched}`,
    `By objectClass (sorted):`,
  ];

  const sortedOCs = Object.keys(byObjectClass).sort((a, b) => a.localeCompare(b));
  for (const oc of sortedOCs) {
    const { total: ocTotal, matched: ocMatched } = byObjectClass[oc];
    lines.push(`  ${oc}: ${ocMatched}/${ocTotal}`);
  }

  console.log(lines.join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.aces || args.aces === 'true') {
    console.error('Error: --aces <file> is required (cdn-aces.json from fetch-aces.mjs)');
    process.exit(2);
  }
  if (!args.descriptions || args.descriptions === 'true') {
    console.error('Error: --descriptions <file> is required (manual description records)');
    process.exit(2);
  }
  if (!args.out || args.out === 'true') {
    console.error('Error: --out <file> is required (destination for builtin-aces.json)');
    process.exit(2);
  }

  let cdnAces;
  let descriptions;
  try {
    cdnAces = readJsonArray(args.aces, 'aces');
    descriptions = readJsonArray(args.descriptions, 'descriptions');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }

  // Resolve alias map: file overrides default entirely (not merged).
  let aliasMap = DEFAULT_ALIAS_MAP;
  if (args['alias-map'] && args['alias-map'] !== 'true') {
    try {
      aliasMap = readJsonObject(args['alias-map'], 'alias-map');
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(2);
    }
  }

  let result;
  try {
    result = joinDescriptions(cdnAces, descriptions, aliasMap);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const outPath = path.resolve(args.out);
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result.aces, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.error(`Error: failed to write ${outPath}: ${err.message}`);
    process.exit(1);
  }

  printCoverage(result.coverage);
  console.log(`Wrote ${outPath}`);
}

main();
