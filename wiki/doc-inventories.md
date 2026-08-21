---
type: practice-note
title: Doc inventories, ADRs, and the changelog
description: Which hand-maintained inventories a new skill, a new docs/c3 doc, or even a new section must be added to; how to scope an absence criterion and why every such row needs auditing; the intra-repo anchor checker — plus why ADRs are never rewritten and why a pure content correction still earns a CHANGELOG entry.
tags: [docs, inventories, changelog, adr, drift]
status: stable
stale_after: 2027-08-18
generated: { by: process:maintain-wiki, at: 2026-08-21T00:00:00Z }
sources:
  - id: claude-md
    resource: ../raw/claude-md-2026-08-18.md
    title: CLAUDE.md as captured before the wiki migration
    last_modified: 2026-08-18
  - id: claude-md-upstream
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/CLAUDE.md
    title: CLAUDE.md in the repo (living version)
---

# Doc inventories, ADRs, and the changelog

Several inventories in this repo are hand-maintained and **drift silently**.
Each rule below exists because a retro found one that had already drifted.[^claude-md]

## Before slimming, moving, or deleting a doc section, grep for referrers

`CLAUDE.md` and other docs cross-reference **specific sections**, not just files
— e.g. a callout once deep-linked
`tool-surface-reconciliation.md → "Grounding skill/doc design in chef behavior"`.
A naive "slim this doc" edit can silently break such a link by removing the
target heading. Check `grep -rn "<section title>"` and repoint the referrer **in
the same commit** as the move.

### Grep the file name, not just `file#anchor`

**The anchor grep alone gives false confidence.** The more common referrer shape
is a *bare-file link or a prose mention* that names the doc and describes the
section in words — no `#anchor` for an anchor-grep to find:

- `[knowledge boundaries](../CLAUDE.md)` — a bare-file link whose *text* names a
  section that no longer lives there;
- "see the validation boundary in `CLAUDE.md`" — pure prose, no link at all.

Both shapes survive `grep -rn "CLAUDE.md#"` untouched, and both point at content
that has moved. Precedent: the `CLAUDE.md` → `wiki/` migration ran the anchor
grep, got a clean result, and still left exactly these two references stale in
`docs/tool-surface-reconciliation.md` and `docs/issue-triage.md`.

So run **three** greps before gutting a doc, not one:

```bash
grep -rn "<doc>.md#"      # deep-links to a heading
grep -rn "<doc>.md"       # bare-file links — the shape that actually rots
grep -rn "<section title>" # prose mentions that name the section in words
```

The middle one is the one that gets skipped, because a bare-file link **still
resolves** — the file is right there. It is not a broken link; it is a *correct
link to the wrong place*, which no link checker will ever flag.

## Adding a skill touches more than its own directory

A skill's existence is recorded in several hand-maintained places.
`build-reference` shipped in #19 but was missing from **both** shipped
inventories until a later retro. When you add `plugin/skills/<name>/`, also
update:

- the **README skill table**;
- the **`plugin/CONVENTIONS.md` skill table** — the shipped contract, which
  consumers read;
- the **skill list in `CLAUDE.md`** (under Components);
- **`plugin/CHANGELOG.md`**.

Prefer non-counted phrasing ("skills include…") over "N skills exist", so a
hardcoded count can't go stale. `docs/TOC.md` needs nothing — it points at the
README for the inventory.

## Adding a docs/c3 reference doc touches three *exhaustive* description surfaces

