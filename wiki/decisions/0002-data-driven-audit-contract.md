# 0002. Data-Driven Audit Contract + Minimal Frontmatter Parser

- **Status:** Accepted
- **Originally decided:** 2026-06-02 (`599dd3b` audit-c3-conventions skill + validator)
- **Recorded:** 2026-06-18 (backfilled — predates the `docs/decisions/` convention)

## Context

The plugin defines a *contract* a consuming repo must satisfy (a C3-project marker + both MCP servers reachable at minimum versions) and ships an audit script that verifies it. The question was where the list of requirements lives: hard-coded in the audit script, or declared by the components that need them.

A second, coupled question: the audit must parse YAML frontmatter from every `SKILL.md` / `agents/*.md`. Pull in a YAML library, or hand-roll a parser?

## Decision

**The contract is data-driven.** Each skill/agent declares its needs under `metadata.expects.{files,config,tools,mcp}` in its own frontmatter. The audit script (`scripts/audit.mjs`) walks every component under `${CLAUDE_PLUGIN_ROOT}`, collects their `expects` entries, evaluates each against the working directory, and reports by severity. **To add a requirement, add an `expects` entry to the relevant component — do not hard-code a check in the script.** The only check baked into the script is the bespoke C3-project marker OR-check.

**The frontmatter parser is minimal and hand-rolled** (`scripts/lib/frontmatter.mjs`), scoped to exactly the shapes used: top-level scalars, one level of nesting for `metadata.expects`, and arrays of objects. It deliberately does *not* handle multiline scalars, anchors, or deep nesting.

## Compromise / Alternatives rejected

- **Hard-coded checks in `audit.mjs`** — rejected: every new requirement would mean a script edit, and the requirement would drift from the component that actually needs it. The data-driven form keeps each component's needs co-located with the component and makes the audit extensible without touching code.
- **A full YAML library** — rejected: a dependency (and its transitive surface) for a parser that only ever sees a handful of fixed, shallow shapes. The hand-rolled parser is auditable, dependency-free, and fixture-tested. The accepted cost: frontmatter must stay within the supported shapes, or the parser must be replaced — a constraint, not a bug.

## Consequences

- New requirements are a frontmatter edit, not a code change — this is why later features (e.g. the `base: project` field in ADR 0005) extend the contract by adding an `expects` field rather than a script branch.
- Frontmatter authors are constrained to the parser's shapes; exotic YAML will silently fail to parse, so the constraint is documented in `CLAUDE.md`.
- The audit's severity/exit-code behavior (0 = all required met, 1 = error finding, 2 = script error) is the stable interface consumers script against.
