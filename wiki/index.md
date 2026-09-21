---
okf_version: "0.2"
---

<!-- `okf_version` is the ONLY frontmatter key permitted here (§8/§12) — this
     file is the bundle-root index for the dev-workspace wiki. A
     `wiki/<subdir>/index.md` carries NO frontmatter at all. -->

# Wiki Index

The dev-workspace wiki for `claude-code-plugin-gvt-construct3` — how maintaining
*this plugin* works. Every page under `wiki/` is listed here, one line each,
grouped under section headings. `/gvt-dev:maintain-wiki` keeps the list current:
a new page is registered here when it's created, and `lint` flags any page listed
in **no** index. Each entry's description is the linked page's frontmatter
`description`, so the index and the page can't drift.

See [`wiki-schema.md`](wiki-schema.md) for the page format and
maintenance rules.

> **Scope.** This bundle covers the **dev workspace**. The shipped C3 platform
> reference is a *separate* OKF bundle at `plugin/docs/c3/`, maintained by hand
> against `construct3-sample` rather than by `ingest` — see the schema doc's
> two-bundles note. Don't index its pages here.

## Architecture

* [The knowledge boundaries](knowledge-boundaries.md) - The four homes C3 knowledge is split across — this plugin's platform reference, chef's tooling docs, the consuming repo's CLAUDE.md, and cross-tool wiring — plus c3source as a fifth home the agents never read, and the rule that docs/c3 names chef's capabilities but never chef's symbols.
* [The convention contract and the audit](the-audit-contract.md) - How audit-c3-conventions validates a consuming repo — the data-driven expects model, the two checks deliberately baked into the script, the presence-vs-content validation boundary, base project resolution, and the audit residue this repo expects on every run as known cost rather than regression.
* [Agent capability envelopes](agent-capability-envelopes.md) - The two agents' model and tools frontmatter is a functional constraint, not documentation — don't instruct an agent to do what it cannot observe or call.
* [The artifact / workspace split](artifact-workspace-split.md) - Why the shipped plugin lives in plugin/ while the repo root is a gvt-dev dev workspace, what each side owns, and why that split forced the marketplace entry onto a git-subdir source rather than a plain url.

## Verification practice

* [Verifying docs/c3 against construct3-sample](verifying-against-construct3-sample.md) - How a C3 platform fact in plugin/docs/c3/ is proved against the editor-validated construct3-sample project, how its provenance is cited, and the seven traps that each shipped a wrong doc or came one decision from it.
* [Verifying an MCP pin bump](pin-bump-verification.md) - Why a pin-bump issue's tool/surface table is an assertion to test rather than ground truth; the mechanical checks that catch what the issue body gets wrong; why a resource repath needs a live resources/list probe even when the tool surface is byte-identical; how the resolveRootFolder mirror obligation is discharged and escalated once its dependency range moves; and why the explorer allow-list is not chef's READ_ONLY set.
* [Verifying a pledged acceptance criterion](verifying-a-pledged-criterion.md) - How a criterion's own check goes wrong — a grep standing in for coverage, a recount standing in for a diff, a diff read with context standing in for its changed lines, a hand-guessed mutation standing in for a discriminating one, a token count standing in for the sites it means, and a line range standing in for an anchor — with the measurement that settles each.
* [Grounding a claim in chef's package source](grounding-in-chef-source.md) - How to answer a design question about construct3-chef or c3-domain-manager from the pinned package's compiled source rather than from memory or a README — and the three failure shapes that recipe exists to prevent.

## Maintainer procedures

* [Doc inventories, ADRs, and the changelog](doc-inventories.md) - Which hand-maintained inventories a new skill, a new docs/c3 doc, or even a new section must be added to; how to scope an absence criterion and why every such row needs auditing; why a discovery sweep must be as broad as the defect class it describes; the intra-repo anchor checker and the index-mirror checker — plus why ADRs are never rewritten and the one metadata defect that is corrected in place, why a file:line citation can be falsified by your own PR, why a pure content correction still earns a CHANGELOG entry, and why a link inside the shipped plugin subtree must never escape it.
* [Skill authoring conventions](skill-authoring-conventions.md) - Frontmatter keys are fixed; scripts split a pure lib from a thin I/O CLI with tests at a path validation actually globs; mutation-testing an extraction tells an untested branch from a non-discriminating one, which must be annotated rather than tested; remediation prose must never describe a check the script does not yet implement; and prose must never restate a value a declarative source already owns.
* [Deferring an issue upstream](deferring-issues-upstream.md) - How an issue that belongs to construct3-chef gets relocated — check chef's docs for existing coverage first, then file it there in the same session, cross-link both ways, and label the origin-side umbrella blocked-upstream so triage stops ranking it.
* [Dispatching documentation work](dispatching-doc-work.md) - tech-writer fabricates plausible concrete detail beyond its source, so classify by payload rather than genre — prose can be dispatched, but symbols, paths, field names and schemas are authored inline, and an ADR is not exempt for reading like prose.
* [Working with the code reviewer](working-with-code-review.md) - The reviewer recurrently over-escalates valid-but-unusual Markdown to critical — how to verify the severity against the spec, why a sound finding can still carry a remedy that is wrong for this repo, why its silence on an inherited claim is not verification, and why its per-row verdict can contradict the measurement in its own evidence column.
* [Issue triage conventions](issue-triage-conventions.md) - This repo's flat-label triage model — one category label, no priority scheme, question doubling as needs-info, and the blocked-upstream lifecycle — plus why a small clean backlog is still worth triaging.
* [The npm surface and the CI gate](the-npm-surface-and-ci-gate.md) - Why the manifest and lockfile live in plugin/ and nowhere else, why an empty dependency set still makes a real gate, and the four measured ways a check here passes while verifying nothing — npm ci walking up to an ancestor manifest, a glob matched from the wrong directory, a wrong path reporting as a deleted lockfile, and a reporter whose counters cannot be grepped.

## Decision records

* [Decision records](decisions/index.md) - Architecture and compromise decisions for the dev workspace and plugin design; the issue linked in each record carries the original context. Historical records — never rewritten in place.

## Process contracts

* [Process contracts](process/index.md) - Contracts read *by path* by a `gvt-dev` skill rather than by a human, resolved through `.gvt-agent.json` `paths` overrides.

## Contract

* [Wiki Maintenance Schema](wiki-schema.md) - The maintenance schema for this three-tier wiki (`raw/` captures → `wiki/` pages → the schema itself), consumed by `/gvt-dev:maintain-wiki`.
