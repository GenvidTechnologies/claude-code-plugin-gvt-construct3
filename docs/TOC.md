# Documentation Map

Index of the docs in this repo. genvid plugin agents and skills consult this to discover where project knowledge lives.

## Project overview

- [README.md](../README.md) — what the `genvid-c3` plugin provides, install steps, the agent/skill inventory, and knowledge boundaries.
- [CLAUDE.md](../CLAUDE.md) — guidance for Claude Code working in this repo: commands, architecture, and the three knowledge boundaries.
- [CONVENTIONS.md](../CONVENTIONS.md) — the genvid-c3 plugin's own convention contract (what a *consuming* repo must provide). Distinct from genvid-dev's conventions.

## C3 platform reference (`docs/c3/`)

The canonical reference for how Construct 3 itself behaves — owned by this plugin.

- [c3/README.md](c3/README.md) — overview of the platform reference and why it lives here.
- [c3/construct3-guide.md](c3/construct3-guide.md) — Construct 3 platform behavior; the *why* behind the platform gotchas.
- [c3/event-sheet-architecture.md](c3/event-sheet-architecture.md) — event sheet JSON structure, the five event/action types, include composition, trigger ordering.
- [c3/layout-reference.md](c3/layout-reference.md) — layout/layer JSON, render order, the template/replica system, UID/SID constraints.
- [c3/scripting-reference.md](c3/scripting-reference.md) — Construct 3 scripting API quick reference (`IRuntime`, system expressions, iteration conditions).
- [c3/typescript-integration.md](c3/typescript-integration.md) — C3 TypeScript scripting: runtime access, async/concurrency model, local-variable scoping.
