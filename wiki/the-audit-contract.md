---
type: reference
title: The convention contract and the audit
description: How audit-c3-conventions validates a consuming repo — the data-driven expects model, the two checks deliberately baked into the script, the presence-vs-content validation boundary, base project resolution, and the audit residue this repo expects on every run as known cost rather than regression.
tags: [audit, expects, contract, discovery, adr-0002, adr-0005, adr-0006]
status: stable
stale_after: 2027-03-19
generated: { by: process:maintain-wiki, at: 2026-09-19T00:00:00Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-18.md
    title: CLAUDE.md as captured before the wiki migration
    last_modified: 2026-08-18
  - id: claude-md-upstream
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/CLAUDE.md
    title: CLAUDE.md in the repo (living version)
  - id: adr-0002
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/decisions/0002-data-driven-audit-contract.md
    title: ADR 0002 in the repo (living version)
  - id: adr-0005
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/decisions/0005-non-rooted-c3-project-support.md
    title: ADR 0005 in the repo (living version)
  - id: adr-0006
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/decisions/0006-detect-discovery-ambiguity.md
    title: ADR 0006 in the repo (living version)
---

# The convention contract and the audit

`plugin/skills/audit-c3-conventions/` is the most code-heavy part of the repo.
The plugin defines a *contract* a consuming repo must satisfy — a C3-project
marker plus both MCP servers reachable at minimum versions — and the audit script
verifies it.[^claude-md]

## The contract is data-driven

Each skill/agent declares its needs under `metadata.expects.{files,config,tools,mcp}`
in its frontmatter. `scripts/audit.mjs` walks every `SKILL.md` and `agents/*.md`
under `${CLAUDE_PLUGIN_ROOT}`, collects their `expects` entries, evaluates each
against the current working directory, and prints a Markdown report grouped by
severity.

**To add a new requirement, add an `expects` entry to the relevant component's
frontmatter — do not hard-code checks in the script**
([ADR 0002](/decisions/0002-data-driven-audit-contract.md)).

An entry with `required: false` reports at `info` severity and never affects the
exit code — that is how an *optional* expectation is expressed without a script
change.

## The two deliberate exceptions

Two things are baked into `audit.mjs` directly because they are **inexpressible**
as `expects` entries:

1. **The C3-project marker** — a bespoke OR-check across three indicators:
   `project.c3proj` exists; `.gvt-agent.json` has `features.c3: true`; or
   `paths.c3project` points at an existing file.
2. **The discovery check** — a small family mirroring how `c3-domain-manager`
   resolves its root, all derived from one shared `project.c3proj` filesystem
   enumeration (`scanC3ProjectMarkers`).

The discovery check emits two advisory findings:

- an **ambiguity `warning`** — ≥2 sibling `project.c3proj` dirs, which makes the
  server abort at startup with `-32000`
  ([ADR 0006](/decisions/0006-detect-discovery-ambiguity.md));
- a **root-divergence `info`** — the `paths.c3project` root differs from what bare
  auto-discovery would pick, so the server may run on a different project than
  the audit validated (added in #49, extending ADR 0006 with no new ADR).

Both are *enumerations/counts*, which the `expects` model can't represent; both
stay within the presence/reachability boundary — they enumerate directories and
read config keys, never parse `.c3proj` contents. Suppression honors an explicit
root pin: a workspace-root `.mcp.json` `--project-dir` / `env.C3_PROJECT_DIR`
override on the `c3-domain-manager` entry, or a live `C3_PROJECT_DIR` env var.

The ambiguity finding introduced the report's **`warning`** tier — advisory,
between `error` and `info`. Neither finding changes the exit code; only an
`error` exits non-zero.

## The validation boundary: presence here, content in chef

The audit validates **contract presence/reachability only** — does a required
file/config/tool/MCP server exist and resolve. That is the entire reach of the
`expects` model.

**Data-content cross-validation** of a C3 project or addon (e.g. an addon's
`aces.json` ↔ its `lang/*.json` strings) is *not* expressible as an `expects`
entry — it parses and cross-references file *contents* — and does **not** belong
in `audit.mjs`. Such checks live in **construct3-chef**, the authoritative tool
the plugin's skills defer to; the plugin's role is to *recommend/run* the chef
tool, not reimplement it.

> **Precedent.** The aces↔lang check proposed as #31 was relocated to
> `construct3-chef#98` (`validate-addon`) for exactly this reason — the same
> family as #32 (bundled-`.c3addon` validation), which already names chef as its
> home.

## `base: project` — non-rooted projects

`files`/`config` expects resolve against the **repo root** by default. An entry
tagged **`base: project`** resolves against the **C3 project root** instead —
derived from `.gvt-agent.json` `paths.c3project` (its `dirname`), falling back to
the repo root when absent.

This is how the audit checks a *non-rooted* project (C3 project in a
subdirectory): `domain-config.json` and `construct3-chef.config.json` are
`base: project` because they live alongside the `.c3proj`, while `.gvt-agent.json`
itself stays repo-root-relative.

Rooted repos (no `paths.c3project`) are unaffected — `base` is just another
data-driven `expects` field, not a script-level check
([ADR 0005](/decisions/0005-non-rooted-c3-project-support.md)).

## Supporting libs

- **`scripts/lib/frontmatter.mjs`** — a *minimal* hand-rolled YAML parser scoped
  to the exact frontmatter shapes used: top-level scalars, one level of nesting
  for `metadata.expects`, arrays of objects. It does **not** handle multiline
  scalars, anchors, or deep nesting — keep frontmatter within those shapes or
  replace the parser.
- **`scripts/lib/config-resolve.mjs`** — resolves dotted keys (`features.c3`)
  against parsed JSON, reporting *where* a path broke.

## MCP probing

Reachability is confirmed by running `npx -y <package> --version` for the
**scoped** package (`@genvidtech/construct3-chef`), since npx resolves by package
name — `npx construct3-chef` would 404.

Both CLIs currently report version as `"unknown"`, so the authoritative version
comes from walking `node_modules` for the backing package's `package.json`
(`resolvePackageVersion`). The `package:` field in an `mcp` expects entry names
that package.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All required expectations met |
| `1` | An `error` finding |
| `2` | Unexpected script error |

[^claude-md]: CLAUDE.md, "The convention contract & the audit".

## Expected audit residue

**A clean run of this repo's audit is not a silent one.** Since `docs/` was retired into
this bundle ([ADR 0012](/decisions/0012-retiring-docs-into-the-wiki-bundle.md)), the audit
reports a stable set of findings that are **known cost, not regression**. Subtract these
before treating any output as a problem.

Measured against **gvt-dev 4.26.0** (at `0a6bacc`, v3.0.0):

| Signal | Expected | Cause |
|---|---|---|
| broken-link warnings | **0** | `wiki/` is **not link-checked at all** any more. gvt-dev #421 closed by *declining* OKF bundle content rather than by fixing the resolution, deferring dead links to `/gvt-dev:maintain-wiki lint` (gvt-dev ADR-0053). See the coverage gap below — this is a zero from a check that did not run. |
| retired-token findings | **8** | The four deliberate retired-token citations this repo carries on purpose, each emitted twice because `scanRetiredTokens` unions the docs-root and wiki-dir walks and this repo's overrides make them the same directory. Tracked upstream as gvt-dev #453. |
| orphaned-doc findings | **0** | **Not a pass**, same as before — but the mechanism changed. It used to be silently inert (`scanOrphanedDocs` looked for a `TOC.md` that this bundle names `index.md`). 4.26.0 now *announces* the skip, on the same ADR-0053 bundle-ownership grounds. Index completeness is still checked by hand. |
| skip-notes | **2** (`info`) | New at 4.26.0: one `… were not link-checked` line naming the wiki file count, one `orphan check skipped` line. Both are the two rows above declaring themselves. |
| Practice Coverage → Environment | **`partial adoption`** | **False.** `scripts/lib/practice-detect.mjs` hard-codes `SCHEMA_DOC = 'docs/wiki-schema.md'` and never consults `config.paths`, so this repo's `"docs/wiki-schema.md": "wiki/wiki-schema.md"` override is ignored — 5 of 6 signals present. gvt-dev **#467** (distinct from #390, which is `maintain-wiki`'s copy of the same hard-coding). |
| exit code | **0** | Only `error` severity moves the exit code; everything above is `warning` or `info`. |
| scanned line | `scanned 20 file(s) under wiki/, CLAUDE.md` | `resolveDocsRoot` derives the docs-tier root from the `docs/TOC.md` override, so the scanners walk `wiki/`. The figure is one per `.md` under `wiki/` sitting outside `hygiene.excludePaths`, plus `CLAUDE.md` — currently 19 + 1. |

### The broken-link invariant is retired — do not run it

Until gvt-dev 4.24.0 this section carried an *invariant* rather than a count: one
broken-link warning per intra-wiki `](/…)` link, checkable by comparing
`grep -c 'broken link'` against a `grep -rho '](/…\.md)' wiki/ | wc -l`, with a stable
offset of two for backticked prose examples the parser correctly ignores. The dated pair
was **79 warnings against 81 raw matches**.

**That check is now a false-red generator and has been removed from this page.** At
gvt-dev 4.26.0 the same two commands return **0** and **87**. Nothing regressed: #421 was
closed by scoping the scan *out* of OKF bundles, so the left-hand number is structurally
zero and can never track the right-hand one again. Anyone running the old check against a
byte-correct `wiki/` reads an 87-link catastrophe and goes editing documents that are
already correct — the exact false-red failure this repo has been bitten by before.

This is why the check is deleted rather than adjusted: a comparison whose left side is
pinned to zero is not a weaker verifier, it is a broken one.

> **Coverage gap, stated plainly.** `wiki/` now has **no dead-link coverage from the
> audit**. The links were not verified — the check was handed to `/gvt-dev:maintain-wiki
> lint`, which nothing currently obliges anyone to run. Run it explicitly when you touch
> links under `wiki/`; a green audit says nothing about them.

> **The `scanned` figure is derivable, and the last move in it is accounted for.** This
> section previously treated the number as opaque — as depending on the audit's internal
> declared-expectation-path resolution rather than on a file count. That was wrong, and it
> was wrong for a mundane reason: the count behind it included only top-level `wiki/*.md`
> and missed `wiki/process/`. Counting every `.md` under `wiki/` that sits outside
> `hygiene.excludePaths`, plus `CLAUDE.md`, reproduces the reported figure exactly.
>
> The move from 18 to 19 happened at `9f1e107` (2026-09-03, #100), which added
> `wiki/verifying-a-pledged-criterion.md` — **the wiki corpus grew by one page, and the
> gvt-dev 4.22.0 → 4.24.0 bump had nothing to do with it.** A version bump is the wrong
> first suspect for this row; the corpus is.
>
> **The rule held a second time.** The move from 19 to 20 happened at `1349681`
> (#115), which added `wiki/dispatching-doc-work.md` — again a corpus growth, again
> concurrent with a gvt-dev bump (4.24.0 → 4.26.0) that had nothing to do with it.
> Counting the corpus at both commits settled it in one command; the bump was, once
> more, the wrong first suspect.
>
> If a run still reports a different number, the **measured** value remains authoritative
> — but count the corpus before concluding the audit changed.

### Three 4.24.0 scans are inert here because of a gate, not because this repo conforms

gvt-dev 4.24.0 added content scans the table above predates. All three fire **zero** times
in this repo — and the reason matters more than the figure:

| Scan | Severity | Checks |
|---|---|---|
| `pointer-anchor` | **error** | that a `file:line` citation carries a content anchor, and resolves it against the target |
| `principle-citation` | **error** | that a citation names a principle number that exists |
| `pillar-unknown` | warning | that a declared `metadata.pillar` value is recognized |

Two of them carry **`error`** severity — the first error-severity content scans the audit
has ever had. They move the exit code where they run.

**They do not run here.** All three sit behind `AUDITING_PLUGIN_SOURCE`, which is true only
when the audited repo *contains the plugin root being audited*. A routine audit of this repo
runs gvt-dev's script out of the installed plugin cache, which is outside this tree, so the
gate is false and the scans never execute.

That is a gate result, not a clean bill of health: **this repo has not been measured against
these three conventions at all.** Note also that the gate is about the *audited repo*, not
about gvt-dev specifically — a future release that widens it, or a run configured so the
plugin root falls inside this tree, would execute two error-severity scans against prose
that has never been checked, and could move the exit code off `0`. This row is where that
expectation belongs.

**Re-confirmed at 4.26.0:** all three still fire zero times and the gate is unchanged.
Note what that evidence is worth — zero findings is equally consistent with "the gate is
closed" and with "the repo conforms", so the figure alone cannot distinguish them. The
claim above rests on the gate, which was re-read in the 4.26.0 source, not on the count.

### Re-run the audit after editing `wiki/`, and compare against this table

The table above says what the residue *should* be; nothing currently tells a contributor
to **check** it. Adding or editing a page under `wiki/` can move these figures — a new page
outside `hygiene.excludePaths` moves `scanned`, and a retired-token citation moves the
token count. That change is invisible in the authoring PR and surfaces later, in someone
else's unrelated audit run, as residue they did not cause.

(Adding a bundle-absolute link no longer moves anything, because that scan no longer runs
here — see *The broken-link invariant is retired* above, and run `maintain-wiki lint`
instead.)

So before opening a PR that touches `wiki/`, run the audit and diff the signals
against this table:

```
node ~/.claude/plugins/cache/gvt-plugins/gvt-dev/<version>/skills/audit-conventions/scripts/audit.mjs
```

Unchanged figures are the expected outcome and cost one command. A **moved** figure is
not automatically a defect — it may be the legitimate consequence of the page you just
added — but it must be *noticed*, and either explained in the PR or folded into this
table as part of the same change.

Worked example **[point-in-time: gvt-dev 4.24.0, not reproducible today]** (2026-09-15,
#107): a branch that added `wiki/decisions/0015-*.md` and edited
`wiki/pin-bump-verification.md` re-ran clean at **79 / 81 / `scanned 19` / exit 0** —
identical to the 4.24.0 baseline, because `wiki/decisions/` sits in
`hygiene.excludePaths` and the edits added no bundle-absolute links. The check cost one
command and converted an assumption into a fact. **The first two figures cannot recur**
— the broken-link scan no longer runs here — so read this as a record of the method
working, not as numbers to match.

**These numbers are pinned to a gvt-dev version and will move — and the last forecast
came true.** The previous revision predicted that "when #421 lands the broken-link count
goes to 0"; #421 landed, and it did. What the forecast got wrong is worth keeping: it
also said "when #390 lands the Practice Coverage row returns … to `adopted`", but #390 is
`maintain-wiki`'s hard-coding, and the audit's own copy lives in
`scripts/lib/practice-detect.mjs` and is tracked separately as **gvt-dev #467**. Fixing
#390 alone would not have moved this row. **A residue row should cite the issue that
gates *it*, not the nearest issue about the same bug** — the two can be fixed on
different schedules.

Re-measure on the next gvt-dev bump rather than carrying this table forward — which is
why this page's `stale_after` sits in the six-month bucket for version-pinned content
rather than the one-year bucket its topic would otherwise get.

## Related

- [Verifying an MCP pin bump](/pin-bump-verification.md) — the `resolveRootFolder` mirror this script hand-maintains.
- [Skill authoring conventions](/skill-authoring-conventions.md) — including the rule that remediation prose must not describe an unimplemented check.
- [The knowledge boundaries](/knowledge-boundaries.md) — why content validation belongs to chef.
