---
type: practice-note
title: Working with the code reviewer
description: >-
  The reviewer recurrently over-escalates valid-but-unusual Markdown to critical — how to verify the severity against the spec, why a sound finding can still carry a remedy that is wrong for this repo, why its silence on an inherited claim is not verification, and why its per-row verdict can contradict the measurement in its own evidence column.
tags: [code-review, markdown, commonmark, anchors, severity, verification]
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
---

# Working with the code reviewer

**The code reviewer recurrently over-escalates valid-but-unusual Markdown to
"critical" — verify against the spec before accepting the severity.**[^claude-md]

Two data points: a *spaced em-dash anchor* (#36) and a *double-backtick code
span* embedding literal backticks (#42). Both render fine per CommonMark /
`github-slugger`; both were flagged "critical."

When the reviewer calls a Markdown-rendering concern critical, treat it as a
**suggestion pending verification**: confirm against the real tool, not by eye.

## Two specifics worth keeping

### GitHub heading anchors don't collapse runs of `-`

A *spaced* em-dash heading — e.g.
`### JSON Plugin set-json Parses Async — Signal from on-parse-success` — slugs to
`…async--signal…` with a **double** hyphen. `github-slugger` strips the `—` but
keeps both surrounding spaces, each becoming a `-`.

Keep the `--` when deep-linking. Verify uncertain anchors by `npx`-installing
`github-slugger` and slugging the heading.

### Double backticks are the correct way to embed a literal backtick

CommonMark strips the padding space, so a double-backtick code span embedding a
literal backtick is well-formed — not "malformed."

## A sound finding can carry a wrong remedy

This widens the rule beyond severity: **the finding can be *correct* while its
proposed fix is wrong for this repo.**

In #72 the reviewer correctly caught that `extract-scripts` still appeared in the
PR's own `CHANGELOG.md`, violating an acceptance criterion that demanded zero
hits repo-wide — and proposed rewording the changelog to drop the name.

That fix contradicts the
[absence-criterion rule](/doc-inventories.md), and adopting it would have
**degraded** the entry. The defective artifact was the *criterion*, which had
been written before the changelog entry existed.

So: **evaluate a reviewer's remedy on its own merits even when its finding is
sound**, and check the remedy against repo precedent before applying it. A
correct finding lends the attached fix an authority it has not earned.

## Silence is not verification — ask by number

Both rules above concern what the reviewer *says*. The costlier failure is what it
leaves out: it can return **"no findings"** while never addressing an inherited
claim you explicitly asked it to check. Nothing in the report marks the omission,
so an unasked question and a question answered clean read identically.

There is a second mode with the same surface. The reviewer will sometimes **assert
a check it did not run** — reporting that two things "match exactly" when nothing
was compared. A confident verdict and a verified one are indistinguishable in prose.

**The countermeasure is structural, and it works.** Dispatch with:

1. **Numbered questions**, each answerable on its own — not a prose paragraph of
   concerns. A numbered list makes an omission visible as a missing number.
2. **Named out-of-scope items**, so deliberate absences aren't re-litigated as
   findings and the reviewer spends its attention where you want it.
3. **"Show the command if you ran one."** This is what separates the two modes
   above — an asserted check has no command to show.
4. **"I treat silence on any numbered item as *not done*, not as *no problem*."**

Two data points, both positive. In #112 this produced per-area verdicts plus the
branch's only real defect — an ADR citation invalidated by a later commit on the
same branch, which is exactly the shape the `file:line` rider on
[doc inventories](/doc-inventories.md) describes. In #105 it returned per-question
verdicts with commands attached, and its one vague answer was visible *as* the
vague one, which is what made it worth re-checking by hand.

The corollary is the point of the whole section: **verify flagged inherited facts
yourself.** The dispatch improves the odds that the reviewer looks; it does not
transfer the obligation.

## A verdict is not its evidence — read the column, not the conclusion

A third mode, and the one the section above cannot catch, because the countermeasure
**works** and the failure happens afterwards. The reviewer runs the check, records the
real number, and then grades the row **satisfied anyway** — reasoning past its own
measurement instead of failing the row.

The #120 case: R1 pledged that `grep -c "2\.0\.0"` across the four pin files returns
**5**. The reviewer's evidence column reported **6**, annotated *"expected 5, with 1
extra from legitimate prose in c3-implementer.md line 88"* — and its verdict column
said **satisfied**, with the summary reporting 11 of 11 met. The explanation was
correct on the facts (see [a token count is not a site
check](/verifying-a-pledged-criterion.md)); the row still said 5 and the tree still
said 6. A criterion that a grader may explain away is not pre-committed, which is the
whole property ADR-0017 exists to create.

This is not the same as asserting an unrun check. Here the check ran and its output is
right there in the report — so *"show the command if you ran one"* is satisfied, and
every structural defence in the section above passes. The only thing that catches it is
reading the numbers against what the row demanded.

**So read a review's evidence column, not its verdict column, and re-derive any row
where the two disagree.** The numbered-question dispatch is what makes this cheap: it
is what put the contradicting figure on the page in the first place. Treat a
reviewer's per-row measurements as data worth having and its per-row verdicts as
opinion — useful, not authoritative. In the same report this reviewer also referred to
a nonexistent "ADR 0107" (#107 is an issue, not a decision record), a small tell in the
same direction: its detailed evidence was sound while its summary ran ahead of it.

[^claude-md]: CLAUDE.md, "The code-reviewer recurrently over-escalates
valid-but-unusual Markdown".

## Related

- [Doc inventories, ADRs, and the changelog](/doc-inventories.md) — the absence-criterion rule the #72 remedy contradicted.
- [Verifying an MCP pin bump](/pin-bump-verification.md) — the same "verify the assertion" habit applied to issue bodies.
- [Verifying a pledged acceptance criterion](/verifying-a-pledged-criterion.md) — the row-side counterpart: the defective criteria a reviewer's verdict can paper over.
