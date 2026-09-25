---
type: practice-note
title: Skill authoring conventions
description: Frontmatter keys are fixed; scripts split a pure lib from a thin I/O CLI with tests at a path validation actually globs; mutation-testing an extraction tells an untested branch from a non-discriminating one, which must be annotated rather than tested; a test imports the function it checks, never an inline copy; a test that proves a loop ends needs a stub that yields, or the per-test timeout never fires; remediation prose must never describe a check the script does not yet implement; and prose must never restate a value a declarative source already owns.
tags: [skills, frontmatter, scripts, testing, grounding, drift]
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
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/9d77f5b/docs/grounding-in-chef-behavior.md
    title: docs/grounding-in-chef-behavior.md as of 9d77f5b, retired into wiki/grounding-in-chef-source.md
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

There is no build step and no lint config. The scripts and libs are plain ESM
`.mjs` run directly by Node, and tests use the built-in `node:test` runner only.
Runtime dependencies are declared in `plugin/package.json` with a committed
lockfile. Claude Code installs them when it copies the plugin into its cache; a
git checkout needs `npm ci --prefix plugin`, which `commands.validate` runs. Today
there is one dependency, `@genvidtech/audit-core`
([ADR 0022](/decisions/0022-audit-core-adoption-and-npm-ci-in-validate.md)). A
script that imports a dependency should sit behind a usability preflight, as
`audit-c3-conventions`'s CLI does. Without one, a missing install surfaces as a
bare module-resolution error.

## Mutation-test the extraction, and tell "untested" from "untestable"

Tests written *after* the code already works can assert only the passing path and
still look thorough. The cheap countermeasure, used twice here now, is to
**mutate each rejection branch, confirm the suite goes red, restore** — and to
report which named test caught which mutation, rather than a bare "all green".

The finding worth planning for is a **surviving** mutation, because it has two
very different causes and the remedies are opposites:

| Mutation survives because… | What it means | Remedy |
|---|---|---|
| no test exercises the branch | **untested** | write the test |
| *no input can distinguish* the branch's presence from its absence | **non-discriminating** | annotate it at the site — do **not** write a test |

The second case is the trap: a test added there passes whether or not the branch
exists, so it manufactures coverage rather than measuring it. That is the same
"a check that can degrade to matching everything or matching nothing is not a
check" shape catalogued in
[The npm surface and the CI gate](/the-npm-surface-and-ci-gate.md), pointed at a
test instead of a CI step.

Settle which case you are in by **building both variants and diffing their
behaviour over a spread of inputs**, not by reading the code — the argument for
unreachability is exactly the kind that is persuasive and wrong.

> **Precedent.** #127 extracted `scripts/lib/plugin-manifest.mjs` and mutated
> eleven rejection branches; ten were caught by a named test. The eleventh,
> `parsePinnedArg`'s `at <= SCOPE.length - 1` guard, survived being disabled
> outright — `startsWith(SCOPE)` above it fixes the first twelve characters as
> `@genvidtech/`, whose only `@` is at index 0, so the guard can fire only when
> `at === 0`, and that makes `pkg` empty, which the next check already rejects.
> A 23-input sweep across both variants found zero behavioural disagreement. The
> guard was left in place and annotated; an unfalsifiable check is worse than an
> absent one, so it is now labelled as one.

Removing such a branch is a *behaviour* question. Inside a deliberately
behaviour-preserving refactor it is out of scope — but leaving it unmarked
invites either a later "cleanup" that cannot know it is safe, or precisely the
hollow test above.

## A test imports what it tests — never an inline copy

A test that pastes a copy of the function it checks is testing the copy. It
stays green however the real function changes, so it is the same "passes
whether or not the code is right" shape as the non-discriminating test above,
arrived at by duplication instead of by an unreachable branch. If the function
is private to a CLI script, that is the signal to move it into `scripts/lib/`
and export it — the lib/CLI split above exists precisely so the logic is
importable.

> **Precedent.** `audit.test.mjs`'s semver tests exercised an inline
> `semverGte` "for unit-testing without importing the full script", while the
> audit ran its own private copy. Nothing linked the two. #124/#126 moved the
> function into `lib/mcp-check.mjs` and pointed the tests at that export.

