---
type: reference
title: The convention contract and the audit
description: How audit-c3-conventions validates a consuming repo — the data-driven expects model, the two checks deliberately baked into the script, the presence-vs-content validation boundary, and base project resolution.
tags: [audit, expects, contract, discovery, adr-0002, adr-0005, adr-0006]
status: stable
stale_after: 2027-08-18
generated: { by: process:maintain-wiki, at: 2026-08-18T00:00:00Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-18.md
    title: CLAUDE.md as captured before the wiki migration
    last_modified: 2026-08-18
  - id: claude-md-upstream
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/CLAUDE.md
    title: CLAUDE.md in the repo (living version)
---

# The convention contract and the audit

`plugin/skills/audit-c3-conventions/` is the most code-heavy part of the repo.
The plugin defines a *contract* a consuming repo must satisfy — a C3-project
marker plus both MCP servers reachable at minimum versions — and the audit script
verifies it.[^claude-md]

## The contract is data-driven

Each skill/agent declares its needs under `metadata.expects.{files,config,tools,mcp}`
in its frontmatter. `scripts/audit.mjs` walks every `SKILL.md` and `agents/*.md`
under `${CLAUDE_PLUGIN_ROOT}`, collects their `expects` entries, evaluates each
against the current working directory, and prints a Markdown report grouped by
severity.

**To add a new requirement, add an `expects` entry to the relevant component's
frontmatter — do not hard-code checks in the script**
([ADR 0002](../docs/decisions/0002-data-driven-audit-contract.md)).

An entry with `required: false` reports at `info` severity and never affects the
exit code — that is how an *optional* expectation is expressed without a script
change.

## The two deliberate exceptions

Two things are baked into `audit.mjs` directly because they are **inexpressible**
as `expects` entries:

1. **The C3-project marker** — a bespoke OR-check across three indicators:
   `project.c3proj` exists; `.gvt-agent.json` has `features.c3: true`; or
   `paths.c3project` points at an existing file.
2. **The discovery check** — a small family mirroring how `c3-domain-manager`
   resolves its root, all derived from one shared `project.c3proj` filesystem
   enumeration (`scanC3ProjectMarkers`).

The discovery check emits two advisory findings:

- an **ambiguity `warning`** — ≥2 sibling `project.c3proj` dirs, which makes the
  server abort at startup with `-32000`
  ([ADR 0006](../docs/decisions/0006-detect-discovery-ambiguity.md));
- a **root-divergence `info`** — the `paths.c3project` root differs from what bare
  auto-discovery would pick, so the server may run on a different project than
  the audit validated (added in #49, extending ADR 0006 with no new ADR).

Both are *enumerations/counts*, which the `expects` model can't represent; both
stay within the presence/reachability boundary — they enumerate directories and
read config keys, never parse `.c3proj` contents. Suppression honors an explicit
root pin: a workspace-root `.mcp.json` `--project-dir` / `env.C3_PROJECT_DIR`
override on the `c3-domain-manager` entry, or a live `C3_PROJECT_DIR` env var.

The ambiguity finding introduced the report's **`warning`** tier — advisory,
between `error` and `info`. Neither finding changes the exit code; only an
`error` exits non-zero.

## The validation boundary: presence here, content in chef

The audit validates **contract presence/reachability only** — does a required
file/config/tool/MCP server exist and resolve. That is the entire reach of the
`expects` model.

**Data-content cross-validation** of a C3 project or addon (e.g. an addon's
`aces.json` ↔ its `lang/*.json` strings) is *not* expressible as an `expects`
entry — it parses and cross-references file *contents* — and does **not** belong
in `audit.mjs`. Such checks live in **construct3-chef**, the authoritative tool
the plugin's skills defer to; the plugin's role is to *recommend/run* the chef
tool, not reimplement it.

> **Precedent.** The aces↔lang check proposed as #31 was relocated to
> `construct3-chef#98` (`validate-addon`) for exactly this reason — the same
> family as #32 (bundled-`.c3addon` validation), which already names chef as its
> home.

## `base: project` — non-rooted projects

`files`/`config` expects resolve against the **repo root** by default. An entry
tagged **`base: project`** resolves against the **C3 project root** instead —
derived from `.gvt-agent.json` `paths.c3project` (its `dirname`), falling back to
the repo root when absent.

This is how the audit checks a *non-rooted* project (C3 project in a
subdirectory): `domain-config.json` and `construct3-chef.config.json` are
`base: project` because they live alongside the `.c3proj`, while `.gvt-agent.json`
itself stays repo-root-relative.

Rooted repos (no `paths.c3project`) are unaffected — `base` is just another
data-driven `expects` field, not a script-level check
([ADR 0005](../docs/decisions/0005-non-rooted-c3-project-support.md)).

## Supporting libs

- **`scripts/lib/frontmatter.mjs`** — a *minimal* hand-rolled YAML parser scoped
  to the exact frontmatter shapes used: top-level scalars, one level of nesting
  for `metadata.expects`, arrays of objects. It does **not** handle multiline
  scalars, anchors, or deep nesting — keep frontmatter within those shapes or
  replace the parser.
- **`scripts/lib/config-resolve.mjs`** — resolves dotted keys (`features.c3`)
  against parsed JSON, reporting *where* a path broke.

## MCP probing

Reachability is confirmed by running `npx -y <package> --version` for the
**scoped** package (`@genvidtech/construct3-chef`), since npx resolves by package
name — `npx construct3-chef` would 404.

Both CLIs currently report version as `"unknown"`, so the authoritative version
comes from walking `node_modules` for the backing package's `package.json`
(`resolvePackageVersion`). The `package:` field in an `mcp` expects entry names
that package.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All required expectations met |
| `1` | An `error` finding |
| `2` | Unexpected script error |

[^claude-md]: CLAUDE.md, "The convention contract & the audit".

## Related

- [Verifying an MCP pin bump](/pin-bump-verification.md) — the `resolveRootFolder` mirror this script hand-maintains.
- [Skill authoring conventions](/skill-authoring-conventions.md) — including the rule that remediation prose must not describe an unimplemented check.
- [The knowledge boundaries](/knowledge-boundaries.md) — why content validation belongs to chef.
