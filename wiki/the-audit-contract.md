---
type: reference
title: The convention contract and the audit
description: How audit-c3-conventions validates a consuming repo — the data-driven expects model, the checks deliberately baked into the script, the presence-vs-content validation boundary, base project resolution, and the audit residue this repo expects on every run as known cost rather than regression.
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

## The deliberate exceptions

Three things are baked into `audit.mjs` directly because they are **inexpressible**
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

3. **The local-install check** (#167) — for each server package pinned in
   `plugin.json` `mcpServers`, it reads `node_modules/<package>/package.json` in
   the repo root and, when `paths.c3project` resolves elsewhere, in the project
   root. When the installed version differs from the pin it emits one
   **`local-install` `info`** per server and location: the agents talk to the
   pinned server while the repo's own npm scripts run the local copy. It compares
   against the plugin's pin, which no component's `expects` can name. It reads
   exactly that file, never an ancestor's `node_modules` and never via `npx`, and
   it is never an input to the MCP version check below. The pure logic is
   `scripts/lib/local-install.mjs`
   ([ADR 0026](/decisions/0026-local-install-lag-is-a-separate-info-finding.md)).

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

## Mechanism and policy

The audit's **mechanism** comes from the published
[`@genvidtech/audit-core`](https://github.com/GenvidTechnologies/audit-core)
package, pinned exactly in `plugin/package.json`
([ADR 0022](/decisions/0022-audit-core-adoption-and-npm-ci-in-validate.md)). It
provides component discovery (`walkComponents`), the frontmatter parser
(`extractFrontmatter`), dotted-key resolution (`resolveKey`, which reports *where*
a path broke), the existence probes, and the `file` / `config` / `tool`
evaluators. The **policy** stays here, per gvt-dev's ADR-0049 mechanism/policy
split:

- **`scripts/lib/audit.mjs`** contains the path resolution. Its `evaluateFile` /
  `evaluateConfig` wrappers hand audit-core a synchronous resolver. The resolver
  picks the root (`base: project`), defaults the config source to
  `.gvt-agent.json`, and appends the ` (project root: …)` suffix to `target`.
  The same file also holds the C3 marker, discovery-ambiguity and root-divergence
  checks, severity, the tally, and `formatReport`.
- **`scripts/lib/mcp-check.mjs`** is the `mcp` evaluator. audit-core has no
  equivalent.
- **`scripts/lib/preflight.mjs`** checks that audit-core can actually be
  imported, before anything else runs. The CLI `scripts/audit.mjs` runs it
  first and exits **2** with a message naming the package and the
  `npm ci --prefix <plugin root>` fix. Without it, the failure would be a bare
  module-resolution error.

Every `expects`-derived finding carries a `required` boolean alongside `severity`.
The tally still reads only `severity`. `target` is display text: never match on
it, because it can carry the project-root suffix.

Since audit-core 0.3.0 (#152), frontmatter is parsed by the `yaml` package as
YAML 1.2. It is no longer a hand-written subset parser, so frontmatter must be
real YAML:

- In a plain scalar, ` #` starts a comment, so everything after it is cut off.
  An unquoted `reason: … (construct3-chef #89) …` lost its tail this way until
  #151 quoted it.
- A colon-space inside a plain scalar is a parse error.
- `''` inside a single-quoted scalar unescapes to `'`.

Quote any scalar that contains ` #` or `: `.

A component whose file can't be read (`readError`), or whose frontmatter `yaml`
rejects (`parseError`), comes back from `walkComponents` with `expects: null`.
`evaluateComponentLoad` in `scripts/lib/audit.mjs` reports it as an **error**
finding (`required: true`) that names the component file and carries the
`code: message`. The audit then exits 1. Under 0.2.1, an unreadable component
crashed the whole walk, and malformed frontmatter was partly parsed. 0.3.0's two
new shapes would have been skipped silently without this check.

Since audit-core 0.4.0 (#160), a file with **no frontmatter block** is a
`parseError` too, with code `NO_FRONTMATTER`. That covers no `---` fence, an empty
file, a BOM or blank line before the fence, an unclosed fence, and adjacent fences
with nothing between them. Under 0.3.0 such a file came back with `expects: null`
and no error flag, so it gave zero findings. 0.4.0 also reports a `skills/` or
`agents/` tree that can't be read as one `readError` record named `skills/` or
`agents/`; the finding names the tree, not a file inside it.

A component that loads but declares its expectations in the wrong shape is reported the
same way, as an **error** (`kind: 'expects'`, `required: true`) naming the component file
and the offending dotted path (#156). The shapes it catches:

- a `metadata` or `metadata.expects` that is not a mapping;
- a key under `expects` other than `files`, `config`, `tools` and `mcp`;
- a key whose value is not a list;
- an entry that is not a mapping;
- an entry missing its required string field: `path` for files, `key` for config,
  `command` for tools, `server` and `package` for mcp;
- a config `in` or an mcp `minVersion` that is present but not a string. The evaluators
  use both as strings, so a number there would crash the audit;
- an `expects` block in the wrong place (#157): a top-level `expects`, or a top-level or
  `metadata` key that is a near-miss of `expects`, meaning case-insensitive and within
  edit distance 2 (`expect`, `Expects`) or starting with `expect` (`expectations`).
  audit-core reads only `metadata.expects`, so such a block used to give zero findings.
  Other `metadata` keys, such as `pillar`, pass silently
  ([ADR 0025](/decisions/0025-near-miss-expects-keys-are-errors-other-metadata-keys-pass.md)).

A null or absent key still means "no entries". The other optional fields (`required`,
`reason`, `base`) are not type-checked, because they are only compared or rendered. Each bad key or entry gets its own
finding, and the component's well-formed entries are still evaluated, so a typo does not
hide a genuinely missing file. Before #156, some of these shapes gave zero findings,
some made `evaluateComponentFindings` throw (exit 2, without naming the component), and
some gave findings with an `undefined` or `null` target.

**`main()` has no test coverage. Put a new per-component check in
`evaluateComponentFindings`, never inline in `main()`.** `main()` resolves the plugin root
from its own file location, makes live `npx` probes, and ends in `process.exit`, so
no test drives it. ADR 0022 rejected a committed end-to-end test for the `npx` reason.
`main()` calls the exported `evaluateComponentFindings(component, repoRoot, projectRoot)`
for each walked component, and that function is the testable seam. This is measured,
not assumed: when #152's load check was first wired inline in `main()`, a mutation
deleting that call left all 89 tests in `audit.test.mjs` passing. Once the check moved
into `evaluateComponentFindings`, the same mutation failed exactly the test written for
it.

## MCP probing

The version checked against an `mcp` entry's `minVersion` is **the plugin's own pin**:
the argument of `mcpServers[<server>].args` in `plugin/.claude-plugin/plugin.json`
that starts with `<package>@`, where `package:` is the scoped npm name the `mcp`
expects entry declares. That is the server the agents actually talk to, so the
consuming repo's `node_modules` plays no part in the check — installing or removing
a devDependency cannot change the verdict. A local copy that differs from the pin
is reported separately, by the `local-install` `info` described under
[The deliberate exceptions](#the-deliberate-exceptions); that finding never feeds
this check.

Reachability is confirmed by running that exact pinned spec,
`npx -y <package>@<pin> --version` — the **scoped** package, since npx resolves by
package name (`npx construct3-chef` would 404), at the **pinned** version rather than
`latest`. The probe runs from a fresh `mkdtemp` directory holding an empty `{}`
`package.json`, which stops npm's upward project walk there: a cwd (or ancestor)
whose project satisfies the spec makes npx run a local bin instead of fetching, and
`os.tmpdir()` alone can itself be such a project.

The spec is checked against a strict `@scope/name@x.y.z` allow-list
before it reaches a shell. On Windows `npx` is `npx.cmd`, which Node spawns only
through `cmd.exe`, so the probe passes one command string with no args array there.
An args array alongside `shell: true` is deprecated (`DEP0190`) and is concatenated
into the command line unescaped. On other platforms it passes an args array with no
shell. The spec is validated rather than quoted, because `cmd.exe` can't reliably
escape `"` or `%`. A spec that fails the check never reaches `spawn` and creates no
probe directory. It surfaces as the ordinary `not reachable via npx` finding with a
`refusing to probe` detail.

The decision and the measurements behind it are in
[ADR 0021](/decisions/0021-mcp-check-reads-the-plugin-pin-and-probes-sealed.md) and
[ADR 0023](/decisions/0023-validate-spec-before-a-windows-shell-string.md).
The verdict logic is the pure `scripts/lib/mcp-check.mjs`; `audit.mjs` only reads
`plugin.json` and supplies the real `spawnSync`.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | All required expectations met |
| `1` | An `error` finding |
| `2` | The dependency preflight failed (`plugin/node_modules` is missing or incomplete; run `npm ci --prefix plugin`), or an unexpected script error |

## Verifying a change leaves the output unchanged

When a change to `audit-c3-conventions` should not change what it reports, check that
with the kept harness `scripts/audit-diff.mjs` (#136), not a one-off comparison:

```bash
node scripts/audit-diff.mjs                  # origin/main vs the working tree
node scripts/audit-diff.mjs v3.0.0 HEAD      # any two refs
```

It checks each ref out into a temporary worktree and installs that ref's own
`plugin/` dependencies. It then runs the ref's `audit.mjs` against each fixture
project in `scripts/test/fixtures/audit-diff/`, with the fixture as the working
directory. For each fixture it prints `IDENTICAL` or a unified diff, alongside
each side's exit code, and it fails when its control fixture matches `rooted`.
It exits `0` only when every fixture is identical, in output and exit code, and
the control distinguishes. It exits `1` on any difference, on an inert control,
or when a side could not run; an audit that stops at its dependency preflight
counts as not run. It exits `2` on a usage error or a ref that doesn't resolve.
Every run makes live `npx` MCP probes, so a registry failure can show up as a
difference. Read the diff before believing it.

[^claude-md]: CLAUDE.md, "The convention contract & the audit".

## Expected audit residue

**A clean run of this repo's audit is not a silent one.** Since `docs/` was retired into
this bundle ([ADR 0012](/decisions/0012-retiring-docs-into-the-wiki-bundle.md)), the audit
reports a stable set of findings that are **known cost, not regression**. Subtract these
before treating any output as a problem.

Re-measured against **gvt-dev 4.45.0** on 2026-10-31 (at `f8c55b2`). Three things moved
since the **gvt-dev 4.34.0** measurement of 2026-10-13 (at `824bf20`). Two came from
gvt-dev 4.40.0: the retired-token count halved, and the single `scanned` line split into
one line per scanner. The third is this page's own: the table now records the Summary's
advisory count, which the audit already printed. Every other row is unchanged. The Practice Coverage row moved earlier, at gvt-dev 4.30.0; the first
measurement was against gvt-dev 4.26.0 at `0a6bacc`, v3.0.0:

| Signal | Expected | Cause |
|---|---|---|
| broken-link warnings | **0** | `wiki/` is **not link-checked at all** any more. gvt-dev #421 closed by *declining* OKF bundle content rather than by fixing the resolution, deferring dead links to `/gvt-dev:maintain-wiki lint` (gvt-dev ADR-0053). See the coverage gap below — this is a zero from a check that did not run. |
| retired-token findings | **4** | The four deliberate retired-token citations this repo carries on purpose: three in `wiki/doc-inventories.md`, one in `wiki/log.md`. Each is reported once. Up to gvt-dev 4.39.0 each was reported twice, because this repo's overrides make the docs-root and wiki-dir walks the same directory. gvt-dev #453 fixed that in 4.40.0. |
| orphaned-doc findings | **0** | **Not a pass**, same as before — but the mechanism changed. It used to be silently inert (`scanOrphanedDocs` looked for a `TOC.md` that this bundle names `index.md`). gvt-dev 4.25.0 began *announcing* the skip, on the same ADR-0053 bundle-ownership grounds (this repo first measured it at 4.26.0, having skipped 4.25.0). Index completeness is still checked by hand. `scripts/audit-snapshot.mjs` reports this row as `orphaned-doc: 0`. Until #169 narrowed its pattern it matched the bare word `orphan`, counted the skip note, and reported 1. |
| skip-notes | **2** (`info`) | New at gvt-dev 4.25.0, first measured here at 4.26.0: one `… were not link-checked` line naming the wiki file count, one `orphan check skipped` line. Both are the two rows above declaring themselves. |
| Practice Coverage → Environment | **`adopted`** | **Correct since gvt-dev 4.30.0**, which fixed **#467** (closed 2026-10-11). `scripts/lib/practice-detect.mjs` now resolves the schema doc through `config.paths`, so this repo's `"docs/wiki-schema.md": "wiki/wiki-schema.md"` override is honoured. Up to 4.29.0 it hard-coded `SCHEMA_DOC = 'docs/wiki-schema.md'` and reported a false `partial adoption`, with 5 of 6 signals present. #390, `maintain-wiki`'s copy of the same hard-coding, is still open and did not gate this row. |
| advisory findings | **6** | The Summary's advisory count: the 4 retired-token findings plus the 2 skip-notes. It was 10 up to gvt-dev 4.39.0, when the retired-token findings were doubled. |
| exit code | **0** | Only `error` severity moves the exit code; everything above is `warning` or `info`. |
| scanned line, retired tokens | `scanned 22 file(s) for retired tokens under wiki/, CLAUDE.md, .gvt-agent.json` | `resolveDocsRoot` derives the docs-tier root from the `docs/TOC.md` override, so the scan walks `wiki/`. The figure is one per `.md` under `wiki/` sitting outside `hygiene.excludePaths`, plus `CLAUDE.md`, plus the git-tracked `.gvt-agent.json` — currently 20 + 1 + 1. |
| scanned line, links | `scanned 1 file(s) for links under CLAUDE.md (20 under wiki/ declined, see Info)` | Only `CLAUDE.md` is link-checked. The 20 wiki pages are declined as OKF bundle content, the same skip the broken-link row describes. |
| scanned line, index coverage | `scanned 0 file(s) for index coverage (docs root wiki/ is inside the wiki bundle wiki/; declined, see Info)` | The orphan check reads nothing here, the same skip the orphaned-doc row describes. |

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
> `hygiene.excludePaths`, plus `CLAUDE.md`, plus the git-tracked config files the
> retired-token scan reads (today only `.gvt-agent.json`), reproduces the retired-token
> `scanned` figure exactly.
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
> **The third move was the exception, and counting the corpus is still what showed it.**
> The figure went from 21 to 22 with gvt-dev 4.40.0 (#401), while the corpus stayed at 20
> pages. 4.40.0 split the single `scanned` line into one line per scanner, built from each
> scanner's own file set, and the retired-token scanner's set includes git-tracked
> repo-root config files. It has scanned them since gvt-dev 4.3.0 (#134): the 4.39.0
> `hygiene.mjs` already lists `.gvt-agent.json` in its config allow-list and intersects it
> with `git ls-files`. The old line simply never listed them. So `.gvt-agent.json` has
> been read since 4.3.0, and 4.40.0 only started *reporting* it. Today's figure is 20 wiki
> pages outside `hygiene.excludePaths`, plus `CLAUDE.md`, plus `.gvt-agent.json`: 22. For
> this figure the version bump changed what the line reports, not which files the scan
> reads. (4.40.0 did change the finding count, through the deduplication in the row
> above.) That could only be established by counting the corpus first and finding it
> unchanged.
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
outside `hygiene.excludePaths` moves the retired-token `scanned` line and the links line's
declined count, and a retired-token citation moves the token count and the advisory
count. That change is invisible in the authoring PR and surfaces later, in someone else's
unrelated audit run, as residue they did not cause.

(Adding a bundle-absolute link no longer moves anything, because that scan no longer runs
here — see *The broken-link invariant is retired* above, and run `maintain-wiki lint`
instead.)

So before opening a PR that touches `wiki/`, run the audit and diff the signals
against this table:

```
node ~/.claude/plugins/cache/gvt-plugins/gvt-dev/<version>/skills/audit-conventions/scripts/audit.mjs
node scripts/audit-snapshot.mjs --audit ~/.claude/plugins/cache/gvt-plugins/gvt-dev/<version>/skills/audit-conventions/scripts/audit.mjs
```

The second command reduces the same run to four lines (`broken-link`, `retired-token`,
`orphaned-doc`, `exit`), which map onto rows of the table. If a digest line disagrees with
its row, the digest or the table is wrong, and the run has found a defect either way.
Up to #169 the digest printed `orphaned-doc: 1` against the table's 0, and nobody
noticed, because this section asked only for the raw audit.

Unchanged figures are the expected outcome and cost two commands. A **moved** figure is
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
different schedules. That is what happened: #467 shipped in gvt-dev 4.30.0 and the row
returned to `adopted`, while #390 is still open (re-measured 2026-10-12 on 4.33.0).

**Date a change by the release that shipped it, not by the first version measured here.**
This repo does not measure every gvt-dev release, so the first measurement that shows a
change can be later than the release that made it. Take the version from the gvt-dev
CHANGELOG's `## [x.y.z]` heading, and when this repo skipped that release, write "new at
X, first measured here at Y". The orphan skip note is the example: this page dated it to
4.26.0 because the measurements jumped from 4.24.0 to 4.26.0, but it shipped in 4.25.0.
The wrong version was then copied into new code, and only a CHANGELOG check caught it.

Re-measure on the next gvt-dev bump rather than carrying this table forward — which is
why this page's `stale_after` sits in the six-month bucket for version-pinned content
rather than the one-year bucket its topic would otherwise get.

## Related

- [Verifying an MCP pin bump](/pin-bump-verification.md) — the `resolveRootFolder` mirror this script hand-maintains.
- [Skill authoring conventions](/skill-authoring-conventions.md) — including the rule that remediation prose must not describe an unimplemented check.
- [The knowledge boundaries](/knowledge-boundaries.md) — why content validation belongs to chef.
