# Documentation Map

Index of the docs in this repo. genvid plugin agents and skills consult this to discover where project knowledge lives.

## Project overview

- [README.md](../README.md) — what the `genvid-c3` plugin provides, install steps, the agent/skill inventory, and knowledge boundaries.
- [CLAUDE.md](../CLAUDE.md) — guidance for Claude Code working in this repo: commands, architecture, and the three knowledge boundaries.
- [plugin/CONVENTIONS.md](../plugin/CONVENTIONS.md) — the genvid-c3 plugin's own convention contract (what a *consuming* repo must provide). Distinct from genvid-dev's conventions.

## Maintainer procedures (dev workspace, not shipped)

- [docs/tool-surface-reconciliation.md](tool-surface-reconciliation.md) — C3-specific reconciliation anchors (agent allow-lists, package names, surface counts) + burbank cross-check; defers the procedure to the `/genvid-dev:reconcile-mcp-pin` skill. Run on every chef/dm pin bump.
- [docs/grounding-in-chef-behavior.md](grounding-in-chef-behavior.md) — how to ground new genvid-c3 skills/platform-docs in chef's actual source via `npm pack` (vs. inferring from memory/READMEs).

## C3 platform reference (`plugin/docs/c3/`)

The canonical reference for how Construct 3 itself behaves — owned by this plugin and shipped in the `plugin/` subtree.

- [plugin/docs/c3/README.md](../plugin/docs/c3/README.md) — overview of the platform reference and why it lives here.
- [plugin/docs/c3/construct3-guide.md](../plugin/docs/c3/construct3-guide.md) — Construct 3 platform behavior; the *why* behind the platform gotchas.
- [plugin/docs/c3/event-sheet-architecture.md](../plugin/docs/c3/event-sheet-architecture.md) — event sheet JSON structure, the five event/action types, include composition, trigger ordering.
- [plugin/docs/c3/layout-reference.md](../plugin/docs/c3/layout-reference.md) — layout/layer JSON, render order, the template/replica system, UID/SID constraints, and how navigation renders in the extracted DSL (the `navigation.targetPatterns` convention).
- [plugin/docs/c3/scripting-reference.md](../plugin/docs/c3/scripting-reference.md) — Construct 3 scripting API quick reference (`IRuntime`, system expressions, iteration conditions).
- [plugin/docs/c3/typescript-integration.md](../plugin/docs/c3/typescript-integration.md) — C3 TypeScript scripting: runtime access, async/concurrency model, local-variable scoping.
