---
type: decision-record
title: "0013. Address the chef Docs Resource by Server and `docs:///` URI"
description: >-
  A doc or agent body names chef's documentation resource as the pair (`construct3-chef` server, `docs:///<path>` URI) — never the malformed `construct3-chef://docs`, and never the `@server:protocol://resource` mention form, which only resolves in human-typed input.
tags: [decision, architecture]
status: stable
generated: { by: process:maintain-wiki, at: 2026-09-01T00:00:00Z }
---
# 0013. Address the chef Docs Resource by Server and `docs:///` URI

- **Status:** Accepted
- **Recorded:** 2026-09-01
- **Issue:** #86 (planned jointly with #88, #89, #91)
- **Amends:** ADR 0010 (the link form named in its Decision; the capability-not-symbol rule is unchanged)

## Context

ADR 0010 tells a `docs/c3` doc to "link to `construct3-chef://docs`". That string has
never resolved. It transposes the server name and the protocol: `construct3-chef` is the
`mcpServers` key, `docs` is the scheme of the registered URI template, so the string reads
the server as the scheme and the scheme as the resource.

The defect had spread to **28 sites** across the shipped plugin and the dev workspace,
because ADR 0010 mandated it. Worse, ADR 0010's own reasoning had *increased* reliance on
it: `plugin/CHANGELOG.md` 2.2.1 records `docs/c3` dropping its restatements of chef's CLI
so that each "now links to `construct3-chef://docs`, which owns them". Content was moved
out of the plugin on the strength of an address that did not work.

Two facts settled the replacement form, neither of which was available when 0010 was
written.

**Both pinned servers register the `docs` scheme.** `construct3-chef` serves
`docs:///reference/cli`; `c3-domain-manager` serves `docs:///reference/domain-architecture`.
A bare `docs:///…` URI is therefore ambiguous across the two servers this plugin bundles.

**Claude Code's resource-read tool takes a `(server, uri)` pair.** `ReadMcpResourceTool` is
documented as reading "a specific resource from an MCP server, identified by server name
and resource URI", and its implementation destructures `{ server, uri }`. The URI alone is
not an address.

## Decision

**Name the resource as the pair: the `construct3-chef` server, and its `docs:///<path>`
URI.** Every file that contains a `docs:///` names `construct3-chef` at or before its first
occurrence.

Three rules follow.

1. **One noun form everywhere.** Ownership statements and fetch instructions use the same
   token, so a single `docs:///` grep sweeps and verifies every site — and catches the next
   chef repath.
2. **The fetch verb is hoisted, not repeated.** "How to read this" is stated in three
   places — `c3-implementer.md`, `create-c3-op/SKILL.md`, and `c3-explorer.md` (negatively,
   see below) — never once per site. **`plugin/docs/c3/*` prose carries no fetch
   instruction at all**: it is platform reference read by humans and by both agents, and a
   fetch verb there would be wrong for one of its two agent readers.
3. **Discovery is the recovery path, not the primary.** If a named URI errors, enumerate
   with `ListMcpResourcesTool` and re-resolve — then fix the drift.

### Why a `docs:///` URI is not a "chef file path" under ADR 0010

This is the real tension: `docs:///reference/cli` does mirror chef's on-disk
`wiki/reference/cli.md`, and ADR 0010 forbids naming chef's file paths.

It is ruled in, for the reason 0010 itself gives. ADR 0010 does not prohibit *naming things
that exist in chef*; it prohibits names that **rot invisibly**. A stale
`mintUniqueSid(usedSids)` degrades into a plausible-looking identifier that a reader will
believe and act on. A stale `docs:///` URI fails with `McpError(InvalidParams)` — the read
does not half-succeed. Loud rot is the property 0010 was protecting, and the resource
address has it.

The point is also structural: 0010 *mandates* linking to the docs resource. The resource's
own address cannot be the thing it forbids, or the rule contradicts itself.

### Why naming the resource tools does not violate ADR 0010 either

ADR 0010 extends its prohibition to chef's MCP tool names because those are **chef's
registered surface** and move for the same reasons its internal symbols do.
`ReadMcpResourceTool` and `ListMcpResourcesTool` are **Claude Code's** tools, present
whenever any MCP server is configured; they are not chef's surface and do not move with
chef's releases.

Moot at the site level regardless: under rule 2 the fetch verb lives only in agent and
skill bodies, and ADR 0010 binds `docs/c3` docs.

### The `@server:protocol://resource` form is rejected

Claude Code's MCP documentation describes `@server:protocol://resource` for referencing a
resource, and issue #86 proposed it. It is wrong for these sites on four independent
grounds, any one of which is sufficient:

1. **It is an input-attachment affordance, not model-readable prose.** The resolver is a
   branch of the attachments pipeline, keyed on human-typed input; it runs over the turn's
   input text and injects fetched content *before* the model sees the turn. An agent body,
   a `SKILL.md`, or a doc opened with `Read` never passes through it — which is what 22 of
   the 28 sites are.
2. **Backticks defeat the extractor.** Its pattern requires the `@` to be preceded by
   start-of-input or whitespace. Every site wraps the reference in backticks, so the
   mention would not be extracted even in a prompt.
