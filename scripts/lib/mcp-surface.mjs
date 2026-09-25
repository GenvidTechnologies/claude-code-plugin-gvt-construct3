// Pure MCP client logic for probing an already-running server's tool and
// resource surface. No filesystem, no child process, no network: every I/O
// primitive is injected via `transport`, so the whole exchange is
// exercisable against an in-memory stub. The CLI counterpart
// (scripts/mcp-surface.mjs) owns installing a package, spawning the server,
// and wiring a real transport around it.
//
// Protocol sequence, per wiki/pin-bump-verification.md's worked probe:
// `initialize` (await its result) -> `notifications/initialized` (no id,
// no reply expected) -> `tools/list` -> `resources/list` ->
// `resources/templates/list`. Messages are newline-delimited JSON-RPC 2.0;
// a stdout line that isn't valid JSON is a server log and is ignored, not
// an error. List calls page via `nextCursor` until a response omits it.
// `resources/templates/list` returning JSON-RPC error -32601 (method not
// found) means the server predates that method: templates come back as
// `null` ("unsupported") rather than failing the whole probe.
//
// `transport` shape:
//   send(line)     - write one JSON-RPC message (no id -> a notification).
//                    `line` is the JSON text; the transport appends
//                    whatever line terminator the wire needs.
//   lines          - an AsyncIterable<string> of the server's stdout, one
//                    already-split line per iteration (a Node readline
//                    interface satisfies this directly).
//   exited         - a Promise<{ code, signal }> that settles when the
//                    server process exits, for any reason.
//   getStderr()    - returns whatever stderr text has been captured so far,
//                    so a failure message can show it.

export const DEFAULT_TIMEOUT_MS = 30000;

class McpProtocolError extends Error {
  constructor(message, { code } = {}) {
    super(message);
    this.name = 'McpProtocolError';
    this.code = code;
  }
}

function stderrSuffix(transport) {
  const text = typeof transport.getStderr === 'function' ? transport.getStderr() : '';
  return text && text.trim().length > 0 ? `\n-- stderr --\n${text}` : '';
}

/**
 * Splits a package spec into `{ name, version }`. Handles the four shapes
 * `npm install` accepts on the command line: `name`, `name@version`,
 * `@scope/name`, `@scope/name@version`. `version` is `undefined` when the
 * spec carries none. A scoped name's own leading `@` is never mistaken for
 * the version separator: only an `@` found AFTER the `scope/name` segment
 * splits off a version.
 */
