---
name: audit-c3-conventions
description: Validates a repo against the gvt-construct3 plugin contract — checks the C3-project marker and probes construct3-chef / c3-domain-manager MCP servers for reachability at minimum versions. Read-only.
metadata:
  expects:
    tools:
      - command: node
        reason: Runs the validator script
      - command: npx
        reason: Probes construct3-chef and c3-domain-manager versions
    files:
      - path: domain-config.json
        base: project
        reason: c3-domain-manager requires domain-config.json at the C3 project root; the plugin launches its server with no --config, so it resolves the default location.
    mcp:
      - server: construct3-chef
        package: "@genvidtech/construct3-chef"
        minVersion: "1.2.0"
        reason: Recipe tools, the construct3-chef server's docs:///index tooling reference, and the bundled-.c3addon validation surface (validate-addons). The floor is 1.2.0 because the path-shaped docs:/// resource names this plugin cites exist only from 1.2.0 (ADR 0013).
      - server: c3-domain-manager
        package: "@genvidtech/c3-domain-manager"
        minVersion: "0.6.1"
        reason: Domain index and maintenance tools
---

# Audit C3 Conventions

Validates the consuming repo against the `gvt-construct3` plugin contract and reports findings.

**This skill ships a deterministic validator script.** The script does the actual checking; this body tells you when to run it, how to read the output, and how to act on findings.

## When to run

- After installing or updating the `gvt-construct3` plugin (the plugin may have added new expectations).
- Before opening a PR, to verify the repo still satisfies the contract.
- When another skill reports that a C3-project marker or MCP server expectation is not met.
- Any time you want to confirm both MCP servers are reachable at the minimum required versions.

