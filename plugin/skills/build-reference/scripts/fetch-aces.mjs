#!/usr/bin/env node
// fetch-aces.mjs — download C3 editor CDN allAces.json documents and flatten
// them into a cdn-aces.json record file the build-index merge step will consume.
//
// Fetches both `plugins/allAces.json` and `behaviors/allAces.json` from the C3
// editor CDN for a given revision, flattens each via flattenAllAces(), concatenates
// the records, and writes the result as a JSON array to --out.
//
// Usage — network mode (requires Node 18+ global fetch):
//   node fetch-aces.mjs --rev r476-4 --out <extractedDir>/cdn-aces.json
//
// Usage — offline / testing mode (reads a single local allAces.json file):
//   node fetch-aces.mjs --input /path/to/allAces.json --out /tmp/cdn-aces.json
//
// Exactly one of --rev or --input must be supplied (error + exit 2 if neither or
// both are given). --out is always required.
//
// --rev <rev>   : fetch from https://editor.construct.net/<rev>/plugins/allAces.json
//                 and   https://editor.construct.net/<rev>/behaviors/allAces.json
//                 A 404 usually means the <rev> is stale/wrong — re-read it from
//                 the editor's network tab.
// --input <file>: read a single local allAces.json, flatten it, and write records.
//                 Useful for testing the flatten path without network access.
// --out <file>  : destination path for the cdn-aces.json record array.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { flattenAllAces } from './lib/cdn-aces.mjs';

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

async function fetchAllAces(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
  if (!res.ok) {
    const hint =
      res.status === 404
        ? ' (404 likely means the --rev is stale/wrong — re-read it from the editor\'s network tab)'
        : '';
    throw new Error(`HTTP ${res.status} fetching ${url}${hint}`);
  }
  let json;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(`Failed to parse JSON from ${url}: ${err.message}`);
  }
  return json;
}

function readLocalJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    throw new Error(`--input: cannot read ${file}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`--input: ${file} is not valid JSON: ${err.message}`);
  }
  return parsed;
}

function summarize(records, pluginsCount, behaviorsCount) {
  const byKind = {};
  for (const rec of records) {
    byKind[rec.kind] = (byKind[rec.kind] ?? 0) + 1;
  }
  const kindSummary = Object.entries(byKind)
    .map(([k, n]) => `${k}:${n}`)
    .join(', ');
  const lines = [
    `cdn-aces: ${records.length} records total`,
  ];
  if (pluginsCount !== null && behaviorsCount !== null) {
    lines.push(`  plugins: ${pluginsCount} records, behaviors: ${behaviorsCount} records`);
  }
  if (kindSummary) {
    lines.push(`  by kind: ${kindSummary}`);
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const hasRev = args.rev && args.rev !== 'true';
  const hasInput = args.input && args.input !== 'true';

  if (!hasRev && !hasInput) {
    console.error('Error: exactly one of --rev <rev> or --input <file> is required');
    process.exit(2);
  }
  if (hasRev && hasInput) {
    console.error('Error: --rev and --input are mutually exclusive; supply exactly one');
    process.exit(2);
  }
  if (!args.out || args.out === 'true') {
    console.error('Error: --out <file> is required');
    process.exit(2);
  }

  let records;
  let pluginsCount = null;
  let behaviorsCount = null;

  if (hasRev) {
    const rev = args.rev;
    const base = `https://editor.construct.net/${rev}`;
    const pluginsUrl = `${base}/plugins/allAces.json`;
    const behaviorsUrl = `${base}/behaviors/allAces.json`;

    let pluginsJson, behaviorsJson;
    try {
      pluginsJson = await fetchAllAces(pluginsUrl);
      behaviorsJson = await fetchAllAces(behaviorsUrl);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }

    let pluginsRecords, behaviorsRecords;
    try {
      pluginsRecords = flattenAllAces(pluginsJson);
      behaviorsRecords = flattenAllAces(behaviorsJson);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }

    pluginsCount = pluginsRecords.length;
    behaviorsCount = behaviorsRecords.length;
    records = [...pluginsRecords, ...behaviorsRecords];
  } else {
    // Offline mode — single local file
    let json;
    try {
      json = readLocalJson(args.input);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(2);
    }
    try {
      records = flattenAllAces(json);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  const outPath = path.resolve(args.out);
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(records, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.error(`Error: failed to write ${outPath}: ${err.message}`);
    process.exit(1);
  }

  console.log(summarize(records, pluginsCount, behaviorsCount));
  console.log(`Wrote ${outPath}`);
}

main();
