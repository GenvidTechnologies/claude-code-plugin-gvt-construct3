#!/usr/bin/env node
// Stub stdio server that exits immediately without answering anything, for
// scripts/test/mcp-surface.test.mjs's end-to-end early-exit CLI test.
// Prints to stderr first so the CLI's failure message has real stderr
// content to show, mirroring a server that crashed on startup.

process.stderr.write('stub-mcp-server-exit: refusing to start\n');
process.exit(3);
