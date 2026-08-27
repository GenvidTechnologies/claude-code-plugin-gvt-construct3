---
type: practice-note
title: Issue triage conventions
description: This repo's flat-label triage model — one category label, no priority scheme, question doubling as needs-info, and the blocked-upstream lifecycle — plus why a small clean backlog is still worth triaging.
tags: [triage, issues, labels, blocked-upstream, github, process]
status: stable
stale_after: 2027-08-26
generated: { by: process:maintain-wiki, at: 2026-08-26T00:00:00Z }
sources:
  - id: triage
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/docs/issue-triage.md
    title: docs/issue-triage.md in the repo (living version)
---

# Issue triage conventions

This repo uses the **flat-label variant**: GitHub's default category labels, with
**no** `type:` / `priority/` / `area:` scheme, plus two repo-specific labels
(`triaged`, `blocked-upstream`).[^triage]

> **The living contract is [`docs/issue-triage.md`](../docs/issue-triage.md)**, which
> `/gvt-dev:triage-issues` reads directly, together with the `bugTracker` block in
> `.gvt-agent.json` (which holds the access mechanics — fetch queries and label names).
> This page carries the conventions and the *why*; it deliberately does **not**
> restate the `gh` mutation recipes, because the skill executes those from the living
> doc and a second copy would drift.

## One category label, drawn from the existing set

`bug` · `enhancement` · `documentation` · `question` — exactly one per issue.[^triage]

- `bug` — incorrect behavior in shipped plugin functionality (audit script, skill
  scripts, agent frontmatter that fails to load).
- `enhancement` — a new skill, agent capability, audit check, or improvement.
- `documentation` — a docs-only gap or fix, covering **both** the shipped
  `plugin/docs/c3/` reference and the dev-workspace `docs/`.
- `question` — a request for information, which **doubles as the needs-info signal**.

**Never invent a taxonomy the repo doesn't have.** Add a category only if the repo
already uses it.[^triage]

**Chores have no dedicated label here** — a pin bump or release-mechanics issue is
labelled `enhancement`, and the title's `chore:` prefix carries the intent.[^triage]

## There are no priority labels — and that is deliberate

Don't invent a `priority/*` scheme. A triaged issue in this repo carries **no
priority field**. Rank work by recency and observable impact in discussion instead.
(If the repo later adopts priority labels, switch to the structured template.)[^triage]

## `question` is the needs-info label

There is no dedicated `needs-info` label. When an issue is missing essentials, add
**`question`** and comment *exactly* what is needed; clear the label when it is
supplied. This is why `bugTracker.needsInfoLabel` must be set to `question`.[^triage]

What "enough to act on" means:[^triage]

| Kind | Must carry |
| --- | --- |
| `bug` | a reproduction (steps or a failing case), expected vs. actual, and the plugin/server version |
| `enhancement` | the desired outcome and its motivation |
| **pin-bump chore** | the target version **and** whether the server's MCP tool surface changed — that is what decides whether `/gvt-dev:reconcile-mcp-pin` is required |

## The `blocked-upstream` lifecycle

Several issues here belong to `construct3-chef` rather than to the plugin —
content-validation and addon tooling in particular. The deferral mechanics live in
[Deferring an issue upstream](/deferring-issues-upstream.md); the **label lifecycle**
is triage's half:[^triage]

1. File the target-repo issue **in the same session**, and comment the link back on
   the origin issue. An issue that merely *names* another repo as its home is **not
   tracked there**.
2. If an origin-side umbrella stays open as the plugin-side tracker, label it
   **`blocked-upstream`** so ranking de-prioritizes it mechanically instead of
   comment-diving.
3. **Drop `blocked-upstream` once the upstream ships.** Re-check every
   `blocked-upstream` issue's upstream state on *each* triage run — **a stale block
   silently hides plannable work.**

## Duplicates: link, do not auto-close

Choose the canonical (usually the oldest with the best detail), add `duplicate` to
the others, and comment `Duplicate of #<canonical>`. **Close a duplicate only with
explicit per-item approval.**[^triage]

## Splitting and dependencies

Split when one issue bundles unrelated concerns, or when a single piece of work spans
parts that ship independently. Prefer **sub-issues** (a checkbox task-list) when the
parent is a tracking umbrella; prefer **separate issues** when the parts share no
parent. Keep the original as canonical.[^triage]

Express a dependency as a comment on the blocked issue — `Blocked by #<id>` — and for
a cross-repo block use the full `owner/repo#<id>` form **plus** `blocked-upstream`.[^triage]

## A small, duplicate-free backlog is still worth triaging

Dedup is the *visible* output of triage, so a backlog with no duplicates looks like a
backlog with nothing to gain. It isn't. **Enrichment and staleness-detection are
per-issue and don't shrink with backlog size**, and both have caught real problems
here: a dead contract doc, two wrong issue-body facts, and a four-day-stale
`blocked-upstream` label that was hiding actionable work — plus a case where triage
surfaced a factual conflict between a proposal and the doc it was editing, before any
code was written.

Don't recommend skipping triage on size alone. *(Workspace practice, recorded from
prior triage runs rather than from the captured doc.)*

[^triage]: `docs/issue-triage.md` — issue triage conventions for this repo.

## Related

- [Deferring an issue upstream](/deferring-issues-upstream.md) — the deferral mechanics behind step 1 of the `blocked-upstream` lifecycle.
- [The convention contract and the audit](/the-audit-contract.md) — the presence-vs-content validation boundary that decides what belongs upstream in chef.
- [Verifying an MCP pin bump](/pin-bump-verification.md) — what a pin-bump chore has to establish before it can be planned.
