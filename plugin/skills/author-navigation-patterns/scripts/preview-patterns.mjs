#!/usr/bin/env node
// CLI: preview how candidate navigation patterns behave against DSL text.
//
// Usage:
//   node preview-patterns.mjs \
//     --pattern 'GoToLayout\("([^"]+)"' \
//     --marker  'function GoToLayout' \
//     --wrapper GoToLayout \
//     --dsl path/to/file-or-dir
//
// Also accepts --config <path> to read navigation.targetPatterns /
// navigation.definitionMarkers from a construct3-chef.config.json.
//
// --pattern / --marker may be repeated.
// --dsl may be repeated or point to a directory (reads .dsl.txt / .txt / .ts).
//
// Exit: 0 on success, 1 on usage error.

import { promises as fs } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { classifyLines, renderReport } from './lib/nav-patterns.mjs';
import { selectDslPaths } from './lib/dsl-files.mjs';

// ---- arg parsing ------------------------------------------------------------

function parseArgs(argv) {
  const patterns = [];
  const markers = [];
  const dslPaths = [];
  let wrapperName = null;
  let configPath = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--pattern':
        if (!argv[i + 1]) fatal('--pattern requires a value');
        patterns.push(argv[++i]);
        break;
      case '--marker':
        if (!argv[i + 1]) fatal('--marker requires a value');
        markers.push(argv[++i]);
        break;
      case '--wrapper':
        if (!argv[i + 1]) fatal('--wrapper requires a value');
        wrapperName = argv[++i];
        break;
      case '--dsl':
        if (!argv[i + 1]) fatal('--dsl requires a value');
        dslPaths.push(argv[++i]);
        break;
      case '--config':
        if (!argv[i + 1]) fatal('--config requires a value');
        configPath = argv[++i];
        break;
      default:
        if (arg.startsWith('-')) fatal(`Unknown flag: ${arg}`);
    }
  }

  return { patterns, markers, dslPaths, wrapperName, configPath };
}

function fatal(msg) {
  console.error(`error: ${msg}`);
  console.error(
    'Usage: preview-patterns.mjs [--pattern <regex>]... [--marker <substr>]... [--wrapper <name>] [--dsl <path>]... [--config <path>]',
  );
  process.exit(1);
}

// ---- config reading ---------------------------------------------------------

async function loadConfig(configPath) {
  const raw = await fs.readFile(configPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fatal(`Could not parse config JSON at ${configPath}: ${err.message}`);
  }
  const nav = parsed.navigation ?? {};
  return {
    targetPatterns: Array.isArray(nav.targetPatterns) ? nav.targetPatterns : [],
    definitionMarkers: Array.isArray(nav.definitionMarkers) ? nav.definitionMarkers : [],
  };
}

// ---- DSL file collection ----------------------------------------------------

async function collectDslFiles(inputPath) {
  const absPath = resolve(inputPath);
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    fatal(`--dsl path not found: ${inputPath}`);
  }

  if (stat.isFile()) {
    return [absPath];
  }

  if (stat.isDirectory()) {
    const entries = await fs.readdir(absPath, { withFileTypes: true, recursive: true });
    const files = selectDslPaths(entries);
    if (files.length === 0) {
      console.error(
        `warning: --dsl directory '${inputPath}' contained no DSL files (.dsl.txt/.txt/.ts) — scanned nothing, not "matched nothing"`,
      );
    }
    return files;
  }

  fatal(`--dsl path is neither a file nor a directory: ${inputPath}`);
}

async function readDslText(filePaths) {
  if (filePaths.length === 0) return '';

  const parts = [];
  for (const p of filePaths) {
    const text = await fs.readFile(p, 'utf8');
    parts.push(`// --- ${basename(p)} ---`);
    parts.push(text);
  }
  return parts.join('\n');
}

// ---- main -------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let targetPatterns = [...args.patterns];
  let definitionMarkers = [...args.markers];

  // Merge from config if provided
  if (args.configPath) {
    const cfg = await loadConfig(resolve(args.configPath));
    // CLI flags take precedence; config fills in only what is absent
    if (targetPatterns.length === 0) targetPatterns = cfg.targetPatterns;
    if (definitionMarkers.length === 0) definitionMarkers = cfg.definitionMarkers;
  }

  // Collect DSL files
  let dslText = '';
  if (args.dslPaths.length > 0) {
    const allFiles = [];
    for (const p of args.dslPaths) {
      const files = await collectDslFiles(p);
      allFiles.push(...files);
    }
    dslText = await readDslText(allFiles);
  }

  const result = classifyLines(dslText, {
    targetPatterns,
    definitionMarkers,
    wrapperName: args.wrapperName,
  });

  console.log(renderReport(result));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('preview-patterns error:', err.message);
    process.exit(1);
  });
}

export { collectDslFiles };
