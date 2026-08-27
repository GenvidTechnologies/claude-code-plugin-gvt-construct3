---
type: decision-record
title: "0012. Retire `docs/` into the `wiki/` Bundle, Accepting the Audit-Tooling Residue"
description: >-
  `docs/` is retired into the `wiki/` bundle behind four `paths` overrides; the audit residue that no override can reach is accepted and named site by site rather than counted.
tags: [decision, architecture]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-27T00:00:00Z }
---
# 0012. Retire `docs/` into the `wiki/` Bundle, Accepting the Audit-Tooling Residue

- **Status:** Accepted
- **Recorded:** 2026-08-27
- **Issue:** #90

## Context

This repo carried two knowledge tiers for the same audience — the maintainer of this
plugin. `docs/` held 16 hand-maintained files (11 ADRs plus `TOC.md`,
`wiki-schema.md`, `issue-triage.md`, `tool-surface-reconciliation.md`,
`grounding-in-chef-behavior.md`); `wiki/` held an `ingest`-maintained OKF v0.2 bundle.
After a bulk ingest absorbed the content of three of the living docs into wiki pages,
the two tiers overlapped by design rather than by accident, and `docs/` persisted only
because the `gvt-dev` plugin contract keyed several `metadata.expects` declarations on
literal `docs/` paths.

Two upstream changes made retirement reachable. `gvt-dev` #383 and #386 (both shipped
by 4.22.0) extended `.gvt-agent.json`'s `paths` overrides to reach **every** declared
expectation path rather than only the four convention files, and `resolveDocsRoot`
derives the whole docs-tier root from the `docs/TOC.md` override — one directory, one
name. `GenvidTechnologies/construct3-chef` had already reached the end state and
carries no `docs/` directory at all, which made this a generalization of a proven
procedure rather than an experiment.

What the overrides do **not** reach is prose and module constants inside `gvt-dev`
itself. That residue is the subject of this record.

## Decision

**Retire `docs/` entirely.** All 16 files move into `wiki/` or are deleted where their
content already lives there; four `paths` overrides plus a `hygiene.excludePaths` entry
carry the contract; and the audit's remaining findings are accepted as known cost
rather than worked around.

Three sub-decisions are worth recording because each had a live alternative:

1. **ADRs move, and gain OKF frontmatter, without their bodies changing.** This repo's
   rule that ADRs are historical records governs *content*, not location or metadata —
   its own cited precedent (`2400b62`) renamed the plugin without editing ADR 0004's
   references. A `git mv` rewrites nothing, and frontmatter is metadata about the
   document rather than a claim within the decision. The constraint that replaces the
   broader reading is narrower: an authored `description` must **describe**, never
   re-characterize, which is why each is a transcription of the `docs/TOC.md` line that
   already summarized it rather than freshly composed prose.

2. **`docs/TOC.md`'s C3-platform-reference list is dropped, not carried forward.**
   `wiki/index.md` states that the shipped `plugin/docs/c3/` bundle's pages are not
   indexed there, and that list was a duplicate inventory of `plugin/docs/c3/index.md`
   which had already drifted twice. Dropping it takes the number of exhaustive
   description surfaces for a `docs/c3` doc from three to two.

3. **No `docs/` shim was kept.** A one-file `docs/wiki-schema.md` left behind would
   hold three tooling signals green at the cost of the stated goal, and a shim that
   exists only to satisfy a bug tends to outlive the bug.

## Consequences

**The accepted residue, named site by site.** A count in place of a name would decay
the moment any one of these is fixed, so each is named:

- **`scanBrokenLinks`'s `startsWith('/')` join** resolves a bundle-absolute wiki-link
  against the repo root rather than the bundle root, so every `](/page.md)` link — OKF
  §6.1's *recommended* form — reports as broken. This is the whole of the audit's
  remaining broken-link count. Filed upstream as **gvt-dev #421**. Rewriting the links
  to ordinary-relative form would silence it, and was rejected: the recommended form
  exists precisely so a link survives its page moving between directories, which is
  what this migration does to twelve files.

