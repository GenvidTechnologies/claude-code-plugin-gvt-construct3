---
type: practice-note
title: Deferring an issue upstream
description: How an issue that belongs to construct3-chef gets relocated — check chef's docs for existing coverage first, then file it there in the same session, cross-link both ways, and label the origin-side umbrella blocked-upstream so triage stops ranking it.
tags: [issues, triage, construct3-chef, blocked-upstream, cross-repo]
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
  - id: triage
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/docs/issue-triage.md
    title: docs/issue-triage.md in the repo (living version)
---

# Deferring an issue upstream

Several issues filed here belong to `construct3-chef` — the authoritative tool
for content-validation and addon tooling. See
[the knowledge boundaries](/knowledge-boundaries.md) for *why* the split falls
where it does; this page is about the mechanics of moving one.[^claude-md]

## First, check whether chef's docs already cover it

Everything below is about the cost of **not filing** when you should. The
opposite error is just as real, and #69 hit it.

**"No chef *issue* covers this fact" is not evidence that chef's *docs* don't.**
Those are two different questions, and triage only ever answers the first. #69's
proposed approach reasoned straight from one to the other:

> Triage found **no existing chef issue** covering any of the candidate facts …
> so expect to file rather than link.

That was backwards. Of the nine sites in that issue, **eight were already
documented by chef** — `docs/cli.md` carries full sections for `generate`,
`sync-project`, `scaffold-layout` and `navigation-graph`, plus the
`navigation.targetPatterns` config; `read-event-sids` / `read-dsl-index` are
covered across `generators.md` and `recipe-reference.md`. Exactly **one** needed
filing (chef#196 — the `list-global-layers` MCP tool, which is registered in
chef's server but appears in none of its docs, plus the `global-layers.txt`
report format and its deep-count rule).

So before concluding a fact needs an upstream home, **grab chef's tree and grep
its `docs/`.** The default outcome is delete-and-link; filing is the exception.

```bash
gh api repos/GenvidTechnologies/construct3-chef/tarball/main > chef.tgz && tar xzf chef.tgz
grep -rn '<the fact>' */docs/
```

Getting this wrong in the over-filing direction costs an upstream maintainer a
no-op issue, and — more expensively — sizes a plan for cross-repo work when the
actual change was a local one-line link-out.

## File it there *and* cross-link both ways

**An issue that merely *names* another repo as its "implementation home" is not
tracked there — and that gap is silent.** A deferred item falls through the crack
between repos.

| Issue | What happened |
|---|---|
| #31 → chef#98 | Relocated **correctly**: issue filed, both sides linked |
| #32 | Named chef as its home, but **no chef issue existed** until chef#100 was filed in a much later session — and a memory had wrongly assumed it was tracked |

When you defer: open the target-repo issue **in the same session**, and comment
the link back on the origin issue, so the linkage is **bidirectional**.

## Label a retained origin-side umbrella `blocked-upstream`

A deferred-to-chef issue that stays open here as the plugin-side "recommend/run"
tracker (e.g. #32, blocked on chef#100) otherwise looks **plannable**: triage and
`plan-next-issue` can only discover the block by reading its comments, and it
keeps resurfacing as a ranking candidate.

The `blocked-upstream` label — created in this repo — marks that state
**mechanically**, so triage and ranking de-prioritize it without comment-diving.

- Apply it in the **same session** you file the target-repo issue.
- **Drop it** once the upstream ships and the origin-side follow-up becomes
  actionable.

## Closing issues from PRs

The repo's squash-title style appends bare `(#N)` references (e.g.
`feat: … (#6) (#9)`), which only **cross-reference** — they do **not** auto-close.

To close an issue on merge, put a closing keyword (`Closes #N` / `Fixes #N`) in
the **PR body**; otherwise close it by hand after release. Issue #6 stayed open
through v1.2.0 for exactly this reason.

[^claude-md]: CLAUDE.md, "Relocating/deferring an issue to another repo" and
"Closing issues from PRs".

## Related

- [The knowledge boundaries](/knowledge-boundaries.md) — which repo owns what.
- [The convention contract and the audit](/the-audit-contract.md) — the presence-vs-content boundary that sends content checks to chef.
- [Issue triage conventions](/issue-triage-conventions.md) — the blocked-upstream label lifecycle that tracks a deferral.
