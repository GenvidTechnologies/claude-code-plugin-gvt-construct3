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

See [`docs/wiki-schema.md`](../docs/wiki-schema.md) for the page format and
maintenance rules.

> **Scope.** This bundle covers the **dev workspace**. The shipped C3 platform
> reference is a *separate* OKF bundle at `plugin/docs/c3/`, maintained by hand
> against `construct3-sample` rather than by `ingest` — see the schema doc's
> two-bundles note. Don't index its pages here.

## Architecture

* [The knowledge boundaries](knowledge-boundaries.md) - The four homes C3 knowledge is split across — this plugin's platform reference, chef's tooling docs, the consuming repo's CLAUDE.md, and cross-tool wiring — plus c3source as a fifth home the agents never read.
* [The convention contract and the audit](the-audit-contract.md) - How audit-c3-conventions validates a consuming repo — the data-driven expects model, the two checks deliberately baked into the script, the presence-vs-content validation boundary, and base project resolution.
* [Agent capability envelopes](agent-capability-envelopes.md) - The two agents' model and tools frontmatter is a functional constraint, not documentation — don't instruct an agent to do what it cannot observe or call.

## Verification practice

* [Verifying docs/c3 against construct3-sample](verifying-against-construct3-sample.md) - How a C3 platform fact in plugin/docs/c3/ is proved against the editor-validated construct3-sample project, how its provenance is cited, and the four traps that have each shipped a wrong doc.
* [Verifying an MCP pin bump](pin-bump-verification.md) - Why a pin-bump issue's tool/surface table is an assertion to test rather than ground truth, and the mechanical checks — pack and diff, observed exit status, count anchors — that catch what the issue body gets wrong.

## Maintainer procedures

* [Doc inventories, ADRs, and the changelog](doc-inventories.md) - Which hand-maintained inventories a new skill, a new docs/c3 doc, or even a new section must be added to — plus why ADRs are never rewritten and why a pure content correction still earns a CHANGELOG entry.
* [Skill authoring conventions](skill-authoring-conventions.md) - Frontmatter keys are fixed; scripts split a pure lib from a thin I/O CLI with tests at a path validation actually globs; and remediation prose must never describe a check the script does not yet implement.
* [Deferring an issue upstream](deferring-issues-upstream.md) - How an issue that belongs to construct3-chef gets relocated — file it there in the same session, cross-link both ways, and label the origin-side umbrella blocked-upstream so triage stops ranking it.
* [Working with the code reviewer](working-with-code-review.md) - The reviewer recurrently over-escalates valid-but-unusual Markdown to critical — how to verify the severity against the spec, and why a sound finding can still carry a remedy that is wrong for this repo.
