import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeWhitespace,
  parseIndexRows,
  extractFrontmatterDescription,
  classifyRow,
  checkIndex,
} from '../lib/index-mirrors.mjs';

test('normalizeWhitespace collapses whitespace runs (including newlines) to a single space and trims', () => {
  assert.equal(normalizeWhitespace('  a   b\n  c \t d  '), 'a b c d');
});

test('parseIndexRows extracts title, file, and raw description text, in document order', () => {
  const content = [
    '# Some Index',
    '',
    '* [First Page](first.md) - first description text.',
    '* [Second Page](second.md) - second description text.',
    'not a row',
  ].join('\n');

  assert.deepEqual(parseIndexRows(content), [
    { line: 3, title: 'First Page', file: 'first.md', rawText: 'first description text.' },
    { line: 4, title: 'Second Page', file: 'second.md', rawText: 'second description text.' },
  ]);
});

test('extractFrontmatterDescription: a folded block scalar (description: >-) collapses continuation lines to one space-joined line', () => {
  const content = [
    '---',
    'title: Example',
    'description: >-',
    '  This sentence spans',
    '  several indented lines',
    '  in the source file.',
    'tags: [a, b]',
    '---',
    '# Example',
  ].join('\n');

  const result = extractFrontmatterDescription(content);
  assert.equal(result.hasFrontmatter, true);
  assert.equal(result.hasDescription, true);
  assert.equal(result.description, 'This sentence spans several indented lines in the source file.');
});

test('extractFrontmatterDescription: a plain inline scalar on one line is read verbatim', () => {
  const content = [
    '---',
    'title: Example',
    'description: A single-line inline description, unquoted.',
    'tags: [a, b]',
    '---',
    '# Example',
  ].join('\n');

  const result = extractFrontmatterDescription(content);
  assert.equal(result.hasFrontmatter, true);
  assert.equal(result.hasDescription, true);
  assert.equal(result.description, 'A single-line inline description, unquoted.');
});

test('extractFrontmatterDescription: a quoted inline scalar has its surrounding quotes stripped', () => {
  const content = ['---', 'description: "A quoted description."', '---'].join('\n');

  const result = extractFrontmatterDescription(content);
  assert.equal(result.hasDescription, true);
  assert.equal(result.description, 'A quoted description.');
});

test('extractFrontmatterDescription: a file whose first line is not "---" has no frontmatter at all', () => {
  const content = ['# Just A Heading', '', 'Some prose, no frontmatter.'].join('\n');

  const result = extractFrontmatterDescription(content);
  assert.equal(result.hasFrontmatter, false);
  assert.equal(result.hasDescription, false);
  assert.equal(result.description, null);
});

test('extractFrontmatterDescription: frontmatter present but no description key', () => {
  const content = ['---', 'title: Example', 'tags: [a]', '---', '# Example'].join('\n');

  const result = extractFrontmatterDescription(content);
  assert.equal(result.hasFrontmatter, true);
  assert.equal(result.hasDescription, false);
  assert.equal(result.description, null);
});

// --- classifyRow / checkIndex: the four required outcomes -----------------

test('classifyRow: DIVERGES when the row text does not match the description (negative control)', () => {
  const target = { exists: true, hasFrontmatter: true, hasDescription: true, description: 'The real description.' };
  const result = classifyRow('A completely different sentence.', target);
  assert.equal(result.outcome, 'diverged');
  assert.equal(result.description, 'The real description.');
});

test('classifyRow: SKIPPED when the target has no frontmatter at all, and this is never folded into exact (negative control)', () => {
  const target = { exists: true, hasFrontmatter: false, hasDescription: false, description: null };
  const result = classifyRow('Whatever the index row happens to say.', target);
  assert.equal(result.outcome, 'skipped');
  assert.notEqual(result.outcome, 'exact');
});

test('classifyRow: APPENDED when the row mirrors the description and then appends an annotation', () => {
  const target = {
    exists: true,
    hasFrontmatter: true,
    hasDescription: true,
    description: 'The base description.',
  };
  const result = classifyRow('The base description. **(Amended by 0099.)**', target);
  assert.equal(result.outcome, 'appended');
  assert.equal(result.annotation, '**(Amended by 0099.)**');
});

test('classifyRow: EXACT when the row matches the description exactly', () => {
  const target = { exists: true, hasFrontmatter: true, hasDescription: true, description: 'Matches exactly.' };
  const result = classifyRow('Matches exactly.', target);
  assert.equal(result.outcome, 'exact');
});

test('classifyRow: a whitespace-normalisation case — a folded scalar spanning multiple indented lines still classifies as EXACT against a single-line row', () => {
  const content = [
    '---',
    'description: >-',
    '  This sentence spans',
    '  several indented lines.',
    '---',
  ].join('\n');
  const { description } = extractFrontmatterDescription(content);
  assert.equal(description, 'This sentence spans several indented lines.');

  const target = { exists: true, hasFrontmatter: true, hasDescription: true, description };
  const result = classifyRow('This sentence spans several indented lines.', target);
  assert.equal(result.outcome, 'exact');
});

test('classifyRow: a missing target file diverges, without crashing, and carries no description to diff', () => {
  const target = { exists: false, hasFrontmatter: false, hasDescription: false, description: null };
  const result = classifyRow('Some row text.', target);
  assert.equal(result.outcome, 'diverged');
  assert.equal(result.description, null);
});

test('classifyRow: a target with frontmatter but no description key diverges, without crashing', () => {
  const target = { exists: true, hasFrontmatter: true, hasDescription: false, description: null };
  const result = classifyRow('Some row text.', target);
  assert.equal(result.outcome, 'diverged');
  assert.equal(result.description, null);
});

test('checkIndex: tallies each row against its target and counts every outcome, end to end', () => {
  const content = [
    '* [Exact](exact.md) - The exact description.',
    '* [Appended](appended.md) - The base description. **(Amended.)**',
    '* [Skipped](skipped.md) - Anything at all.',
    '* [Diverged](diverged.md) - Not what the frontmatter says.',
  ].join('\n');

  const targets = new Map([
    ['exact.md', { exists: true, hasFrontmatter: true, hasDescription: true, description: 'The exact description.' }],
    ['appended.md', { exists: true, hasFrontmatter: true, hasDescription: true, description: 'The base description.' }],
    ['skipped.md', { exists: true, hasFrontmatter: false, hasDescription: false, description: null }],
    ['diverged.md', { exists: true, hasFrontmatter: true, hasDescription: true, description: 'Something else entirely.' }],
  ]);

  const { rows, counts } = checkIndex(content, targets);
  assert.deepEqual(counts, { exact: 1, appended: 1, skipped: 1, diverged: 1 });
  assert.equal(rows.find((r) => r.file === 'exact.md').outcome, 'exact');
  assert.equal(rows.find((r) => r.file === 'appended.md').outcome, 'appended');
  assert.equal(rows.find((r) => r.file === 'skipped.md').outcome, 'skipped');
  assert.equal(rows.find((r) => r.file === 'diverged.md').outcome, 'diverged');
});

test('checkIndex: a row whose target is absent from the targets map diverges instead of crashing', () => {
  const content = '* [Missing](missing.md) - Some text.';
  const { rows, counts } = checkIndex(content, new Map());
  assert.equal(counts.diverged, 1);
  assert.equal(rows[0].outcome, 'diverged');
  assert.equal(rows[0].reason, 'target file does not exist');
});
