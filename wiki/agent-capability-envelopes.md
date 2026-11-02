---
type: reference
title: Agent capability envelopes
description: The two agents' model and tools frontmatter is a functional constraint, not documentation — don't instruct an agent to do what it cannot observe or call; and how to live-probe an edited agent body before it ships.
tags: [agents, c3-explorer, c3-implementer, capabilities, adr-0003]
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
  - id: adr-0003
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/decisions/0003-two-agent-capability-split.md
    title: ADR 0003 in the repo (living version)
---

# Agent capability envelopes

`plugin/agents/*.md` are flat Markdown files with YAML frontmatter, dispatched as
`subagent_type: "gvt-construct3:<name>"`. Their `model` and `tools` keys are a
**functional constraint, not documentation**
([ADR 0003](/decisions/0003-two-agent-capability-split.md)).[^claude-md]

## The two agents

| Agent | Model | `tools:` | Scope |
|---|---|---|---|
| `c3-explorer` | `haiku` | **Hard allow-list** — explicitly enumerates the read-only MCP tools it may call | Strictly read-only recon |
| `c3-implementer` | `opus` | **No `tools:` key** (and its body says so) | All C3 mutations via the recipe system |

`c3-implementer` writes TypeScript embedded in eventSheet script actions, but
TypeScript **modules** are out of scope — it hands cross-domain edits back to the
orchestrator.

> The asymmetry matters. A pin-bump issue once asserted that *both* agents carry
> hard allow-lists; only `c3-explorer` does. See
> [Verifying an MCP pin bump](/pin-bump-verification.md) — a wrong claim about the
> capability model mis-scopes the whole job.

## Respect the envelope when writing guidance

**Don't instruct an agent to do what it can't observe.**

`c3-explorer` is `haiku` and reads layout/addon JSON — **not pixels**. So its
swap-recon guidance reports *observable geometry* (size, origin/anchor, frame
inventory) and hands **visual-silhouette judgment back to a human**, rather than
claiming to compare shapes.

When adding guidance: write the observable-data steps, and **explicitly flag
anything that needs a capability the agent lacks**.

## The allow-list is why pin bumps are functional work

Because `c3-explorer`'s `tools:` is a hard allow-list, a read tool that a server
bump adds but the list omits becomes **uncallable**. That makes tool-surface
reconciliation a functional check, not a docs chore.

## Name chef's tools, never chef's internals

The same callable surface decides what an agent body may *name*. An agent body
may name chef's MCP tools and the `(construct3-chef, docs:///…)` resource pair,
because those are what the agent calls and what every pin bump reconciles. It
never names chef's functions, modules, or source paths, not even correct ones:
the agent cannot call them, and nothing reports it when they rot.
`generateUniqueSid` stayed in `c3-implementer` gotcha #14 for six weeks after #69
removed the same instruction from `docs/c3` (#145).
[ADR 0024](/decisions/0024-agent-bodies-name-mcp-tools-never-chef-internals.md)
records the rule. It extends the `docs/c3` rule in
[The knowledge boundaries](/knowledge-boundaries.md) § "Name chef's *capability*,
never chef's *symbol*" to agent bodies.

## Live-probing an agent body before release

A dispatch from inside a session runs the **installed** plugin, which is the last
tagged release. So it can't exercise an agent body you've just edited, and a
"live dispatch" acceptance row can't be graded that way before the change ships.
Run the working-tree plugin headless instead, from a throwaway git repo under the
long-form temp path (`C:\Users\FabienNinoles\…`, not the `FABIEN~1` short form,
which headless permission checks deny):

```bash
claude -p "<tell the main session to dispatch gvt-construct3:<agent> with brief X>" \
  --plugin-dir C:/repos/claude-code-plugin-gvt-construct3/plugin \
  --settings '{"enabledPlugins":{"gvt-construct3@gvt-plugins":false}}' \
  --allowedTools "Agent,Bash,Read,Grep,Glob" \
  --output-format stream-json --verbose > stream.jsonl
```

The stream is the evidence:

- **The working tree loaded.** The `system`/`init` record lists exactly one
  `gvt-construct3`, with `source: gvt-construct3@inline` and a path ending
  `\plugin`. A second copy, or a `@gvt-plugins` source, means the installed
  release ran instead.
- **What the agent actually did.** A subagent's tool calls carry a
  `parent_tool_use_id`, so you can quote its real Bash commands rather than its
  own summary of them.

The bundled MCP servers may time out on launch. That's harmless when the brief
doesn't need them. One run is one sample of a non-deterministic model, and the
old body often passes the same probe, so record the result as a **smoke check**
that the new rules are followed, not as proof that they prevent the defect.
First used for #173's R6 (PR #179).

[^claude-md]: CLAUDE.md, "Components" and "Respect each agent's capability
envelope".

## Related

- [Verifying an MCP pin bump](/pin-bump-verification.md) — keeping the allow-list correct across bumps.
- [The knowledge boundaries](/knowledge-boundaries.md) — keeping agent bodies generic across C3 projects.
- [Grounding a claim in chef's package source](/grounding-in-chef-source.md) — why a CLI-only finding expires and can leave a tool uncallable.
