// node --test preview-patterns.test.mjs
// Integration tests for collectDslFiles() in preview-patterns.mjs — verifies
// the CLI's --dsl directory scan recurses into nested trees (issue #45) and
// emits a non-fatal stderr warning when a scanned directory contains no DSL
// files.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { collectDslFiles } from '../preview-patterns.mjs';

let tmpDir;

before(async () => {
  tmpDir = await fs.mkdtemp(join(tmpdir(), 'nav-preview-'));

  // Nested layout:
  //   <tmp>/root.txt
  //   <tmp>/eventSheets/ignore.json
  //   <tmp>/eventSheets/domain/sheet.dsl.txt
  await fs.writeFile(join(tmpDir, 'root.txt'), '// root\n');

  const eventSheetsDir = join(tmpDir, 'eventSheets');
  await fs.mkdir(eventSheetsDir, { recursive: true });
  await fs.writeFile(join(eventSheetsDir, 'ignore.json'), '{}');

  const domainDir = join(eventSheetsDir, 'domain');
  await fs.mkdir(domainDir, { recursive: true });
  await fs.writeFile(join(domainDir, 'sheet.dsl.txt'), '// nested sheet\n');
});

after(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('collectDslFiles: recurses into nested directories and excludes non-DSL files', async () => {
  const files = await collectDslFiles(tmpDir);

  const expectedNested = resolve(join(tmpDir, 'eventSheets', 'domain', 'sheet.dsl.txt'));
  const expectedRoot = resolve(join(tmpDir, 'root.txt'));
  const unexpectedIgnored = resolve(join(tmpDir, 'eventSheets', 'ignore.json'));

  const sorted = [...files].sort();

  assert.ok(
    sorted.includes(expectedNested),
    `expected nested file ${expectedNested} to be found; got ${JSON.stringify(sorted)}`,
  );
  assert.ok(
    sorted.includes(expectedRoot),
    `expected root file ${expectedRoot} to be found; got ${JSON.stringify(sorted)}`,
  );
  assert.ok(
    !sorted.includes(unexpectedIgnored),
    `did not expect non-DSL file ${unexpectedIgnored} to be found; got ${JSON.stringify(sorted)}`,
  );
});

test('collectDslFiles: warns to stderr (non-fatal) when a directory contains no DSL files', async () => {
  const emptyDir = join(tmpDir, 'empty-subdir');
  await fs.mkdir(emptyDir, { recursive: true });

  const originalConsoleError = console.error;
  const messages = [];
  console.error = (...args) => {
    messages.push(args.join(' '));
  };

  let files;
  try {
    files = await collectDslFiles(emptyDir);
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(files, []);
  assert.ok(
    messages.some((m) => m.includes(emptyDir)),
    `expected a stderr warning mentioning ${emptyDir}; got ${JSON.stringify(messages)}`,
  );
});
