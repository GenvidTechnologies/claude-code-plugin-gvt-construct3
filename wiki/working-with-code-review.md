---
type: practice-note
title: Working with the code reviewer
description: The reviewer recurrently over-escalates valid-but-unusual Markdown to critical — how to verify the severity against the spec, and why a sound finding can still carry a remedy that is wrong for this repo.
tags: [code-review, markdown, commonmark, anchors, severity]
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

[^claude-md]: CLAUDE.md, "The code-reviewer recurrently over-escalates
valid-but-unusual Markdown".

## Related

- [Doc inventories, ADRs, and the changelog](/doc-inventories.md) — the absence-criterion rule the #72 remedy contradicted.
- [Verifying an MCP pin bump](/pin-bump-verification.md) — the same "verify the assertion" habit applied to issue bodies.
