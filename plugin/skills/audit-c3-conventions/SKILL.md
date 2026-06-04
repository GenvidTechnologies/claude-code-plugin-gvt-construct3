---
name: audit-c3-conventions
description: Validates a repo against the genvid-c3 plugin contract — checks the C3-project marker and probes construct3-chef / c3-domain-manager MCP servers for reachability at minimum versions. Read-only.
metadata:
  expects:
    tools:
      - command: node
        reason: Runs the validator script
      - command: npx
        reason: Probes construct3-chef and c3-domain-manager versions
    mcp:
      - server: construct3-chef
        package: "@genvid/construct3-chef"
        minVersion: "0.4.0"
        reason: Recipe tools and construct3-chef://docs (the canonical tooling reference)
      - server: c3-domain-manager
        package: "@genvid/c3-domain-manager"
        minVersion: "0.1.1"
        reason: Domain index and maintenance tools
---

# Audit C3 Conventions

Validates the consuming repo against the `genvid-c3` plugin contract and reports findings.

**This skill ships a deterministic validator script.** The script does the actual checking; this body tells you when to run it, how to read the output, and how to act on findings.

## When to run

- After installing or updating the `genvid-c3` plugin (the plugin may have added new expectations).
- Before opening a PR, to verify the repo still satisfies the contract.
- When another skill reports that a C3-project marker or MCP server expectation is not met.
- Any time you want to confirm both MCP servers are reachable at the minimum required versions.

## How to run

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/audit-c3-conventions/scripts/audit.mjs"
```

The script:

1. **Checks the C3-project marker** — passes if any of: `project.c3proj` exists; `.genvid-agent.json` has `features.c3: true`; or `paths.c3project` points at an existing file.
2. **Walks the plugin's installed skills and agents** at `${CLAUDE_PLUGIN_ROOT}/skills/*/SKILL.md` and `${CLAUDE_PLUGIN_ROOT}/agents/*.md`.
3. **Parses each component's frontmatter** to collect `metadata.expects.{files,config,tools,mcp}`.
4. **Evaluates each expectation** against the current working directory, including MCP version probes via `npx <server> --version`.
5. **Prints a structured report** grouped by severity (errors for required-but-missing; info for optional-but-missing).
6. **Exits non-zero** if any required expectation is unmet.

## Read the report

Each finding includes:

- The **component** that declared the expectation (skill or agent name, or `genvid-c3` for the marker check).
- **What was expected** (file path, config key, tool command, or MCP server name).
- **What was found** (missing, unreachable, version too old, etc.).
- **The reason** the component needs it — verbatim from the component's `metadata.expects[].reason`.

When a required check fails, take the reason seriously — it's what the component's author wrote to explain the dependency.

## Act on findings

- **Missing C3-project marker** — either this is not a Construct 3 project (and `genvid-c3` does not apply), or add the marker: create `project.c3proj`, or set `features.c3: true` in `.genvid-agent.json`, or set `paths.c3project` to the path of your `.c3proj` file.
- **MCP server not reachable** — install the package (`npm install -g construct3-chef` or `npm install -g c3-domain-manager`), or add it as a project devDependency. If the server is bundled from the plugin's `.mcp.json`, it needs a one-time interactive approval in Claude Code: the audit's `npx <server> --version` probe is what surfaces the gap.
- **MCP server version too old** — update the package to the required minimum version.
- **Missing tool** — install `node` or `npx` (both ship with Node.js).

> **Pending approval note:** The bundled MCP servers from this plugin's `.mcp.json` require a one-time interactive approval in Claude Code after the plugin is installed. Until approved, `npx <server> --version` will fail and the audit will report an error. Approve the servers in the Claude Code UI, then re-run the audit.

## Output format

The script prints findings as Markdown so the report renders cleanly when Claude surfaces it back to the user. Example:

```markdown
## genvid-c3 Audit Results

### Errors (must fix)
- **genvid-c3** expects `C3-project marker` — No C3-project marker found (need `project.c3proj`, or `.genvid-agent.json` `features.c3: true`, or `paths.c3project`). Reason: genvid-c3 only applies to Construct 3 projects; this repo does not look like one.

### Summary
- 3 of 4 required expectations satisfied.
- 1 required expectation unmet.
```

Exit code: 0 if no errors; 1 if any required expectation is unmet; 2 on unexpected script error.