3. **The proposed string had the wrong slash count.** #86 proposed
   `@construct3-chef:docs://reference/recipe-reference`, yielding
   `docs://reference/recipe-reference`; the served URI is `docs:///reference/recipe-reference`
   — three slashes. The resolver compares the remainder exactly.
4. **It only resolves for an already-listed resource**, so it depends on the very
   `resources/list` capability that chef added in 1.2.0.

### `c3-explorer` is told it cannot fetch, rather than being given the capability

`c3-explorer` runs on `haiku` with a hard `tools:` allow-list, and that allow-list contains
neither resource tool. Its body nonetheless pointed at `construct3-chef://docs` — an
instruction it could not have executed even had the string been correct.

**The allow-list is not widened.** `wiki/pin-bump-verification.md` already excludes a
`READ_ONLY` chef tool from that same list on the grounds that adding one "to close the gap"
silently widens a haiku agent's envelope, and ADR 0003 makes that allow-list a functional
constraint rather than documentation. Instead the site states plainly that the resource is
outside the allow-list and tells the agent to hand the question to the orchestrator.

This is a routing instruction, not a dangling pointer — the capability is reachable, just
not by that agent. Note `search-docs` is **not** a substitute: it resolves the C3 ACE
reference, not chef's own documentation.

**Revisit trigger:** if a task genuinely requires `c3-explorer` to read chef's tooling
reference, that is a capability change deserving its own issue, its own record, and an
empirical check of the `tools:` frontmatter spelling — not a line edit.

## Consequences

- A single anchor, `git grep "docs:///" -- plugin/`, enumerates every reference and is the
  standing check at each future chef bump.
- The four names in use — `docs:///index`, `docs:///reference/cli`, `docs:///reference/ops`,
  `docs:///reference/recipe-reference` — are **path-shaped and exist only at chef ≥ 1.2.0**.
  The four skills' `minVersion` floors are raised to match. This is breaking for a consumer
  pinned below 1.2.0, and the CHANGELOG says so.
- Naming the server at every site is redundant in files that discuss only chef. That
  redundancy is deliberate: it is what keeps the form unambiguous once
  `c3-domain-manager`'s `docs:///` resources are cited by the same convention.
- The normative form ships in `plugin/CONVENTIONS.md`, where a forker can read it.
  `wiki/knowledge-boundaries.md` points at it rather than restating it, so there is one
  canonical statement rather than two that can drift.
- Chef can repath its wiki again. When it does, the failure is a loud `McpError`, the grep
  gives the complete set to re-verify in one command, and rule 3 tells an agent what to do
  in the meantime.

### Known residuals, not violations

- `plugin/skills/build-reference/SKILL.md` names chef's `src/c3/c3Reference.ts`. ADR 0010's
  scope is `docs/c3` docs, so a *skill* naming it is outside the prohibition. Recorded here
  so a future sweep does not read it as a miss. (That path is also not in chef's published
  tarball, which ships only `dist/`, `wiki/`, and `raw/`.)
- `plugin/docs/c3/layout-reference.md`'s `navigation-graph` mention is the residual ADR 0010
  itself named and accepted.

## Compromise

- **Supersede ADR 0010** — rejected. The decision is not reversed. Its substantive rule —
  refer to chef by capability, never by internal symbol — is unchanged and still correct;
  only the link form it illustrated was wrong. Superseding would retire the capability rule
  and leave `docs/c3` unruled.
- **Amend ADR 0010 in place** — rejected, per this repo's standing treatment of ADRs as
  historical records. 0010's reasoning was right for the state that existed when it was
  written; rewriting it would erase the fact that a mandated address had never resolved.
  `wiki/decisions/index.md` therefore keeps 0010's row mirroring its frontmatter
  `description` verbatim, with the amendment appended after it rather than spliced in.
- **Discover-don't-hardcode as the primary form** — rejected, and this is the closest call.
  It is durable against repaths, which is real. But it inverts 0010's own thesis: a stale
  hardcoded URI fails loudly, while "enumerate and pick the one covering recipes" fails
  *silently and confidently* when it picks wrong out of ~50 documents. It is also strictly
  less information — "the recipe reference" is one specific document — and costs a
  `resources/list` round trip per lookup to rediscover a name already known. Its one real
  benefit is captured as rule 3's fallback at no steady-state cost.
- **A different noun form per site group** (bare name for ownership statements, name plus
  mechanism for fetch instructions) — rejected. The genuine difference between the groups is
  the *verb*, not the noun, and rule 2 already varies it. Two noun conventions would mean
  two grep patterns to maintain and a reader having to work out which convention a site
  uses.

## Related

- ADR 0001 — the three knowledge boundaries; the tooling reference lives in chef.
- ADR 0003 — why `c3-explorer`'s `tools:` allow-list is a functional constraint.
- ADR 0010 — the record this amends.
- `wiki/knowledge-boundaries.md` — the maintainer-facing pointer.
- `plugin/CONVENTIONS.md` — where the normative form ships.