Unlike skills, each `docs/c3/*` doc is listed **individually** in *both*
`plugin/docs/c3/index.md` (the doc table) **and** `docs/TOC.md` (the "C3 platform
reference" list). Update both in the same commit — a retro found `docs/TOC.md`
had been missing `ace-reference.md` and `toolchain-config.md` since they shipped.

Since #79 made `plugin/docs/c3/` an OKF bundle, each doc's own YAML
**frontmatter `description:`** is a **third** surface, enumerating the same
content areas the other two do, and it drifts the same way. This rule predates
#79, which is why it originally named only two — reconcile all three in the
same commit. Evidence from #70: `construct3-guide.md`'s frontmatter description
omitted its TypeScript-integration and layout-architecture sections;
`typescript-integration.md`'s omitted the facade-pattern section;
`layout-reference.md`'s omitted localization, instance-naming, and navigation —
all three corrected alongside the two prose inventories.

Cross-link a companion doc both ways (e.g. `addon-package-reference.md` ↔
`ace-reference.md`).

The *prose* doc-lists in the root `README.md` and `plugin/CONVENTIONS.md` are
**representative, not exhaustive** — they already omit several docs. Leave them.
And per the [knowledge-boundary rule](/knowledge-boundaries.md), don't restate in
one `docs/c3` doc what a sibling owns; link instead.

**Reconcile each surface against the doc's own `##` headings, not against a
sibling inventory.** The three surfaces don't just go stale together — they can
*contradict each other*, and agreement between two of them is not evidence
either is right. #70 found `docs/TOC.md` naming `layout-reference.md`'s
navigation content while `plugin/docs/c3/index.md` did not: two inventories
asserting different content areas for the same doc, and neither flagged
because nothing checks agreement between them. Only the doc's own headings are
ground truth.

## Adding a *section* stales those inventories' descriptions, even with no new row

The rule above is about a *new doc* needing new rows; the adjacent case is easy
to rule out too fast. All three surfaces describe each doc with a one-liner that
**enumerates its content areas** ("layout/layer JSON, render order, the
template/replica system, …"), so a new `##` section belongs in that enumeration
even when no row is added.

> **Precedent.** #59 added `## Effects` to `layout-reference.md`. "No new doc ⇒
> no inventory change" was the right call for *rows* and the wrong one for
> *descriptions* — the code reviewer caught both, not the rule.

Ask **"does this doc now cover a content area its one-liners don't name?"**, not
just "is this a new doc?".

## A docs/c3 content *correction* earns a CHANGELOG entry

The rules above fire on *additions* — a new skill, a new doc, a new `##` section
— which makes it easy to read a pure correction as inventory-neutral and
therefore CHANGELOG-neutral. **It is not.**

`plugin/CHANGELOG.md` ships to consumers, and a corrected platform fact is the
single most actionable thing in a release, because a reader **may have already
authored JSON from the wrong version**. Every prior correction pass did this
(#59 and #63 both landed `### Fixed` entries); the rule was simply never written
down, and #72's plan omitted it until review.

Say **what was wrong, what it is now, and what a reader who believed the old text
should go re-check.**

## An "absence" criterion must be scoped to the surface where the defect lived

A tempting acceptance criterion for a removal pass is *"grep for `X` returns 0
hits repo-wide."* That row is falsified by the change's own CHANGELOG entry (and
by any ADR or issue comment describing the work), because **documenting a removal
requires naming the removed thing**.

The failure is in the criterion, not the changelog: laundering the name out of
the entry is a **regression** — a consumer can no longer grep their own project
for the string this release removed.

Scope the grep (`git grep X -- plugin/docs/c3/`), keep the baseline in the row so
it stays non-vacuous, and let the release notes say the name. Precedent: #72's R2
was written as "0 hits repo-wide" before its own CHANGELOG entry existed, and had
to be re-scoped at review.

### Audit *every* absence row — fixing one manufactures confidence in the rest

The rule above is easy to apply once and stop. #76's criteria table did exactly
that: its `toggleInteractiveLayers` row was correctly scoped to
`plugin/docs/c3/` **and** paired with a positive control requiring the CHANGELOG
to name the string — and then, four rows later, the retired-anchor row was
written `git grep '#7-c3-conventions'` **tree-wide**. Same table, same author,
same defect the row above had just been written to avoid. It passed planning
review, because a table that visibly gets the hard case right does not invite a
re-read of the easy ones.

The tell is mechanical, so apply it row by row: **does this row assert that a
name is gone, while the release notes must still say that name?** If yes it is
the defective shape, whatever else in the table is already correct. Both of
#76's rows had it; only one was caught before execution.

Note also *when* this surfaces. The tree-wide row's baseline was accurate when
written — one hit, in the file being edited — so a premise re-check at planning
time passes it. It only became unsatisfiable once the CHANGELOG task ran, i.e.
**the plan's own later work falsified its own earlier criterion**. That is a
distinct failure from a row that decayed or was born wrong, and no gate before
execution can catch it.

## The intra-repo anchor checker

`scripts/check-doc-anchors.mjs` (dev-workspace, dependency-free, added in #76)
resolves every intra-repo markdown link against real GitHub heading slugs —
including the double-hyphen rule a stripped em-dash produces. It is deliberately
**not** wired into `.gvt-agent.json`'s `commands.validate`; run it by hand when
editing the bundle or an agent body:

```bash
node scripts/check-doc-anchors.mjs plugin/docs/c3/*.md plugin/agents/*.md
```

It complements, rather than replaces, the three greps above: those catch
referrers to a heading **you** are removing, while this catches a link whose
target never existed or has already gone. See
[trap 7](/verifying-against-construct3-sample.md) for the dead link that
survived six PRs because nothing checked this.

## ADRs are historical records — don't retroactively rewrite them

When a rename or refactor lands, sweep the *living* docs (README, `CLAUDE.md`,
`docs/*.md`, these wiki pages) but leave `docs/decisions/` untouched.

Precedent: commit `2400b62` renamed the plugin `genvid-c3` → `gvt-construct3`
without editing ADR 0004's `genvid-c3` references, and the later `genvid-dev` →
`gvt-dev` sweep likewise skipped `docs/decisions/`. If a decision is genuinely
reversed, add a **superseding** ADR rather than editing the old one in place.

> **This section's own `genvid-c3` mentions are deliberate — do not sweep them.**
> The rule has to *name* the retired token to cite the precedent it rests on;
> renaming it here would leave the rule asserting a precedent it can no longer
> show.
>
> **What changed when this rule moved into `wiki/` — and changed again since.**
> While it lived in `CLAUDE.md`, `/gvt-dev:audit-conventions`'s retired-token
> scan flagged it on every run (`info` severity, never affecting the exit
> code), and absorbing that recurring finding was the accepted cost of citing
> the token. Moving the rule into `wiki/` silenced that finding for a while —
> the hygiene scanners' general candidate set is `docs/**.md` + repo-root
> `CLAUDE.md` (`listCandidateFiles` in
> `audit-conventions/scripts/lib/hygiene.mjs`), which does not reach `wiki/`.
> But as of **gvt-dev 4.19.0**, `scanRetiredTokens` — and only that scanner —
> additionally unions in `wikiCandidateFiles(...)`, reaching `<wikiDir>/` too;
> `lint` has no retired-token check of its own, and dead-wiki-link/orphan
> checks still don't reach `<wikiDir>/`. A live `/gvt-dev:audit-conventions`
> run on this repo now flags the three deliberate citations above at `info`
> severity, same as it did before the move. Filed upstream as
> `GenvidTechnologies/claude-code-plugin-gvt-dev#366`, and this is the fix that
> landed for it.
>
> **This is worth more than the correction.** The `CLAUDE.md` → `wiki/`
> migration silenced a finding that the original bullet was deliberately
> engineered to keep alive — by *moving the file*, not by touching the token,
> which is the outcome that bullet existed to prevent. Nothing broke and no
> check failed; the doc simply went on describing a world it had left, until
> the upstream fix caught up and made the description true again. Treat
> **"what tooling stops seeing this file"** as a required question whenever a
> doc moves, alongside "what links to it" above — and treat a note about
> tooling behaviour as a claim with an expiry date, since an upstream fix like
> this one is exactly what expires it.
>
> (The scan also has no per-citation exemption — only a global
> `hygiene.retiredTokens` deny-list or a whole-file `excludePaths`, both of
> which would suppress *real* drift elsewhere. That constraint is upstream
> `#281`, and it still applies to any `docs/` or `CLAUDE.md` copy of this rule
> — and, now that the scan reaches `wiki/`, to this file too.)

[^claude-md]: CLAUDE.md, "Conventions for editing this repo".

## Related

- [Verifying docs/c3 against construct3-sample](/verifying-against-construct3-sample.md) — a correction's evidence standard.
- [Skill authoring conventions](/skill-authoring-conventions.md) — what a new skill's directory must contain.
- [Working with the code reviewer](/working-with-code-review.md) — who has historically caught these misses.
