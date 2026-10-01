---
type: decision-record
title: "0024. Agent Bodies Name chef's MCP Tools, Never chef's Internals"
description: >-
  `plugin/agents/*.md` may name construct3-chef's MCP tools — the agent's callable surface, reconciled at every pin bump — but never chef's functions, modules, or source paths, not even correct ones: ADR 0010's capability rule extended from docs/c3 to agent bodies, with an MCP-tool carve-out.
tags: [decision, architecture, agents]
status: stable
generated: { by: process:plan-task, at: 2026-10-01T00:00:00Z }
---
# 0024. Agent Bodies Name chef's MCP Tools, Never chef's Internals

- **Status:** Accepted
- **Recorded:** 2026-10-01
- **Issues:** #144, #145
- **Extends:** [ADR 0010](0010-linking-out-generically-instead-of-naming-chef-symbols.md) to a
  new surface. The link form stays as [ADR 0013](0013-addressing-the-chef-docs-resource-by-server-and-uri.md)
  defines it.

## Context

ADR 0010 says `docs/c3` refers to construct3-chef by capability and never names chef's
functions, modules, or MCP tools, "not even correct ones". Its scope is `docs/c3` only.
ADR 0013 restates that scope. Neither record says what the two **agent bodies**
(`plugin/agents/c3-explorer.md`, `plugin/agents/c3-implementer.md`) may name.

#69 removed the stale instruction to call `generateUniqueSid()` from `c3/sidUtils.js` from
`docs/c3`. The same instruction survived in `c3-implementer.md` gotcha #14 until #145. Chef
had replaced the function when it retired its SID singleton, so the agent was being told
to call something that no longer existed. Nothing reported it, because no check reads
agent prose against chef's source.

The same audit found gotcha #16 naming `buildSidIndex` as the thing that throws on a
duplicate SID. That name is **current**: on chef `main` at `c771924` it is exported from
`src/c3/eventSheetMutator.ts`. It is the case ADR 0010 calls "a correct name is still
wrong". The agent cannot call it, so the name carries no instruction. It only becomes false
the next time chef refactors.

ADR 0010's rule cannot simply be applied to agent bodies as written, because it also bans
**MCP tool names**. Agent bodies exist largely to list those: `c3-explorer`'s `tools:`
frontmatter is a hard allow-list made of them, and both bodies tell the agent which tool to
call for which job.

## Decision

**Agent bodies refer to chef by capability. They may name chef's MCP tools and the
`(construct3-chef, docs:///…)` resource pair. They never name chef's functions, modules,
source paths, or internal APIs, not even correct ones.**

This means:

- **Allowed:** an MCP tool name (`generate-sids`, `apply-recipe`, `resolve-anchor`), the
  `construct3-chef` server name, and a `docs:///` URI paired with that server per ADR 0013.
- **Not allowed:** a chef function (`generateUniqueSid`, `buildSidIndex`), a chef module or
  source path (`c3/sidUtils.js`, `src/c3/…`), or any other name that exists only inside
  chef's implementation.

### Why MCP tool names are carved out

An MCP tool name is the agent's **callable surface**. The agent acts by calling it, so
leaving it out would make the instruction unactionable. Tool names are also **reconciled at
every pin bump**: `/gvt-dev:reconcile-mcp-pin`, `scripts/mcp-surface.mjs` and
`c3-explorer`'s allow-list are all checked against the pinned server's registered tools.
A renamed tool **fails loudly**: an allow-listed name that the server no longer registers
cannot be called.

A function name has none of those properties. The agent cannot call it, so it is no use
even when correct. Nothing reconciles it, so it **rots silently**. `generateUniqueSid` and
`buildSidIndex` are the two instances that motivated this record.

ADR 0010's ban on tool names still holds for `docs/c3`. A platform reference has no
callable surface, so it has no reason to accept the risk.

### Scope

`plugin/agents/*.md` only. Skills are outside this decision. Two skill sites name chef
internals and are recorded here so that a future sweep reads them as known residuals, not
as misses:

- `plugin/skills/build-reference/SKILL.md` names chef's `src/c3/c3Reference.ts`. ADR 0013
  § "Known residuals, not violations" already records this one.
- `plugin/skills/build-reference/SKILL.md` names chef's `lookup()` in its note on not
  caching custom-addon ACEs. It was found during #144/#145 design.

## Alternatives rejected

- **No ADR, only a wiki note.** `wiki/knowledge-boundaries.md` pointed at
  `plugin/CONVENTIONS.md` as the normative home of the capability-not-symbol rule, but
  `CONVENTIONS.md` never carried it. Without a record the rule would have no canonical
  statement, which is the gap this decision closes.
- **Agents and skills together.** That would turn the two recorded `build-reference`
  residuals into violations, and would widen #144/#145 beyond their approved scope.
- **Name the current chef function instead** (for example, swap `generateUniqueSid` for its
  replacement). ADR 0010 already rejected this for `docs/c3`: the property that matters is
  not whether a name is right today, but whether it can become wrong without anyone
  noticing.

## Consequences

- `c3-implementer` gotcha #14 points to the `generate-sids` tool. Gotcha #16 describes the
  duplicate-SID failure in terms of what the agent can observe, not the chef function
  that throws.
- A new chef internal in an agent body is now a defect. Nothing checks for it, so it is
  caught by review against this record. The #144 acceptance rows T17, T19 and T20 swept
  `plugin/agents/` once; they are not a standing check.
- **Revisit trigger:** a skill gains a new chef-internal name. That is the point to decide
  whether to widen this scope to skills.

## Related

- [ADR 0001](0001-three-knowledge-boundaries.md): the knowledge boundaries this rule sits
  inside.
- [ADR 0010](0010-linking-out-generically-instead-of-naming-chef-symbols.md): the rule
  this extends.
- [ADR 0013](0013-addressing-the-chef-docs-resource-by-server-and-uri.md): the
  server-plus-URI link form.
- `wiki/knowledge-boundaries.md` § "Name chef's *capability*, never chef's *symbol*": the
  maintainer page that now points here.
