import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  probeSurface,
  diffSurfaces,
  formatReport,
  parsePackageSpec,
  resolveBinEntry,
} from '../lib/mcp-surface.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'mcp-surface.mjs');
const STUB_OK = join(__dirname, 'fixtures', 'stub-mcp-server.mjs');
const STUB_EXIT = join(__dirname, 'fixtures', 'stub-mcp-server-exit.mjs');

// ---------------------------------------------------------------------
// A fake in-process transport, driven synchronously from `onSend`. No real
// process and no stream is involved: `lines` is a small async generator fed
// by `push`, which is exactly what scripts/lib/mcp-surface.mjs's dispatcher
// needs to be exercised against.
// ---------------------------------------------------------------------

function ok(id, result) {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function errResp(id, code, message) {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

function createFakeTransport({ onSend, exited, stderrText = '' } = {}) {
  const queue = [];
  let waiting = null;

  function push(line) {
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(line);
    } else {
      queue.push(line);
    }
  }

  async function* lineGenerator() {
    for (;;) {
      if (queue.length > 0) {
        yield queue.shift();
      } else {
        yield await new Promise((resolve) => {
          waiting = resolve;
        });
      }
    }
  }

  const sent = [];
  const transport = {
    send(line) {
      sent.push(line);
      if (onSend) onSend(JSON.parse(line), push);
    },
    lines: lineGenerator(),
    exited: exited ?? new Promise(() => {}), // never settles unless the test provides one
    getStderr: () => stderrText,
  };

  return { transport, sent };
}

// The default happy-path handler: replies to every method with a minimal,
// non-empty result. Individual tests override just the method(s) they need
// to exercise a different branch.
function makeHandler(overrides = {}) {
  return (msg, push) => {
    if (overrides[msg.method]) {
      overrides[msg.method](msg, push);
      return;
    }
    switch (msg.method) {
      case 'initialize':
        push(ok(msg.id, { protocolVersion: '2025-06-18' }));
        break;
      case 'notifications/initialized':
        break;
      case 'tools/list':
        push(ok(msg.id, { tools: [{ name: 'alpha' }] }));
        break;
      case 'resources/list':
        push(ok(msg.id, { resources: [{ uri: 'docs:///alpha' }] }));
        break;
      case 'resources/templates/list':
        push(ok(msg.id, { resourceTemplates: [] }));
        break;
      default:
        break;
    }
  };
}

// ---------------------------------------------------------------------
// probeSurface
// ---------------------------------------------------------------------

test('probeSurface returns sorted tools/resources/templates, paginating tools/list via nextCursor', async () => {
  const { transport } = createFakeTransport({
    onSend: makeHandler({
      'tools/list': (msg, push) => {
        if (!msg.params.cursor) {
          push(ok(msg.id, { tools: [{ name: 'b_tool' }], nextCursor: 'page2' }));
        } else {
          push(ok(msg.id, { tools: [{ name: 'a_tool' }] }));
        }
      },
      'resources/list': (msg, push) => push(ok(msg.id, { resources: [{ uri: 'docs:///z' }, { uri: 'docs:///a' }] })),
      'resources/templates/list': (msg, push) => push(ok(msg.id, { resourceTemplates: [{ uriTemplate: 'docs:///{x}' }] })),
    }),
  });

  const result = await probeSurface(transport, { timeoutMs: 500 });

  assert.deepEqual(result.tools, ['a_tool', 'b_tool']);
  assert.deepEqual(result.resources, ['docs:///a', 'docs:///z']);
  assert.deepEqual(result.templates, ['docs:///{x}']);
});

test('probeSurface ignores stdout lines that are not valid JSON', async () => {
  const { transport } = createFakeTransport({
    onSend: makeHandler({
      initialize: (msg, push) => {
        push('a server log line, not JSON-RPC at all');
        push(ok(msg.id, {}));
      },
    }),
  });

  const result = await probeSurface(transport, { timeoutMs: 500 });
  assert.deepEqual(result.tools, ['alpha']);
});

test('probeSurface treats a -32601 on resources/templates/list as "unsupported" (null), not a failure', async () => {
  const { transport } = createFakeTransport({
    onSend: makeHandler({
      'resources/templates/list': (msg, push) => push(errResp(msg.id, -32601, 'Method not found')),
    }),
  });

  const result = await probeSurface(transport, { timeoutMs: 500 });
  assert.equal(result.templates, null);
});

test('probeSurface rejects when the server exits before replying, with stderr in the message', async () => {
  let resolveExited;
  const exited = new Promise((resolve) => {
    resolveExited = resolve;
  });

  const { transport } = createFakeTransport({
    exited,
    stderrText: 'boom: crashed on startup',
    onSend(msg) {
      if (msg.method === 'initialize') {
        setTimeout(() => resolveExited({ code: 1, signal: null }), 5);
      }
    },
  });

  await assert.rejects(probeSurface(transport, { timeoutMs: 2000 }), (err) => {
    assert.match(err.message, /exited/);
    assert.match(err.message, /"initialize"/);
    assert.match(err.message, /boom: crashed on startup/);
    return true;
  });
});

test('probeSurface rejects on timeout, naming the pending method, with stderr in the message', async () => {
  const { transport } = createFakeTransport({
    stderrText: 'server is stuck',
    onSend(msg) {
      if (msg.method === 'initialize') {
        // never respond
      }
    },
  });

  await assert.rejects(probeSurface(transport, { timeoutMs: 20 }), (err) => {
    assert.match(err.message, /timed out/);
    assert.match(err.message, /"initialize"/);
    assert.match(err.message, /server is stuck/);
    return true;
  });
});

test('probeSurface rejects on a JSON-RPC error response, with code, message, and stderr included', async () => {
  const { transport } = createFakeTransport({
    stderrText: 'diagnostic output',
    onSend: makeHandler({
      'tools/list': (msg, push) => push(errResp(msg.id, -32000, 'internal error')),
    }),
  });

  await assert.rejects(probeSurface(transport, { timeoutMs: 500 }), (err) => {
    assert.match(err.message, /"tools\/list"/);
    assert.match(err.message, /code=-32000/);
    assert.match(err.message, /internal error/);
    assert.match(err.message, /diagnostic output/);
    return true;
  });
});

test('probeSurface rejects when tools/list reports zero tools (the empty-surface guard)', async () => {
  const { transport } = createFakeTransport({
    stderrText: 'nothing registered',
    onSend: makeHandler({
      'tools/list': (msg, push) => push(ok(msg.id, { tools: [] })),
    }),
  });

  await assert.rejects(probeSurface(transport, { timeoutMs: 500 }), (err) => {
    assert.match(err.message, /"tools\/list"/);
    assert.match(err.message, /zero tools/);
    assert.match(err.message, /nothing registered/);
    return true;
  });
});

test('probeSurface rejects when resources/list reports zero resources (the empty-surface guard)', async () => {
  const { transport } = createFakeTransport({
    stderrText: 'nothing registered',
    onSend: makeHandler({
      'resources/list': (msg, push) => push(ok(msg.id, { resources: [] })),
    }),
  });

  await assert.rejects(probeSurface(transport, { timeoutMs: 500 }), (err) => {
    assert.match(err.message, /"resources\/list"/);
    assert.match(err.message, /zero resources/);
    assert.match(err.message, /nothing registered/);
    return true;
  });
});

// ---------------------------------------------------------------------
// diffSurfaces / formatReport
// ---------------------------------------------------------------------

test('diffSurfaces reports sorted added/removed sets per category, treating a null templates side as empty', () => {
  const a = { tools: ['x', 'y'], resources: ['r1'], templates: ['t1'] };
  const b = { tools: ['y', 'z'], resources: ['r1', 'r2'], templates: null };

  const diff = diffSurfaces(a, b);

  assert.deepEqual(diff.tools, { added: ['z'], removed: ['x'] });
  assert.deepEqual(diff.resources, { added: ['r2'], removed: [] });
  assert.deepEqual(diff.templates, { added: [], removed: ['t1'] });
});

test('formatReport renders per-spec counts/names and per-pair diffs, with "(no change)" for an empty category', () => {
  const results = [
    { label: 'v1', surface: { tools: ['a'], resources: ['r'], templates: null } },
    { label: 'v2', surface: { tools: ['a', 'b'], resources: ['r'], templates: ['t1'] } },
  ];

  const out = formatReport(results);

  assert.match(out, /== v1 ==/);
  assert.match(out, /tools: 1/);
  assert.match(out, /templates: unsupported/);
  assert.match(out, /== v2 ==/);
  assert.match(out, /templates: 1/);
  assert.match(out, /-- v1 -> v2 --/);
  assert.match(out, /resources: \(no change\)/);
  assert.match(out, /tools:\n\+ b/);
  assert.match(out, /templates:\n\+ t1/);
});

// ---------------------------------------------------------------------
// parsePackageSpec / resolveBinEntry
// ---------------------------------------------------------------------

test('parsePackageSpec splits an unscoped name and version', () => {
  assert.deepEqual(parsePackageSpec('foo'), { name: 'foo', version: undefined });
  assert.deepEqual(parsePackageSpec('foo@1.2.3'), { name: 'foo', version: '1.2.3' });
});

test("parsePackageSpec splits a scoped name without mistaking the scope's own @ for the version separator", () => {
  assert.deepEqual(parsePackageSpec('@genvidtech/construct3-chef'), {
    name: '@genvidtech/construct3-chef',
    version: undefined,
  });
  assert.deepEqual(parsePackageSpec('@genvidtech/construct3-chef@2.0.0'), {
    name: '@genvidtech/construct3-chef',
    version: '2.0.0',
  });
});

test('resolveBinEntry accepts a bare string bin', () => {
  assert.equal(resolveBinEntry({ bin: './cli.js' }, 'pkg'), './cli.js');
});

test('resolveBinEntry picks the entry named after the package from a bin object', () => {
  assert.equal(resolveBinEntry({ bin: { pkg: './cli.js', other: './x.js' } }, 'pkg'), './cli.js');
});

test('resolveBinEntry falls back to the sole entry of a single-key bin object', () => {
  assert.equal(resolveBinEntry({ bin: { anything: './only.js' } }, 'pkg'), './only.js');
});

test('resolveBinEntry throws when bin is a multi-entry object with none matching the package name', () => {
  assert.throws(() => resolveBinEntry({ bin: { a: './a.js', b: './b.js' } }, 'pkg'), /entries and none is named "pkg"/);
});

test('resolveBinEntry throws when package.json has no usable bin field', () => {
  assert.throws(() => resolveBinEntry({}, 'pkg'), /no usable "bin" field/);
});

// ---------------------------------------------------------------------
// CLI end-to-end, against the stub fixtures — no network, no npm.
// ---------------------------------------------------------------------

test('CLI end-to-end: --server against a stub MCP server exits 0 and prints a report', () => {
  const result = spawnSync(
    process.execPath,
    [CLI, '--timeout', '5000', '--server', process.execPath, STUB_OK],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.match(result.stdout, /== .* ==/);
  assert.match(result.stdout, /tools: 2/);
  assert.match(result.stdout, /resources: 2/);
  assert.match(result.stdout, /templates: 1/);
});

test('CLI end-to-end: --server against a server that exits immediately fails with a nonzero exit and stderr content', () => {
  const result = spawnSync(
    process.execPath,
    [CLI, '--timeout', '2000', '--server', process.execPath, STUB_EXIT],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.ok(result.stderr && result.stderr.trim().length > 0, 'expected stderr content on failure');
});