- **`practice-detect.mjs`'s `SCHEMA_DOC` module constant** hard-codes
  `docs/wiki-schema.md` and consults no override, so relocating the schema drops one of
  six wiki-adoption signals and the report's Practice Coverage table reads
  `Environment … partial adoption` permanently. The report does not name which signal is
  missing. Filed upstream as **gvt-dev #390** (blocked on **#385**).

- **`run-retro`'s wiki-detection predicate** routes on the *presence* of
  `docs/wiki-schema.md` at that literal path, so with the file relocated `run-retro`
  concludes the repo maintains no wiki and silently stops routing durable insight to
  `maintain-wiki ingest`. Degradation, not corruption. Covered by the same
  **gvt-dev #390**.

- **`scanRetiredTokens`' candidate-set union** unions the docs-root walk with the
  wiki-dir walk. When an override makes those the same directory, every wiki file is
  scanned twice and each finding is emitted twice — the audit's four deliberate
  retired-token citations report as eight, and the "optional expectations unmet" tally
  inflates correspondingly. **No upstream issue filed** at the time of writing.

- **`scanOrphanedDocs`' hard-coded index filename.** The directory is parameterised
  through the docs root but the filename `TOC.md` is not, so for any repo whose index is
  named `index.md` — which is every OKF bundle — the scanner reads nothing and returns
  empty on its first line. It does not report that it found nothing to check; it stops
  running, and zero orphan findings reads as health. **No upstream issue filed** at the
  time of writing. This is why `wiki/decisions/index.md` completeness is checked by hand
  rather than trusted to the audit.

- **The five `docs/TOC.md` self-index writers** — `create-adr`, `triage-issues`,
  `maintain-wiki`, `plan-task`, and `condense-lessons` — each write their own index row
  to that literal path and none consults `paths`. With the file absent they skip
  gracefully, which is the documented behaviour, so nothing is written and nothing
  reports it. Combined with the inert orphan scan above, keeping the wiki's indexes
  complete becomes a human obligation, stated in `CLAUDE.md`. Tracked upstream by the
  **gvt-dev #374** umbrella and **#388**.

**Other consequences.**

- An unattended `maintain-wiki ingest --non-interactive` would find no
  `docs/wiki-schema.md`, scaffold a generic one, and re-create the `docs/` directory
  this record retires. `CLAUDE.md` bans that invocation until #390 lands. An attended
  run offers the scaffold and is declined.
- `create-adr` and `tech-writer` resolve the ADR location from `CLAUDE.md` prose, not
  from `paths`, so that declaration is load-bearing: without it the next new ADR
  re-creates `docs/decisions/`.
- Pre-move GitHub permalinks into `docs/` return 404. The in-repo `sources[].resource`
  URLs are repointed by this change; copies living in issue bodies and chat logs are not
  recoverable.
- The expected audit residue is recorded with its numbers in
  `wiki/the-audit-contract.md`, which carries a `stale_after`, rather than here — a
  frozen record names sites, a living page counts them.

## Compromise / Alternatives rejected

- **Keep a residual `docs/` holding only the contract-pinned files** — rejected. It
  forfeits the stated goal and preserves exactly the two-tier confusion the
  consolidation exists to end.
- **Rewrite the 57 bundle-absolute links to ordinary-relative form** to reach a clean
  audit — rejected. It optimizes today's warning count against tomorrow's correctness,
  abandons the form OKF §6.1 recommends, and creates a revert obligation once #421
  lands that nothing would remind anyone about.
- **A flat `wiki/` with no subdirectories** — rejected on measured grounds. With ADRs at
  the bundle root there is no path prefix `hygiene.excludePaths` can use to reach them,
  so the frozen ADRs' retired-token findings become permanent noise.
- **Block on the upstream fixes** — rejected. Every residual finding is `info` or
  `warning` severity and the audit exits 0 either way, so the migration's value does not
  depend on them.
