# Plan: relocate genvid-c3 into a `plugin/` subfolder + fix MCP exposure

**Branch:** `refactor/plugin-subfolder-layout`
**Release:** HELD until `genvid-dev:release-plugin` supports a non-root plugin path.

## Why

Three problems, one structural move plus targeted fixes:

1. **Root `.mcp.json` errors every session.** It is read as *project-scope* MCP config
   in this plugin-dev repo and tries to start two C3 servers this repo doesn't need.
   It also uses **unscoped** names (`construct3-chef`, `c3-domain-manager`) that 404 on
   npm; the real packages are scoped `@genvid/construct3-chef@0.6.0` /
   `@genvid/c3-domain-manager@0.3.0` (bin names are unscoped, but `npx` resolves by
   *package* name).
2. **Convention conflict with genvid-dev** (both stake root `CONVENTIONS.md`). Resolved
   structurally by the directory split. (Verification note: the repo is already in
   genvid-dev **MIGRATED** state because `.genvid-agent.json` exists, so genvid-dev's
   `--fix` greenfield/legacy scaffolder would not actually run here — the documented
   hazard is milder than written, but the split removes it entirely.)
3. **MCP install/update not streamlined** — no version pinning.

## Target layout

```
repo root  ──  genvid-dev CONSUMER (describes developing THIS repo)
  CLAUDE.md            dev instructions; consumes genvid-dev (NO @CONVENTIONS.md import)
  .genvid-agent.json   validate → "cd plugin && claude plugin validate . && node --test …"
                       + paths.plugin_root: "plugin"
  docs/TOC.md          consumer doc index
  README.md            dev/contributor-facing
  .claude/, LICENSE
  (no root CONVENTIONS.md — not required; single contract lives in plugin/)

plugin/  ──  THE SHIPPED ARTIFACT (marketplace path "plugin")
  .claude-plugin/plugin.json   + mcpServers (scoped, -y, pinned)
  CONVENTIONS.md               genvid-c3's own contract (ships to consumers)
  CHANGELOG.md                 created (first release; closes documented gap)
  LICENSE
  agents/  skills/  docs/c3/   moved verbatim; ${CLAUDE_PLUGIN_ROOT}/docs/c3/* unchanged
```

## Verifications resolved during planning

- genvid-dev read-only audit does **not** require a root `CONVENTIONS.md` (no component
  declares it under `metadata.expects`; `detectState` keys MIGRATED off `.genvid-agent.json`).
  Decision: **drop the root `CONVENTIONS.md`** — single contract in `plugin/`.
- audit-c3 reachability probe (`audit.mjs:266`) shells `npx <server> --version` by **bare**
  name → same 404 bug. Must use the scoped `entry.package`. Existing tests only assert
  frontmatter parsing (`server === 'construct3-chef'`), so the probe fix won't break them.
- `server` subcommand confirmed correct (existing `.mcp.json` + audit comment).
- `cd plugin && claude plugin validate .` is the validation form (robust vs. path-arg).

## Tasks (one commit each; `genvid-dev:validator` after each)

### Task 1 — `refactor: relocate plugin artifact into plugin/ subfolder`
Atomic relocation (keeps validation green):
- `git mv .claude-plugin agents skills` → `plugin/`
- `mkdir plugin/docs && git mv docs/c3 plugin/docs/c3`
- `git mv CONVENTIONS.md plugin/CONVENTIONS.md`
- copy `LICENSE` → `plugin/LICENSE`
- keep `docs/TOC.md` at root
- `.genvid-agent.json`: `commands.validate` →
  `cd plugin && claude plugin validate . && node --test skills/audit-c3-conventions/scripts/test/*.test.mjs`;
  add `"paths": { "plugin_root": "plugin" }`
- `${CLAUDE_PLUGIN_ROOT}/docs/c3/*` references: **no change**
- **Validate:** `cd plugin && claude plugin validate . && node --test skills/audit-c3-conventions/scripts/test/*.test.mjs`

### Task 2 — `fix: declare MCP servers via plugin.json, drop root .mcp.json`
- delete root `.mcp.json`
- add to `plugin/.claude-plugin/plugin.json`:
  ```json
  "mcpServers": {
    "construct3-chef":   { "command": "npx", "args": ["-y", "@genvid/construct3-chef@0.6.0", "server"] },
    "c3-domain-manager": { "command": "npx", "args": ["-y", "@genvid/c3-domain-manager@0.3.0", "server"] }
  }
  ```
- **Validate:** `claude plugin validate ./plugin`

### Task 3 — `fix: audit-c3 reachability probe uses scoped package name`
- `plugin/skills/audit-c3-conventions/scripts/audit.mjs`: probe `npx -y <pkg> --version`
  using the scoped `entry.package` (fall back to `server` only if no package declared);
  update the `.mcp.json` comment → plugin.json
- **Validate:** `node --test`

### Task 4 — `docs: audit-c3 SKILL.md + plugin CONVENTIONS.md for plugin.json bundling`
- SKILL.md remediation text → scoped names + "bundled via plugin.json"; drop the
  `.mcp.json` "Pending approval" note and `npm install -g construct3-chef` guidance
- `plugin/CONVENTIONS.md` table → scoped invocation; "declares `mcpServers` in plugin.json"

### Task 5 — `docs: rewrite root CLAUDE.md + README for split layout`
- root `CLAUDE.md`: rewrite "dual identity" section (root = genvid-dev consumer; artifact
  in `plugin/`); relax the `--fix` warning to a normal caution (MIGRATED → safe); fix all
  command/component paths to `plugin/…`; record held-release status + the marketplace
  `git-subdir` change to apply at release; link the genvid-dev issue
- root `README.md`: dev/contributor-facing; point consumers at the marketplace
- **no** root `CONVENTIONS.md`, **no** `@CONVENTIONS.md` import

### Task 6 — `docs: add plugin/CHANGELOG.md`
- seed `plugin/CHANGELOG.md` (Keep a Changelog) with `## [Unreleased]` capturing this restructure

### Deliverable (no repo commit) — file genvid-dev issue
- `gh issue create` on `genvid-holdings/claude-code-plugin-genvid-dev`: request
  `release-plugin` + release-triangle checks to honor `paths.plugin_root` from
  `.genvid-agent.json` (default `"."`). Link the issue URL in root `CLAUDE.md`.

## Release-time actions (NOT in this PR)

- Marketplace (`genvid-holdings/claude-code-marketplace`, `.claude-plugin/marketplace.json`):
  genvid-c3 entry → `{ "source": "git-subdir", "url": "…claude-code-plugin-genvid-c3.git", "path": "plugin", "ref": "vX.Y.Z" }`.
- Run `genvid-dev:release-plugin` **after** it supports `paths.plugin_root`.

## Risks

- Release blocked until genvid-dev ships the fix (intentional hold).
- audit probe now `npx`-downloads scoped packages (slightly slower consumer audits) — acceptable.