## How to run

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/audit-c3-conventions/scripts/audit.mjs"
```

The script:

1. **Checks the C3-project marker** — passes if any of: `project.c3proj` exists; `.gvt-agent.json` has `features.c3: true`; or `paths.c3project` points at an existing file.
2. **Checks c3-domain-manager discovery ambiguity** — mirrors the server's bare-args auto-discovery (repo root + immediate children, depth 1). If the repo root lacks `project.c3proj` but 2+ child directories contain one, reports an advisory warning — this layout makes the server abort at startup with `-32000`. Suppressed when a `C3_PROJECT_DIR` env var pins the root, or a workspace-root `.mcp.json` overrides the `c3-domain-manager` server entry with a `--project-dir` arg or `env.C3_PROJECT_DIR`.
3. **Checks root divergence** — if `.gvt-agent.json` `paths.c3project` resolves to a different root than bare auto-discovery would pick, reports an advisory `info` finding: the server may operate on a different project than the audit validated.
4. **Walks the plugin's installed skills and agents** at `${CLAUDE_PLUGIN_ROOT}/skills/*/SKILL.md` and `${CLAUDE_PLUGIN_ROOT}/agents/*.md`.
5. **Parses each component's frontmatter** to collect `metadata.expects.{files,config,tools,mcp}`.
6. **Evaluates each expectation** against the current working directory, including MCP version probes via `npx -y <package> --version` (the scoped package, e.g. `@genvidtech/construct3-chef`).
7. **Prints a structured report** grouped by severity (errors for required-but-missing; warnings for advisory runtime-breakers; info for optional-but-missing).
8. **Exits non-zero** if any required expectation is unmet — warnings and info findings do not change the exit code.

## Read the report

Each finding includes:

- The **component** that declared the expectation (skill or agent name, or `gvt-construct3` for the marker check).
- **What was expected** (file path, config key, tool command, or MCP server name).
- **What was found** (missing, unreachable, version too old, etc.).
- **The reason** the component needs it — verbatim from the component's `metadata.expects[].reason`.

When a required check fails, take the reason seriously — it's what the component's author wrote to explain the dependency.

## Act on findings

- **Missing C3-project marker** — either this is not a Construct 3 project (and `gvt-construct3` does not apply), or add the marker: create `project.c3proj`, or set `features.c3: true` in `.gvt-agent.json`, or set `paths.c3project` to the path of your `.c3proj` file.
- **Ambiguous C3 root (discovery-ambiguity warning)** — 2+ directories contain `project.c3proj` within the server's depth-1 discovery scope, so `c3-domain-manager` will abort at startup (`-32000`) even though other checks are green. Remediation: remove or relocate the extra `project.c3proj` (gitignoring it does **not** help — discovery scans the filesystem, not git), or pin the root with `C3_PROJECT_DIR` (env) or a `--project-dir` arg via a workspace `.mcp.json` server override. If you already pin `--project-dir`/`C3_PROJECT_DIR`, the advisory does not apply. Residual gap: the audit only inspects the repo-root `.mcp.json`; a higher-precedence **local**-scope override (`~/.claude.json`) is out of its portable reach, so a local-scope pin the audit can't see could still produce this warning.
- **Root divergence (`discovery-divergence` info)** — the audit's `paths.c3project` root differs from what `c3-domain-manager`'s bare-args auto-discovery would pick, so the server may operate on a different project than the audit checked. Informational and non-blocking — it does not affect the exit code. Remediation: align `paths.c3project` with the intended discoverable project, or pin the root with `C3_PROJECT_DIR` / `--project-dir`.
- **Deprecated config filename** — an info finding that the repo still uses the old gvt-dev config name `.genvid-agent.json`. Rename the file to `.gvt-agent.json`; the audit accepts either during the transition, preferring the new name.
- **MCP server not reachable** — the audit probes each server by running `npx -y <package> --version` (the scoped `@genvidtech/construct3-chef` / `@genvidtech/c3-domain-manager`). A failure means npx could not fetch or run that package — check network/registry access, or add the package as a project devDependency to pin it locally. The plugin itself launches the same packages via its `plugin.json` `mcpServers`.
- **MCP server version too old** — bump the pinned version in the plugin's `plugin.json` `mcpServers` (and, for a local devDependency, update the package).
- **Missing tool** — install `node` or `npx` (both ship with Node.js).

> **Plugin-provided servers:** `gvt-construct3` declares both MCP servers in its `plugin.json` (`mcpServers`), so they start automatically when the plugin is enabled. Bundled plugin servers may need a one-time approval in Claude Code before the agents can call their tools — approve them in the Claude Code UI. This is independent of the audit's `npx` probe above, which invokes npx directly and needs no approval.

## Output format

The script prints findings as Markdown so the report renders cleanly when Claude surfaces it back to the user. A report can contain Errors, Warnings, and Info sections. Example (an errors-only run):

```markdown
## gvt-construct3 Audit Results

### Errors (must fix)
- **gvt-construct3** expects `C3-project marker` — No C3-project marker found (need `project.c3proj`, or `.gvt-agent.json` `features.c3: true`, or `paths.c3project`). Reason: gvt-construct3 only applies to Construct 3 projects; this repo does not look like one.

### Summary
- 3 of 4 required expectations satisfied.
- 1 required expectation unmet.
```

Example (an advisory-warning run — discovery ambiguity):

```markdown
## gvt-construct3 Audit Results

### Warnings (advisory — will break at runtime)
- **gvt-construct3** expects `project.c3proj auto-discovery` — ambiguous C3 root — 2 sibling directories contain `project.c3proj` (official-youtube-sample, sample); c3-domain-manager auto-discovery aborts and the server fails to start (-32000). Reason: The plugin launches c3-domain-manager with no --project-dir, so it resolves the project root by filesystem discovery; two or more candidate roots is a fatal ambiguity. Remove or relocate the extra project.c3proj, or pin the root with C3_PROJECT_DIR / --project-dir.

### Summary
- 14 of 14 required expectations satisfied.
- 1 advisory warning (runtime-breaking).
```

Example (an info run — root divergence):

```markdown
## gvt-construct3 Audit Results

### Info (optional)
- **gvt-construct3** expects `C3 project root` — resolved C3 root diverges — the audit validated `<repo>/b` (from .gvt-agent.json paths.c3project) but c3-domain-manager's bare-args auto-discovery would pick `<repo>/a`, so the server may operate on a different project than the audit checked. Reason: The plugin launches c3-domain-manager with no --project-dir; it auto-discovers its root from the filesystem, which can differ from the paths.c3project root the audit validates. Align paths.c3project with the discoverable project, or pin the root with C3_PROJECT_DIR / --project-dir.

### Summary
- 14 of 14 required expectations satisfied.
- 4 optional expectations unmet.
```

Exit code: 0 if no errors (warnings and info findings do not affect the exit code); 1 if any required expectation is unmet; 2 on unexpected script error.