export function parsePackageSpec(spec) {
  if (spec.startsWith('@')) {
    const rest = spec.slice(1); // "scope/name[@version]"
    const at = rest.indexOf('@');
    if (at === -1) return { name: `@${rest}`, version: undefined };
    return { name: `@${rest.slice(0, at)}`, version: rest.slice(at + 1) };
  }
  const at = spec.indexOf('@');
  if (at === -1) return { name: spec, version: undefined };
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

/**
 * Picks the executable entry point out of an installed package's parsed
 * `package.json`. `bin` may be a bare string (the package's single
 * executable) or an object of `{ name: path }` entries. When it's an
 * object, prefers the entry named after the package itself, then falls
 * back to the sole entry when there is exactly one. Throws when `bin` is
 * missing, or is an object with multiple entries and none matches
 * `packageName`.
 */
export function resolveBinEntry(packageJson, packageName) {
  const bin = packageJson?.bin;

  if (typeof bin === 'string') return bin;

  if (bin && typeof bin === 'object') {
    if (typeof bin[packageName] === 'string') return bin[packageName];
    const entries = Object.entries(bin).filter(([, v]) => typeof v === 'string');
    if (entries.length === 1) return entries[0][1];
    throw new Error(
      `package.json "bin" has ${entries.length} entries and none is named ` +
        `"${packageName}": ${entries.map(([k]) => k).join(', ') || '(none)'}`,
    );
  }

  throw new Error('package.json has no usable "bin" field');
}

// Reads `transport.lines` in the background and resolves/rejects pending
// requests by JSON-RPC id as replies arrive. A line that isn't valid JSON,
// or a JSON message with no `id` (a notification, or one this dispatcher
// never sent), is ignored rather than treated as an error. When the line
// stream ends (the server closed stdout), every still-pending request is
// rejected — this is a backstop; callers normally learn of an early exit
// via `transport.exited` first, which names the exit code/signal.
function createDispatcher(lines) {
  const pending = new Map();
  let closed = false;
  let closeError = null;

  const pump = (async () => {
    try {
      for await (const rawLine of lines) {
        const line = typeof rawLine === 'string' ? rawLine.trim() : '';
        if (line.length === 0) continue;

        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue; // a server log line on stdout, not JSON-RPC
        }

        if (!message || typeof message !== 'object' || !('id' in message)) continue;
        const waiter = pending.get(message.id);
        if (!waiter) continue;
        pending.delete(message.id);
        waiter.resolve(message);
      }
    } catch (err) {
      closeError = err instanceof Error ? err : new Error(String(err));
    } finally {
      closed = true;
      for (const waiter of pending.values()) {
        waiter.reject(closeError ?? new Error('server stdout closed before a reply arrived'));
      }
      pending.clear();
    }
  })();
  // The background pump's own rejection (if the iterable itself throws) is
  // already captured into closeError and surfaced to waiters above; nothing
  // else observes this promise, so give it a no-op handler.
  pump.catch(() => {});

  return {
    waitFor(id) {
      if (closed) {
        return Promise.reject(closeError ?? new Error('server stdout already closed'));
      }
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
  };
}

// Sends one JSON-RPC request and races its reply against the server exiting
// early and against `timeoutMs`. `params === undefined` and `id ===
// undefined` together send a notification (no reply is awaited). Every
// rejection path's message includes captured stderr, per the "fail loudly"
// contract this module is built around.
async function call(transport, dispatcher, { id, method, params }, timeoutMs) {
  const message = id === undefined ? { jsonrpc: '2.0', method } : { jsonrpc: '2.0', id, method };
  if (params !== undefined) message.params = params;
  transport.send(JSON.stringify(message));

  if (id === undefined) return undefined; // notification: no reply expected

  const waitPromise = dispatcher.waitFor(id);

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new McpProtocolError(
          `timed out waiting ${timeoutMs}ms for a reply to "${method}"${stderrSuffix(transport)}`,
        ),
      );
    }, timeoutMs);
  });

  const exitPromise = transport.exited.then((info) => {
    const where = info ? `code=${info.code}, signal=${info.signal}` : 'unknown state';
    throw new McpProtocolError(
      `server exited (${where}) before replying to "${method}"${stderrSuffix(transport)}`,
    );
  });
  exitPromise.catch(() => {}); // avoid an unhandled rejection when this loses the race

  try {
    const reply = await Promise.race([waitPromise, timeoutPromise, exitPromise]);
    if (reply.error) {
      throw new McpProtocolError(
        `"${method}" returned a JSON-RPC error (code=${reply.error.code}): ` +
          `${reply.error.message}${stderrSuffix(transport)}`,
        { code: reply.error.code },
      );
    }
    return reply.result;
  } finally {
    clearTimeout(timer);
  }
}

// Calls `method` repeatedly, following `result.nextCursor` until a response
// omits it, and concatenates `result[resultKey]` across every page. Throws
// (via `call`) on any transport failure encountered on any page, and throws
// on a cursor it has already followed: a server that keeps answering within
// the per-call timeout while repeating a cursor would otherwise loop forever,
// a hang with no error — the opposite of failing loudly.
async function listAll(transport, dispatcher, method, resultKey, { timeoutMs, nextId }) {
  const items = [];
  const seen = new Set();
  let cursor;
  do {
    const params = cursor === undefined ? {} : { cursor };
    const result = await call(transport, dispatcher, { id: nextId(), method, params }, timeoutMs);
    const page = result?.[resultKey];
    if (Array.isArray(page)) items.push(...page);
    cursor = result?.nextCursor;
    if (cursor !== undefined) {
      if (seen.has(cursor)) {
        throw new McpProtocolError(
          `"${method}" returned repeated cursor ${JSON.stringify(cursor)}; pagination would never end${stderrSuffix(transport)}`,
        );
      }
      seen.add(cursor);
    }
  } while (cursor !== undefined);
  return items;
}

