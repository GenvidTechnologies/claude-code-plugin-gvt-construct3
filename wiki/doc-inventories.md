---
type: practice-note
title: Doc inventories, ADRs, and the changelog
description: Which hand-maintained inventories a new skill, a new docs/c3 doc, or even a new section must be added to; how to scope an absence criterion and why every such row needs auditing; why a discovery sweep must be as broad as the defect class it describes; the intra-repo anchor checker and the index-mirror checker — plus why ADRs are never rewritten and the one metadata defect that is corrected in place, why a file:line citation can be falsified by your own PR, why a pure content correction still earns a CHANGELOG entry, and why a link inside the shipped plugin subtree must never escape it.
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
  - id: toc
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/index.md
    title: wiki/index.md, the bundle index that absorbed docs/TOC.md when it was retired
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
hardcoded count can't go stale. The wiki's own `index.md` needs nothing for a
new *skill* — it indexes wiki pages, not the shipped plugin's surface.

## Adding a docs/c3 reference doc touches two *exhaustive* description surfaces

Unlike skills, each `docs/c3/*` doc is listed **individually** in
`plugin/docs/c3/index.md` (the doc table), and — since #79 made `plugin/docs/c3/`
an OKF bundle — in each doc's own YAML **frontmatter `description:`**, which
enumerates the same content areas and drifts the same way. Reconcile both in the
same commit.

