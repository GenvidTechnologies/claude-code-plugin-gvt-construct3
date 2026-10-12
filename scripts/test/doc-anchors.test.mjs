import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  slugify,
  stripInline,
  extractHeadingSlugs,
  findLinkTargets,
  checkAnchors,
} from '../lib/doc-anchors.mjs';

test('slugify + stripInline reproduce GitHub\'s double-hyphen rule (real repo heading)', () => {
  // plugin/docs/c3/construct3-guide.md:657 — this exact heading, and the
  // anchor plugin/agents/c3-implementer.md:115 links against it, are live in
  // the repo today, so this is a positive control: it proves the slugger
  // matches GitHub, not just itself.
  const heading = "JSON Plugin `set-json` Parses Async — Signal from `on-parse-success`";
  const slug = slugify(stripInline(heading));
  assert.equal(slug, 'json-plugin-set-json-parses-async--signal-from-on-parse-success');
});

test('extractHeadingSlugs ignores headings inside fenced code blocks', () => {
  const content = [
    '# Real Heading',
    '',
    '```',
    '# Not A Heading',
    '## Also Not A Heading',
    '```',
    '',
    '## Another Real Heading',
  ].join('\n');

  assert.deepEqual(extractHeadingSlugs(content), ['real-heading', 'another-real-heading']);
});

test('extractHeadingSlugs ignores headings inside tilde-fenced code blocks', () => {
  const content = [
    '# Real Heading',
    '~~~',
    '# Not A Heading',
    '~~~',
    '## Another Real Heading',
  ].join('\n');

  assert.deepEqual(extractHeadingSlugs(content), ['real-heading', 'another-real-heading']);
});

test('extractHeadingSlugs suffixes duplicate heading text with -1, -2, ... in document order', () => {
  const content = [
    '## Setup',
    '## Setup',
    '## Setup',
  ].join('\n');

  assert.deepEqual(extractHeadingSlugs(content), ['setup', 'setup-1', 'setup-2']);
});

test('checkAnchors resolves same-file (#anchor) and cross-file (./other.md#anchor) links', () => {
  const a = {
    path: 'docs/a.md',
    content: [
      '# Section A',
      '',
      'See [self](#section-a) and [other](./b.md#section-b).',
    ].join('\n'),
  };
  const b = {
    path: 'docs/b.md',
    content: '# Section B',
  };

  const result = checkAnchors([a, b]);
  assert.equal(result.checked, 2);
  assert.equal(result.dead, 0);
  assert.deepEqual(result.deadLines, []);
});

test('checkAnchors reports a genuinely dead anchor with the correct file and 1-based line number', () => {
  const a = {
    path: 'docs/a.md',
    content: [
      '# Section A',
      '',
      'See [missing](./b.md#does-not-exist).',
    ].join('\n'),
  };
  const b = {
    path: 'docs/b.md',
    content: '# Section B',
  };

  const result = checkAnchors([a, b]);
  assert.equal(result.checked, 1);
  assert.equal(result.dead, 1);
  assert.deepEqual(result.deadLines, [
    { file: 'docs/a.md', line: 3, target: './b.md#does-not-exist' },
  ]);
});

test('findLinkTargets skips external-scheme links entirely', () => {
  const content = [
    '[https](https://example.com/x)',
    '[http](http://example.com/x)',
    '[mail](mailto:someone@example.com)',
    '[chef](construct3-chef:some-tool)',
    '[local](./other.md#anchor)',
  ].join('\n');

  const links = findLinkTargets(content);
  assert.deepEqual(
    links.map((l) => l.raw),
    ['./other.md#anchor'],
  );
});

test('checkAnchors: a link to a file outside the passed set is skipped, not counted as dead', () => {
  const a = {
    path: 'docs/a.md',
    content: 'See [elsewhere](./not-included.md#whatever).',
  };

  const result = checkAnchors([a]);
  assert.equal(result.checked, 0);
  assert.equal(result.dead, 0);
});

test('checkAnchors: a link with no anchor is counted but never dead', () => {
  const a = {
    path: 'docs/a.md',
    content: 'See [other file](./b.md).',
  };
  const b = { path: 'docs/b.md', content: '# Section B' };

  const result = checkAnchors([a, b]);
  assert.equal(result.checked, 1);
  assert.equal(result.dead, 0);
});

test('checkAnchors: linkSources scopes which files\' own links are checked, not which files can be anchor targets', () => {
  // b.md is an anchor-lookup target for a.md's link (a valid one), AND it
  // carries its own dead link. Whether that dead link surfaces depends only
  // on whether b.md is passed in linkSources -- not on whether b.md happens
  // to be present in `files` (it always is, in both calls below).
  const a = {
    path: 'docs/a.md',
    content: 'See [valid](./b.md#section-b).',
  };
  const b = {
    path: 'docs/b.md',
    content: [
      '# Section B',
      '',
      'See [dead](#does-not-exist).',
    ].join('\n'),
  };

  // b.md pre-loaded as an anchor source only (not a link source): its own
  // dead link must NOT be reported, and must not even be counted.
  const anchorOnly = checkAnchors([a, b], { linkSources: ['docs/a.md'] });
  assert.equal(anchorOnly.checked, 1); // only a.md's link into b.md
  assert.equal(anchorOnly.dead, 0);
  assert.deepEqual(anchorOnly.deadLines, []);

  // Same two files, but now b.md IS a link source too: its dead link must
  // be reported.
  const bothSources = checkAnchors([a, b], { linkSources: ['docs/a.md', 'docs/b.md'] });
  assert.equal(bothSources.checked, 2); // a.md's link + b.md's own link
  assert.equal(bothSources.dead, 1);
  assert.deepEqual(bothSources.deadLines, [
    { file: 'docs/b.md', line: 3, target: '#does-not-exist' },
  ]);
});

// ---- CLI: an input that would check nothing must not read as a pass ------------

const CLI = resolve(fileURLToPath(new URL('..', import.meta.url)), 'check-doc-anchors.mjs');

function runCli(argv) {
  return spawnSync(process.execPath, [CLI, ...argv], { encoding: 'utf8' });
}

test('check-doc-anchors CLI: no paths → usage error, exit 2, no checked= line', () => {
  const r = runCli([]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: node scripts\/check-doc-anchors\.mjs/);
  assert.doesNotMatch(r.stdout, /checked=/);
});

test('check-doc-anchors CLI: an unreadable path → exit 2 naming it, even beside a good file', () => {
  const dir = mkdtempSync(join(realpathSync.native(tmpdir()), 'doc-anchors-cli-'));
  try {
    const good = join(dir, 'good.md');
    writeFileSync(good, '# Title\n\n[self](#title)\n');
    const missing = join(dir, 'missing.md');
    const r = runCli([good, missing]);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes(`UNREADABLE ${missing}`));
    assert.doesNotMatch(r.stdout, /checked=/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check-doc-anchors CLI: a readable file with a live anchor → exit 0, checked=1 dead=0', () => {
  const dir = mkdtempSync(join(realpathSync.native(tmpdir()), 'doc-anchors-cli-'));
  try {
    const good = join(dir, 'good.md');
    writeFileSync(good, '# Title\n\n[self](#title)\n');
    const r = runCli([good]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /checked=1 dead=0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
