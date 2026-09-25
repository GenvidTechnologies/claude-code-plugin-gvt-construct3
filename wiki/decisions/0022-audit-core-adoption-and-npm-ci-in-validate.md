---
type: decision-record
title: "0022. The Audit Adopts @genvidtech/audit-core Behind a Usability Preflight, and commands.validate Installs plugin/ Dependencies"
description: >-
  audit-c3-conventions takes its mechanism from @genvidtech/audit-core, pinned exactly at 0.2.0, and keeps its policy in local resolver wrappers. A thin CLI checks that the package can be imported and exits 2 with a remediation message when it cannot. commands.validate now runs npm ci for plugin/, retiring ADR 0019's CI-only asymmetry. The ADR-0014 mirrored tests keep their bodies byte-identical and change only the import line.
tags: [decision, audit, npm, dependency, validate, testing]
status: stable
generated: { by: process:plan-task, at: 2026-09-25T00:00:00Z }
---
# 0022. The Audit Adopts `@genvidtech/audit-core` Behind a Usability Preflight, and `commands.validate` Installs `plugin/` Dependencies

- **Status:** Accepted
- **Recorded:** 2026-09-25
- **Issue:** #95 (tracks gvt-dev#459)
- **Amends:** [ADR 0019](0019-npm-surface-shape-and-audit-stays-out-of-validate.md) (the
  "`npm ci` in CI only" asymmetry) and [ADR 0014](0014-mirrored-tests-stay-byte-identical.md)
  (the "never edited" rule, for one line)
- **Precedent:** gvt-dev ADR-0049 (mechanism/policy boundary), ADR-0051 (a lockfile-gated
  npm dependency is permitted in `plugin/`), ADR-0060 (exact pin, preflight, `npm ci` in the
  dev loop), all in `GenvidTechnologies/claude-code-plugin-gvt-dev`

## Context

`audit-c3-conventions` carried hand-copied versions of the shared audit mechanism:
`lib/frontmatter.mjs`, `lib/config-resolve.mjs`, and in-file `walkComponents`,
`loadComponent`, existence probes, and the `file` / `config` / `tool` evaluators.
`@genvidtech/audit-core@0.2.0` now publishes that mechanism as a library. Its exports were
checked by `npm pack` against what `audit.mjs` calls. `resolveKey` is byte-identical to the
local copy. `frontmatter.mjs` differs only by adding block scalars, and no shipped
component's frontmatter uses one. The evaluators differ in two ways. They take a
caller-supplied **synchronous** resolver returning `{path, probe|source, target}` in place of
root arguments, and they add a `required` boolean to every finding.

Adopting a runtime dependency raised three questions this repo had not had to answer:

1. How does the audit behave when the dependency is not installed?
2. How does a maintainer's checkout run tests that import it?
3. What happens to the three test files ADR 0014 mirrored verbatim from gvt-dev, whose
   subject modules are being deleted?

Claude Code's plugin documentation states that when it copies a marketplace plugin into its
cache it runs `npm ci --ignore-scripts` there. It needs a lockfile, has a 60-second timeout,
and cannot be disabled. A git checkout, or a plugin loaded in place from a local-directory
marketplace, gets no install.

## Decision

**Mechanism from the package, policy local.** `scripts/lib/audit.mjs` imports
`walkComponents`, `fileExists`, `resolveKey`, `evaluateTool`, `evaluateFile` and
`evaluateConfig` from `@genvidtech/audit-core`. The local `evaluateFile` / `evaluateConfig`
keep their exported `(component, entry, repoRoot, projectRoot)` signatures as wrappers. Each
builds the synchronous resolver that holds this repo's policy: the `base: project` root
choice, the `.gvt-agent.json` default for `config` entries, `probe: 'file'`, and the
` (project root: …)` suffix on `target`. The `mcp` evaluator (`lib/mcp-check.mjs`), the C3
marker, discovery-ambiguity and root-divergence checks, severity, the tally, and
`formatReport` stay local, per ADR-0049. `lib/mcp-check.mjs` now emits `required` too, so
every `expects`-derived finding carries it. `target` remains display text only.

**Exact pin.** `plugin/package.json` declares `"@genvidtech/audit-core": "0.2.0"` with no
range. Open upstream issues (audit-core#4, a parser swap to `yaml`; audit-core#5,
`loadComponent` no-throw) will change behaviour in a later 0.x. Each upgrade should be a
deliberate bump, which the committed lockfile enforces.

**Bare specifier, no `imports` alias.** gvt-dev routes the import through a `#audit-core`
alias because its `leak-guard` workflow flags the scoped name in code files. This repo has no
such guard, so the alias would be indirection with nothing to satisfy.

**Bootstrap split with a usability preflight.** `scripts/audit.mjs` (the path `SKILL.md`
invokes) is now a thin CLI. It runs `lib/preflight.mjs`, which probes the package with a
dynamic `import()`, so a partial install fails as well as an absent one. Only then does it
import `lib/audit.mjs` and call `main()`. On failure it prints three lines to stderr and
exits **2** with no stack trace. The lines name `@genvidtech/audit-core`, give
`npm ci --prefix <plugin root> --ignore-scripts` as the fix, and quote the underlying error.

**`commands.validate` installs first.** It becomes
`npm ci --prefix plugin --ignore-scripts --no-audit --no-fund && node scripts/ci/gate.mjs && claude plugin validate plugin`.
CI's existing `npm ci` step gains `--ignore-scripts`, so both paths install the way Claude
Code does.

**Mirrored tests change only their import line.** `frontmatter.test.mjs`,
`frontmatter-branches.test.mjs` and `config-resolve.test.mjs` now import from
`@genvidtech/audit-core` and are otherwise unchanged. They now test the package this plugin
actually runs. They passed 22/22 against 0.2.0 before adoption, and the next pin bump will
show any behaviour change as a test failure.

## Alternatives considered

- **Keep `commands.validate` hermetic** (ADR 0019 as written) and let the gate fail with a
  clear message on a fresh checkout. Rejected. Every new worktree, and every validator
  subagent dispatched into one, would need a manual step before its first green run.
- **Delete the mirrored tests.** The package's own repository owns its tests, but its tarball
  ships none. Deleting them would lose this repo's early warning when a pin bump changes
  parser behaviour.
- **A committed end-to-end audit test.** Rejected for this change. `main()` makes live `npx`
  probes for the `mcp` expectations, so a committed run needs either the network in CI or a
  new injection seam. The rewire was verified once instead. On four fixture projects
  (rooted, non-rooted, empty, and a control missing one file), the branch's output was
  byte-identical to `main`'s, and the control differed from the rooted fixture as it should.
  The evidence is recorded on #95.

## Consequences

- **ADR 0019's asymmetry is retired.** A validate run now costs a registry call, or a cache
  hit. That applies to the maintainer's git checkout only. Consumers stay hermetic: Claude
  Code installs once per cached plugin version, and their audit makes no registry call.
- **ADR 0014 is amended, not overturned.** A mirrored test's *body* is still never edited or
  appended to. What changed is that the module under test is now the published package
  rather than a local copy. The files remain diffable against gvt-dev's originals, with the
  import line as the single expected difference.
- **Consumers now receive third-party code.** The install adds `@genvidtech/audit-core` and
  its only dependency, `yaml`. The shipped subtree changes, so a plugin version bump is owed
  at release.
- **Host install into this plugin's cache is not yet observed.** No version with a
  dependency has been released. The docs and gvt-dev ADR-0051's probe both say the install
  happens. Row R13 on #95 is owed after release, and until then the preflight turns any
  failure into a clear message rather than a stack trace.
