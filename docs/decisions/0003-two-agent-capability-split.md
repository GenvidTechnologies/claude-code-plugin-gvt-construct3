# 0003. Two-Agent Capability Split (Read-Only Explorer vs. Mutating Implementer)

- **Status:** Accepted
- **Originally decided:** 2026-06-02 (`597769d` c3-explorer, `fc55a71` c3-implementer)
- **Recorded:** 2026-06-18 (backfilled — predates the `docs/decisions/` convention)

## Context

C3 work splits cleanly into cheap read-only reconnaissance (reading event sheets, layouts, the domain index) and expensive, careful mutation (recipe-driven edits). Bundling both into one agent would mean paying for a capable model on every read and giving an agent that only needs to look the power to change things.

## Decision

Two agents, each with a deliberately scoped capability envelope:

- **`c3-explorer`** — model `haiku`, **strictly read-only**. Its `tools:` frontmatter is a **hard allow-list** that explicitly enumerates only the read-only MCP tools it may call; anything not listed is uncallable. Cheap reconnaissance.
- **`c3-implementer`** — model `opus`, performs all C3 mutations via the recipe system. TypeScript *modules* are out of scope (cross-domain edits hand back to the orchestrator); it does write TS embedded in eventSheet script actions.

The envelope is a real constraint, not just documentation: because `c3-explorer`'s `tools:` is a hard allow-list, a read tool the servers add but the list omits becomes *uncallable* — a functional regression. (This is what later motivated the `reconcile-mcp-pin` workflow.) Guidance written for an agent must respect what it can actually observe — e.g. `c3-explorer` is `haiku` and reads layout/addon JSON, *not pixels*, so swap-recon guidance reports observable geometry and hands visual-silhouette judgment back to a human.

## Compromise / Alternatives rejected

- **A single all-capability agent** — rejected: it would run a capable (costly) model for every trivial read, and would hold mutation power during pure exploration, weakening the read/mutate safety boundary.
- **No hard `tools:` lock on the explorer** — rejected for the read-only agent: without the lock, "read-only" is only a suggestion. The lock makes the read/mutate split enforceable, at the cost of having to reconcile the allow-list on every server bump.

## Consequences

- The read/mutate split is load-bearing for several later decisions: tool-surface reconciliation after a pin bump must respect it (read tools → explorer's allow-list; mutation tools → implementer's body), and a missed read tool is a functional bug, not a doc gap.
- Agent bodies stay generic across C3 projects; project-specific facts come from the consuming repo per ADR 0001.
- Choosing models per role (haiku vs opus) keeps recon cheap and mutation careful.
