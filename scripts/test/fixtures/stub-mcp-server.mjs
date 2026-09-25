#!/usr/bin/env node
// Minimal stdio MCP server stub, for scripts/test/mcp-surface.test.mjs's
// end-to-end CLI test only. NOT a real server — canned responses, just
// enough of the protocol sequence scripts/lib/mcp-surface.mjs drives:
// initialize -> notifications/initialized (no reply) -> tools/list ->
// resources/list -> resources/templates/list.

import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

function reply(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

rl.on('line', (raw) => {
  const line = raw.trim();
  if (line.length === 0) return;

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return; // not JSON-RPC; a real server might log here instead
  }

  switch (message.method) {
    case 'initialize':
      reply(message.id, {
        protocolVersion: '2025-06-18',
        capabilities: {},
        serverInfo: { name: 'stub-mcp-server', version: '0' },
      });
      break;
    case 'notifications/initialized':
      break; // notification: no reply
    case 'tools/list':
      reply(message.id, { tools: [{ name: 'b_tool' }, { name: 'a_tool' }] });
      break;
    case 'resources/list':
      reply(message.id, { resources: [{ uri: 'docs:///z' }, { uri: 'docs:///a' }] });
      break;
    case 'resources/templates/list':
      reply(message.id, { resourceTemplates: [{ uriTemplate: 'docs:///{name}' }] });
      break;
    default:
      break; // unrecognized methods are simply not answered
  }
});