/**
 * Speaks the MCP handshake and surface-discovery sequence to an
 * already-running server over `transport`, and returns
 * `{ tools, resources, templates }`:
 *
 *   tools     - sorted array of tool names. Rejects if the server reports
 *               zero.
 *   resources - sorted array of resource URIs. Rejects if the server
 *               reports zero.
 *   templates - sorted array of resource-template URIs, `[]` when the
 *               server supports the method but has none, or `null` when
 *               the server doesn't implement `resources/templates/list`
 *               (a JSON-RPC -32601 there is swallowed into `null` rather
 *               than failing the probe; any other error still fails it).
 *
 * A zero-tool or zero-resource result is never returned as a "successful"
 * empty surface — it is a probe failure, because a reachable server that
 * reports nothing is far more likely to be misconfigured than genuinely
 * empty, and silently printing `tools: 0` would look identical to both.
 */
export async function probeSurface(transport, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const dispatcher = createDispatcher(transport.lines);
  let counter = 0;
  const nextId = () => ++counter;

  await call(
    transport,
    dispatcher,
    {
      id: nextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'mcp-surface', version: '0' },
      },
    },
    timeoutMs,
  );

  await call(transport, dispatcher, { method: 'notifications/initialized', params: {} }, timeoutMs);

  const tools = await listAll(transport, dispatcher, 'tools/list', 'tools', { timeoutMs, nextId });
  if (tools.length === 0) {
    throw new McpProtocolError(`"tools/list" returned zero tools${stderrSuffix(transport)}`);
  }

  const resources = await listAll(transport, dispatcher, 'resources/list', 'resources', {
    timeoutMs,
    nextId,
  });
  if (resources.length === 0) {
    throw new McpProtocolError(`"resources/list" returned zero resources${stderrSuffix(transport)}`);
  }

  let templates = null;
  try {
    templates = await listAll(
      transport,
      dispatcher,
      'resources/templates/list',
      'resourceTemplates',
      { timeoutMs, nextId },
    );
  } catch (err) {
    if (err instanceof McpProtocolError && err.code === -32601) {
      templates = null;
    } else {
      throw err;
    }
  }

  return {
    tools: tools.map((t) => t.name).sort(),
    resources: resources.map((r) => r.uri).sort(),
    templates: templates === null ? null : templates.map((t) => t.uriTemplate ?? t.uri).sort(),
  };
}

function diffList(a, b) {
  const setA = new Set(a ?? []);
  const setB = new Set(b ?? []);
  const added = [...setB].filter((x) => !setA.has(x)).sort();
  const removed = [...setA].filter((x) => !setB.has(x)).sort();
  return { added, removed };
}

/**
 * Diffs two `probeSurface` results category by category. `templates` may be
 * `null` on either side (server doesn't support the method); a `null` is
 * treated as an empty list for diffing purposes, so an "unsupported" ->
 * "supported, N templates" transition shows up as N additions.
 */
export function diffSurfaces(a, b) {
  return {
    tools: diffList(a.tools, b.tools),
    resources: diffList(a.resources, b.resources),
    templates: diffList(a.templates, b.templates),
  };
}

/**
 * Renders a report over one or more `{ label, surface }` entries (`surface`
 * is a `probeSurface` result): per entry, a `== <label> ==` block with
 * counts and sorted names; then, per consecutive pair, a
 * `-- <a> -> <b> --` block with `+`/`-` lines per category, or
 * `(no change)` when a category's diff is empty.
 */
export function formatReport(results) {
  const lines = [];

  for (const { label, surface } of results) {
    lines.push(`== ${label} ==`);
    lines.push(`tools: ${surface.tools.length}`);
    for (const name of surface.tools) lines.push(name);
    lines.push(`resources: ${surface.resources.length}`);
    for (const uri of surface.resources) lines.push(uri);
    lines.push(`templates: ${surface.templates === null ? 'unsupported' : surface.templates.length}`);
    if (surface.templates !== null) {
      for (const uri of surface.templates) lines.push(uri);
    }
  }

  for (let i = 0; i < results.length - 1; i++) {
    const a = results[i];
    const b = results[i + 1];
    lines.push(`-- ${a.label} -> ${b.label} --`);
    const diff = diffSurfaces(a.surface, b.surface);
    for (const category of ['tools', 'resources', 'templates']) {
      const { added, removed } = diff[category];
      if (added.length === 0 && removed.length === 0) {
        lines.push(`${category}: (no change)`);
        continue;
      }
      lines.push(`${category}:`);
      for (const name of added) lines.push(`+ ${name}`);
      for (const name of removed) lines.push(`- ${name}`);
    }
  }

  return lines.join('\n');
}
