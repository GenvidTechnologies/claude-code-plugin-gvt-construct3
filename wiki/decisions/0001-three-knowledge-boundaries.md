# 0001. Three Knowledge Boundaries for C3 Knowledge

- **Status:** Accepted
- **Originally decided:** 2026-06-02 (`e67c34c` scaffold, `41c1816` C3 platform reference)
- **Recorded:** 2026-06-18 (backfilled — this decision predates the `docs/decisions/` convention)

## Context

The `genvid-c3` plugin packages Construct 3 domain knowledge for Claude Code. That knowledge is heterogeneous: some is about how the C3 *platform itself* behaves, some is about the *bundled tooling* (the construct3-chef / c3-domain-manager MCP servers), and some is *project-specific* (named layouts, file paths, commit format). If all of it lived in one place, the plugin would either duplicate what the tools already document (and drift from it on every server bump) or hard-code facts that belong to the consuming repo (and stop being generic).

## Decision

C3 knowledge is split into three homes, and each piece of content goes to exactly one:

1. **C3 platform reference** — how Construct 3 itself behaves (variable scoping, async/signal model, layout layers, JSON formats, the ACE/`aces.json` metadata model) → lives **in this plugin**, `plugin/docs/c3/`. Agents link it via `${CLAUDE_PLUGIN_ROOT}/docs/c3/*`.
2. **Tooling reference** — recipe format, generators, CLI, recipe gotchas → lives in `construct3-chef://docs`, **versioned with the tool**, never duplicated here.
3. **Project-specific facts** — named layouts, file paths, commit format, project gotchas → live in the **consuming repo's** `CLAUDE.md`, read by the agents at runtime. The agents are genericized and fall back to sensible defaults when the consumer specifies nothing.

A narrower fourth home was added later for **cross-tool wiring neither server's own docs own** (how the two servers resolve config from cwd, the `extracted/` coupling) → `plugin/docs/c3/toolchain-config.md`, a *pointer* doc that links out to each tool's own reference.

The operational test: a **platform gotcha** (invisible to lint/typecheck, only C3 parses it) belongs in `plugin/docs/c3/`; a **recipe-param/tooling gotcha** belongs in chef's docs.

## Compromise / Alternatives rejected

- **One combined knowledge base in the plugin** — rejected: it would duplicate chef's tooling docs and drift from them on every server version bump, and would bake project-specific facts into a plugin that must stay generic across all C3 repos.
- **Defer everything to the tools' own docs** — rejected: the C3 *platform* mechanics (not tooling) have no other home; chef documents its recipes, not how C3's event-sheet/signal model behaves.

## Consequences

- Adding content requires deciding which boundary it crosses; the platform-vs-tooling gotcha distinction is the recurring judgment call.
- Server bumps don't invalidate platform docs (they live with their own concern), and consuming repos stay the source of truth for their own specifics.
- This is the central design principle the rest of the plugin's structure (agents linking `docs/c3/`, the pointer doc, genericized agent bodies) follows from.