> **This count has moved twice, in both directions, and that is the point.** It
> was two surfaces originally, became three when #79 added the frontmatter
> descriptions, and is two again since [#90](/decisions/0012-retiring-docs-into-the-wiki-bundle.md)
> retired `docs/TOC.md` — whose "C3 platform reference" list was the third. That
> list is **not** carried into `wiki/index.md`: the bundle root's own scope note
> forbids indexing another bundle's pages there, and the list had already drifted
> twice. Retiring a duplicate inventory is the one change that makes this rule
> *cheaper* rather than more expensive. Evidence from #70: `construct3-guide.md`'s frontmatter description
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
sibling inventory.** The surfaces don't just go stale together — they can
*contradict each other*, and agreement between two of them is not evidence
either is right. #70 found `docs/TOC.md` naming `layout-reference.md`'s
navigation content while `plugin/docs/c3/index.md` did not: two inventories
asserting different content areas for the same doc, and neither flagged
because nothing checks agreement between them. Only the doc's own headings are
ground truth.

## Adding a *section* stales those inventories' descriptions, even with no new row

The rule above is about a *new doc* needing new rows; the adjacent case is easy
to rule out too fast. Both surfaces describe each doc with a one-liner that
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

## A link inside `plugin/` must not escape `plugin/`

The marketplace installs `plugin/` **on its own** — the catalog entry is a
`git-subdir` source with `path: "plugin"`. A consumer's checkout therefore has no
repo root, no `wiki/`, and no sibling of `plugin/` at all. So a relative link that
climbs out (`../wiki/decisions/0002-*.md`, `../CLAUDE.md`) resolves fine in this
repo, survives review, and is **dead for every consumer who installs the plugin**.

Link outside the subtree with an **absolute `https://` URL**, or don't link at all.
Every link in `plugin/CHANGELOG.md` today is absolute — the convention is already
in force, it had just never been written down.

**ADRs are the trap.** They read like in-repo docs and are cited constantly, but
they live in `wiki/decisions/` — *outside* the shipped subtree. Cite one from
shipped text as plain prose (`ADR 0002`) or as an absolute URL; the existing
entries do the former. A `../wiki/decisions/…` link is the natural thing to write
and the wrong thing to ship.

> **Precedent.** #97's CHANGELOG entry was drafted with
> `[ADR 0002](../wiki/decisions/0002-data-driven-audit-contract.md)` and caught
> only by checking how sibling entries cite ADRs — nothing in the repo forbade it,
> and no validator looks at link targets.

**This is *stricter* than the equivalent wiki-bundle rule, not the same rule
twice.** [`wiki-schema.md`](/wiki-schema.md) also discusses links escaping a
bundle root, but rules them a *"deliberate, documented trade-off"* — tolerable
because OKF consumers **must tolerate broken links** (§6.1). The shipped plugin
has no such clause and no such reader: its audience is an end user of a released
artifact, for whom a dead link is simply a defect. Don't carry the wiki bundle's
permission across to `plugin/`.

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
name is gone, while any artifact the row's own grep will read — the release
notes, an ADR, a comment, or the edited file itself — must still say that
name?** If yes it is the defective shape, whatever else in the table is already
correct. Both of #76's rows had it; only one was caught before execution.

Note also *when* this surfaces. The tree-wide row's baseline was accurate when
written — one hit, in the file being edited — so a premise re-check at planning
time passes it. It only became unsatisfiable once the CHANGELOG task ran, i.e.
**the plan's own later work falsified its own earlier criterion**. That is a
distinct failure from a row that decayed or was born wrong, and no gate before
execution can catch it.

### The colliding writer is not always a *later* artifact

Everything above assumes the collision arrives from something written **after**
the row — a CHANGELOG entry, an ADR, an issue comment. There is a second shape
where the row collides with **its own task's primary edit**, and the
release-notes form of the tell returns the right answer while still clearing it.

Generalised, there are two reasons a banned name must survive:

- **removal** — documenting a removal requires naming the removed thing;
- **mis-attribution** — correcting a wrong attribution requires naming the
  thing wrongly blamed.

The second is the one that slips through, and a **version string** is its usual
carrier: a version is exactly what gets wrongly blamed for a change (*"it moved
at the bump"*), and exactly what looks safely historical once the pin is
refreshed.

Precedent: #106 re-pinned a version-pinned table from `gvt-dev 4.22.0` to
`4.24.0` and pledged `grep -c -F 'gvt-dev 4.22.0'` → 0 over the file being
edited. The baseline was accurate and the row read as a clean "the stale pin is
gone" check. It was unsatisfiable when written, because the correction the issue
existed to make is the sentence *"the **gvt-dev 4.22.0** → 4.24.0 bump had
nothing to do with it"* — the `scanned` figure had moved because a wiki page was
added, not because of the bump. Asked in its release-notes form the tell answers
*no, the release notes need not say it* — correctly, and uselessly, because the
token had to survive in the **corpus the row itself greps**.

Two practical consequences:

- **Scope the row to the claim, not the token.** The repair was to re-scope from
  the bare version string to the stale *claim* —
  `grep -c -F 'Measured against **gvt-dev 4.22.0**'` → 0 — which still fails if
  the pin is left stale, and no longer fails on the prose that explains the
  correction. Rewording the prose to dodge the grep was available and was
  **rejected**: that passes a criterion by shrinking what it can see.
- **Unlike the later-work case above, this one is catchable before execution.**
  The paragraph above closes with "no gate before execution can catch it", which
  is true of a collision with work still ahead. It is *not* true here: the
  colliding prose belongs to the row's own task, so asking *"must the edit this
  row grades write the token?"* settles it at authoring time. Don't file both
  under unpreventable.

## A discovery sweep must be as broad as the defect class it describes

The two rules above police a criterion that is too **broad** — an absence row
falsified by the change's own release notes. The inverse failure lands earlier and
is quieter: a **discovery** sweep narrower than the defect class its own prose
defines. It does not produce a false red; it produces a **short list that looks
complete**, and the issue gets filed at the wrong size.

> **Precedent.** #93 defined its defect class in prose as *"display text names the
> retired path while the pointer beside it is correct"* — and then verified with a
> **frontmatter-scoped** grep (`^\s*(title|resource):.*docs/`). That found 2 sites.
> The class as written also covers body **link text** and **footnote labels**, which
> the grep structurally cannot reach: the true count was **4**. One of the two misses
> was the footnote label of the *very `sources` entry* the issue was fixing, a screen
> below it in the same file. Both were found at planning, and scope was widened before
> any edit.

The tell is one question, asked of the sweep rather than of the result: **does the
corpus this command searches match the corpus my problem statement describes?** A
frontmatter grep answers a question about frontmatter. If the prose says *"a reader
goes looking and finds nothing"*, the corpus is every place a reader reads — body
prose, link text, footnote labels, and frontmatter alike.

Four riders — the first two from #93, the third from #103, the fourth from #105:

- **A narrow sweep also under-counts the look-alikes**, so the do-not-touch list is
  filed short too. #93 catalogued 4 correct entries under a heading claiming five;
  the real figure in the `docs/issue-triage` family was 7 once body sites were
  included. A widened sweep has to re-derive *both* columns, not just the defect one.
- **The fix is to widen the sweep, never to narrow the prose.** Rewriting the
  problem statement to match what the grep happened to cover makes the two agree
  while leaving the defect in the tree — the documentation equivalent of shrinking a
  verifier's field of view until it passes.
- **Widening along the axis you already widened is not widening to the class.** The
  tell above asks about the **corpus** — *where* the command searches. A sweep can
  answer it correctly and still be too narrow, because the other half of a sweep is
  its **pattern**: *which* strings count as an instance. Widening the corpus feels
  like discharging the rule, so the pattern half goes unexamined.
- **A referent has a *name* as well as a location, and a path pattern reaches only
  the location.** The rider above widens from corpus to pattern — but every pattern
  it contemplates is still a **path**. Prose names the same thing in words, and no
  path-grep of any breadth matches a referent that appears with no path in it at
  all. So ask the pattern a second question: *does the thing I am sweeping for have
  a name as well as a location?* Where it does, the sweep needs both, and the two
  halves cannot be checked by one command.

> **Precedent.** #103 named one site, found by matching a single retired-path
> token. Planning widened that to three tokens and found three defects — the
> corpus was right, the tell was asked and answered, and it was *still* short.
> The class was never a token set: it was a **shape** — any live claim that the
> retired directory exists — which reaches bare-path mentions no enumeration of
> full filenames can. The review gate found two more that way, in a layout table
> and in a machine-read label contract. Final count **5**, from a sweep twice
> believed complete.
>
> The companion question, asked of the pattern rather than the corpus: **does my
> pattern enumerate the class, or only the instances I already knew about?** An
> enumeration built by generalising from the instance in hand can only ever
> re-find that instance's shape. Three tokens is still a list of known answers;
> the class was a predicate.

> **Precedent, and the costliest placement of it.** #105 fixed a passage that
> illustrated an out-of-bundle link with two targets that had since moved
> *inside* the bundle. Its acceptance criteria were two greps, one per retired
> path. But the same passage named those two targets a third time **in prose**,
> as *"this schema doc or an ADR"* — no path, so neither grep could ever see it.
> A fix that repointed both paths and left the sentence alone satisfied every
> pledged criterion while leaving the wrong rule standing in the one document
> that is normative for the convention.
>
> Two things make this worse than the sweep failures above. It landed in
> **pledged criteria**, not a discovery sweep — so the blindness is a false
> *green*, graded by two independent critics and written into a tracker issue
> that outlives the branch. And the governing rule was **already on this page**,
> recorded from #103 and cited in the very issue whose criteria shipped blind.
> Knowing the rule is not the same as running it against your own checklist:
> apply the rider above to the rows you are about to pledge, not only to the
> sweep that found the defect.

> **This section's own bare `docs/` mentions are deliberate — do not sweep them.**
> Same reason as the retired-token note further down this page: a rule about
> stale-path sweeps has to name the shape it is about. Sweeping them would leave
> the rule unable to state its own subject.

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

## The index-mirror checker

`scripts/check-index-mirrors.mjs` (dev-workspace, dependency-free, added in #112)
checks the other half of index integrity: not whether a link resolves, but whether
the **row's text still matches what it claims to quote**.

Both bundle indexes require it. `wiki/decisions/index.md` says each row mirrors its
record's frontmatter `description` verbatim, with any amendment appended *after* the
mirrored span; `wiki/index.md` says "Each entry's description is the linked page's
frontmatter `description`, so the index and the page can't drift." Nothing enforced
either, and when #112 measured it, **four rows had drifted** — two in each index.

```bash
node scripts/check-index-mirrors.mjs                  # both indexes
node scripts/check-index-mirrors.mjs wiki/index.md    # or name them
```

Like the anchor checker it is deliberately **not** wired into `.gvt-agent.json`'s
`commands.validate`. Note the reason changed: `commands.validate` used to be unable to
reach anything under `scripts/` at all, because it globbed
`skills/*/scripts/test/*.test.mjs` from inside `plugin/`. It now runs
`node scripts/ci/gate.mjs`, whose second suite **is** `scripts/test/*.test.mjs` — so the
*tests* under `scripts/test/` are gated. These two checkers stay out regardless, because
they are **CLIs, not tests**, and because a checker that can go red for reasons unrelated
to the change under test widens what a red run means. See
[The npm surface and the CI gate](the-npm-surface-and-ci-gate.md) § *Do not wire a
red-on-main checker into CI*. Run them by hand.

Four outcomes, and the distinction between two of them is the point:

| Outcome | Meaning |
|---|---|
| `exact` | row text equals the target's `description` |
| `appended` | row mirrors it, then adds an annotation — the legal amendment shape |
| `skipped` | the target has **no frontmatter** (three `wiki/index.md` entries legitimately have none) |
| `diverged` | anything else, including a missing target or an absent `description` key |

**`skipped` is never folded into `exact`.** A checker that counted a frontmatter-less
target as passing would report a clean result over a corpus it never read — the
fail-open shape this page's sweep-breadth rule above exists to catch.

**What it cannot tell you is which side is wrong.** It reports that a row and a
description disagree; deciding whether to repair the row or the record is a judgement,
governed by the rule below.

## ADRs are historical records — don't retroactively rewrite them

When a rename or refactor lands, sweep the *living* docs (README, `CLAUDE.md`,
these wiki pages) but leave `wiki/decisions/` untouched.

The precedent below names `docs/decisions/` because that is where the ADRs lived
when it happened. That wording is **historical and stays** — the rule above moved,
the record of what was done does not.

Precedent: commit `2400b62` renamed the plugin `genvid-c3` → `gvt-construct3`
without editing ADR 0004's `genvid-c3` references, and the later `genvid-dev` →
`gvt-dev` sweep likewise skipped `docs/decisions/`. If a decision is genuinely
reversed, add a **superseding** ADR rather than editing the old one in place.

### The one exception: a `description` that contradicts its own body

**Scope check first.** The rule above covers two cases — a sweep landing on an ADR,
and a decision being reversed. A record's frontmatter `description` that misstated
its own body *on the day it was written* is neither, and #112 hit exactly that.

ADR 0015's body decomposes the mirror obligation into four numbered axes whose
fourth is **the closure boundary**; its `description` named *"the error rendering"*
in that slot — not an axis at all, but a sub-detail of axis 3. The index row was
right and the record's own summary was wrong. Both texts were introduced in the
**same commit**, so neither was the later revision of the other: git provenance
could not adjudicate it, and only the body could.

**Such a description is corrected in place.** It is metadata *about* the decision,
not the decision; correcting it changes nothing the historical-record rule protects.
[ADR 0017](decisions/0017-frontmatter-description-defect-not-reversal.md) records
this with its two limits — **misstatement only, never style**, and **the body is the
authority**. Concretely, ADR 0014's row backticks `` `gvt-dev` `` where its
frontmatter does not, and the repair for *that* is to drop the backticks from the
**row**.

#### A `file:line` citation can be falsified by your own PR

A rider the same work earned twice over. ADR 0017's first draft cited this rule as
`doc-inventories.md:339`, which was **correct when written**. A later commit *on the
same branch* added the index-mirror-checker section above it, pushing the rule to
`:379`. Nobody edited the citation and nobody edited the rule; a third edit between
them invalidated it.

This is worth separating from ordinary staleness. The usual guard — *re-check a claim
because the tree has moved since* — does not fire, because the tree moved **inside the
change you are still writing**, after the citing artifact was authored and before it
was reviewed. The window is one branch wide.

**Cite by section name, not by line.** It cannot drift on an insertion above it, and
it is the same reasoning [ADR 0008](decisions/0008-recording-verification-provenance-in-docs-c3.md)
already applies to shipped docs when it forbids `path:line` citations that drift
silently on a re-tag. Where a line number is genuinely the clearest pointer — quoting
a specific span — re-verify every `file:line` this branch **introduced** before the
final gate, not just the ones it edited, and note that a citation into a file the
branch also *adds sections to* is the highest-risk shape there is.

**The one-branch window is a property of the citing artifact, not of the rule — and
a tracker issue body has no such bound.** An issue is written at filing, re-read at
triage, and acted on at planning, often weeks apart, with no gate anywhere in
between; there is no "final gate" at which its citations are re-verified, because
the branch that would host one does not exist yet.

> **Precedent.** #105 cited two lines of *this page*. The citation was corrected
> once at triage and was wrong again by planning — three values for one fact inside
> about two weeks, as unrelated commits added and removed prose above it.
>
> The sharp part is the middle value. It was a **correction**: triage noticed the
> cited lines were wrong and fixed them — by supplying fresh line numbers, which
> decayed the same way before anyone acted on them. A correction expressed in the
> same notation as the defect re-commits the error it is correcting, and it does so
> with the added authority of having just been checked. **Correct a decayed
> citation to a section name or a quoted phrase, never to fresh line numbers** —
> the repair has to change notation, not just the value.

Two things worth carrying:

- **Establish which side is wrong before choosing a repair.** #112 prescribed
  "restore the row to mirror the record" for both divergences, which presumes the
  record is right. That presumption failed on one of the two.
- **A verbatim-mirror convention destroys an independent witness.** This defect was
  visible *only* because the row disagreed. Once every row mirrors its description
  exactly, a description that misstates its own body is invisible to
  `check-index-mirrors.mjs` — both sides agree perfectly while both misquote the
  record. The other 14 records were spot-checked by hand at the time (0 defects);
  that is the only method there is.

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
- [The artifact / workspace split](/artifact-workspace-split.md) — why an inventory can span the shipped tree and the workspace tree.
