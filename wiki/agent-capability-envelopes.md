---
type: reference
title: Agent capability envelopes
description: The two agents' model and tools frontmatter is a functional constraint, not documentation — don't instruct an agent to do what it cannot observe or call.
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

[^claude-md]: CLAUDE.md, "Components" and "Respect each agent's capability
envelope".

## Related

- [Verifying an MCP pin bump](/pin-bump-verification.md) — keeping the allow-list correct across bumps.
- [The knowledge boundaries](/knowledge-boundaries.md) — keeping agent bodies generic across C3 projects.
- [Grounding a claim in chef's package source](/grounding-in-chef-source.md) — why a CLI-only finding expires and can leave a tool uncallable.
