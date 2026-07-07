// node --test dsl-files.test.mjs
// Unit tests for the dsl-files helper lib used by the
// author-navigation-patterns skill.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { isDslFile, selectDslPaths } from '../lib/dsl-files.mjs';

const dirent = (name, parentPath, isFile = true) => ({
  name,
  parentPath,
  isFile: () => isFile,
});

// ---- isDslFile ----------------------------------------------------------

test('isDslFile: .dsl.txt → true', () => {
  assert.equal(isDslFile('foo.dsl.txt'), true);
});

test('isDslFile: .txt → true', () => {
  assert.equal(isDslFile('foo.txt'), true);
});

test('isDslFile: .ts → true', () => {
  assert.equal(isDslFile('bar.ts'), true);
});

test('isDslFile: .json → false', () => {
  assert.equal(isDslFile('x.json'), false);
});

test('isDslFile: .png → false', () => {
  assert.equal(isDslFile('y.png'), false);
});

test('isDslFile: no extension → false', () => {
  assert.equal(isDslFile('noext'), false);
});

// ---- selectDslPaths -------------------------------------------------------

test('selectDslPaths: nested dirents use their own parentPath, not a shared root', () => {
  const dirents = [
    dirent('top.txt', join('root', 'a')),
    dirent('deep.dsl.txt', join('root', 'a', 'b', 'c')),
  ];

  const result = selectDslPaths(dirents);

  assert.deepEqual(result, [
    join('root', 'a', 'top.txt'),
    join('root', 'a', 'b', 'c', 'deep.dsl.txt'),
  ]);
});

test('selectDslPaths: directories are excluded even if the name looks like a DSL file', () => {
  const dirents = [
    dirent('looksLikeDsl.txt', join('root', 'a'), false),
    dirent('real.txt', join('root', 'a'), true),
  ];

  const result = selectDslPaths(dirents);

  assert.deepEqual(result, [join('root', 'a', 'real.txt')]);
});

test('selectDslPaths: non-DSL files are filtered out', () => {
  const dirents = [
    dirent('image.png', join('root', 'a')),
    dirent('data.json', join('root', 'a')),
    dirent('script.ts', join('root', 'a')),
  ];

  const result = selectDslPaths(dirents);

  assert.deepEqual(result, [join('root', 'a', 'script.ts')]);
});

test('selectDslPaths: empty input → empty output', () => {
  assert.deepEqual(selectDslPaths([]), []);
});