## A test that proves a loop ends needs a stub that yields

`node:test`'s per-test `{ timeout }` is a timer, and a timer only fires when the
event loop gets a turn. A fake transport that answers **synchronously**, pushing
its reply before `send()` returns, lets an unbounded `await` loop run on
microtasks alone, so the event loop never gets a turn. The per-test timeout never
fires; the whole test file dies instead, or the suite stalls until something
outside it gives up. A hang then reads as "the runner is broken", not "this loop
never terminates".

So when a test's job is to prove termination (pagination that must stop, a retry
that must give up, a read that must time out), make the stub hand control back
between replies, e.g. by queueing each reply with `setImmediate`. Then give the
test its own `{ timeout }`, so the red run fails that one test by name.

> **Precedent.** #134's review found that `scripts/lib/mcp-surface.mjs`'s
> `listAll` looped forever on a repeated `nextCursor`. The new test, written
> against the existing synchronous fake transport with `{ timeout: 2000 }`,
> did not fail as one named test when run before the fix: the TAP output was
> `not ok 1 - scripts\test\mcp-surface.test.mjs`, `# pass 4`, `# fail 1` for a
> file of 20 tests. It was red, which was enough to confirm the defect, but
> only because the fix then turned it into a clean 20/20.

## Two patterns for a skill that targets a tool

### A skill that authors a tool's config

e.g. `author-navigation-patterns`. Mirror the tool's algorithm only against its
**documented contract**, defer the field-level schema to the tool's own docs
(the `construct3-chef` server's `docs:///reference/cli` resource), and treat the **tool's own output as the authoritative
validator** (`navigation-graph`). Any bundled helper script is a fast *preview*
that must agree with — never replace — that output. Pin the mirrored logic to
ground truth from the package source (see
[Grounding a claim in chef's package source](/grounding-in-chef-source.md)).

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

## Prose must not restate a value a declarative source owns

The sibling of the rule above: that one is prose describing a check that does
not exist, this one is prose *duplicating* a value that does. A comment or
doc that restates a number the code reads from somewhere else has no mechanism
keeping the two in step — nothing validates comment prose, so every automated
gate stays green while the copy rots.

**The `expects` contract is the case that keeps recurring.** Floors live in each
component's `metadata.expects.mcp[].minVersion`, and `audit.mjs` reads them at
run time ([ADR 0002](/decisions/0002-data-driven-audit-contract.md) — the
frontmatter is the source of truth). `audit.mjs`'s own header comment restated
them anyway, and went stale across **two** pin bumps before anyone noticed; the
audit passed throughout, because it reads the frontmatter and is structurally
unable to detect a wrong comment (#97).

**The discriminator is who reads the number, not whether duplication feels
untidy.** Both answers are legitimate:

| Site | Ruling |
|---|---|
| `plugin/CONVENTIONS.md` | **Restate it.** This is the consumer-facing contract — the number *is* the deliverable, and a consumer cannot resolve a pointer into frontmatter they have not installed. Accept the maintenance cost; #32 is the precedent for paying it. |
| `audit.mjs`'s header comment | **Point at the frontmatter.** The reader is a maintainer with `SKILL.md` in the same directory; the number buys nothing and drifts. |

So do not "make the prose consistent" by sweeping numbers *into* sites that
deliberately have none — that manufactures drift surfaces rather than closing
them. `SKILL.md`'s `description` and `CONVENTIONS.md`'s narrative mention of
minimum versions are already drift-proof precisely because they name no version.

Note this section states no version numbers of its own, for the same reason.

[^claude-md]: CLAUDE.md, "Components", "Commands", and "Conventions for editing
this repo".

## Related

- [The convention contract and the audit](/the-audit-contract.md) — the `expects` model a skill declares against.
- [Doc inventories, ADRs, and the changelog](/doc-inventories.md) — every inventory a new skill must be added to.
- [The knowledge boundaries](/knowledge-boundaries.md) — deciding whether a fact belongs in a skill at all.
- [Grounding a claim in chef's package source](/grounding-in-chef-source.md) — how to answer a design question from the pinned package rather than from memory.
