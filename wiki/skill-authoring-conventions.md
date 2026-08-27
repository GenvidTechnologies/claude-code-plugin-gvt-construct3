---
type: practice-note
title: Skill authoring conventions
description: Frontmatter keys are fixed; scripts split a pure lib from a thin I/O CLI with tests at a path validation actually globs; and remediation prose must never describe a check the script does not yet implement.
tags: [skills, frontmatter, scripts, testing, grounding]
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
  - id: grounding
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/docs/grounding-in-chef-behavior.md
    title: docs/grounding-in-chef-behavior.md in the repo (living version)
---

# Skill authoring conventions

A skill is a directory — `plugin/skills/<name>/SKILL.md` plus any scripts —
invoked as `/gvt-construct3:<name>`.[^claude-md]

## Frontmatter keys are fixed

Top-level frontmatter keys are limited to `name`, `description`, and
Anthropic-supported fields (`model`, `tools`). **Custom expectations go under
`metadata.expects`** — never invent new top-level keys, or `claude plugin validate`
and downstream tooling will choke.

Keep frontmatter within the shapes the hand-rolled parser handles — see
[The convention contract and the audit](/the-audit-contract.md).

## Tests must live where validation globs them

`commands.validate` runs the test glob `skills/*/scripts/test/*.test.mjs`, so **a
new skill's tests are picked up automatically — but only if they live at
`skills/<name>/scripts/test/*.test.mjs`.** Tests placed anywhere else are
**silently excluded** from the suite. `author-navigation-patterns` follows this.

## Split a pure transform from a thin I/O CLI

Keep logic in a pure `scripts/lib/*.mjs` module — no `fs`, no `process`, no
network, just functions — with fixture-based `node:test` coverage at
`scripts/test/*.test.mjs`, and a thin CLI (`scripts/*.mjs`) that owns arg-parsing
and I/O and calls the lib.

`build-reference` ships three such pairs:

| Lib | CLI |
|---|---|
| `lib/reference-index.mjs` | `build-index.mjs` |
| `lib/cdn-aces.mjs` | `fetch-aces.mjs` |
| `lib/merge.mjs` | `merge.mjs` |

**A script that fetches the network must also expose an offline path** (e.g.
`fetch-aces.mjs --input <file>`) so the transform is exercisable in CI without
network. The live fetch stays human-validated; the pure transform stays
unit-tested.

There is no build step, no `package.json`, no lint config — the scripts and libs
are plain ESM `.mjs` run directly by Node, and tests use the built-in `node:test`
runner only.

## Two patterns for a skill that targets a tool

### A skill that authors a tool's config

e.g. `author-navigation-patterns`. Mirror the tool's algorithm only against its
**documented contract**, defer the field-level schema to the tool's own docs
(`construct3-chef://docs`), and treat the **tool's own output as the authoritative
validator** (`navigation-graph`). Any bundled helper script is a fast *preview*
that must agree with — never replace — that output. Pin the mirrored logic to
ground truth from the package source (see
[`docs/grounding-in-chef-behavior.md`](../docs/grounding-in-chef-behavior.md)).

### A skill that produces a data cache the tool reads

e.g. `build-reference` → chef's `c3-reference` cache, validated by `search-docs`.
Same preview-vs-authoritative-validator rule, **plus an extra obligation: ground
the *dataflow*, not just the schema, in the tool's source before designing.**
Check whether the tool already generates or merges part of that data itself, so
the skill doesn't duplicate it.

chef's `lookup()` reads `addons/*/aces.json` **live** and concatenates it with the
cache's `aces` (no dedup), so the cache must hold **built-in/manual ACEs + chunks
only** — writing `source:"addon"` entries into it double-counts every one. This
near-miss is why the grounding step reads the tool's **ingestion path**, not only
its schema.

## Remediation prose must not describe an unimplemented check

`audit-c3-conventions`'s "Act on findings" bullets are user-facing remediation for
checks `audit.mjs` **actually runs**. Don't write aspirational guidance for
behavior a *future* PR will add.

> **Precedent.** #47's SKILL.md told users to "pin `--project-dir` via a workspace
> `.mcp.json`" to suppress the ambiguity warning, but the shipped code only
> honored the `C3_PROJECT_DIR` env var — the `.mcp.json` suppression wasn't built
> until #49, a **full release later**. For that whole window the doc was a silent
> false claim.

When you add or edit an "Act on findings" bullet, verify each remediation path
against the checks actually present in `audit.mjs`. If a remediation only works
once a not-yet-written check exists, it belongs in the **issue/plan** for that
check, not in the shipped skill.

[^claude-md]: CLAUDE.md, "Components", "Commands", and "Conventions for editing
this repo".

## Related

- [The convention contract and the audit](/the-audit-contract.md) — the `expects` model a skill declares against.
- [Doc inventories, ADRs, and the changelog](/doc-inventories.md) — every inventory a new skill must be added to.
- [The knowledge boundaries](/knowledge-boundaries.md) — deciding whether a fact belongs in a skill at all.
- [Grounding a claim in chef's package source](/grounding-in-chef-source.md) — how to answer a design question from the pinned package rather than from memory.
