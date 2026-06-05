# Bug Triage Conventions

> Project conventions consumed by `/genvid-dev:triage-bugs`. Access mechanics
> (fetch queries, label names) live in the `bugTracker` block of
> `.genvid-agent.json`. Commands assume **GitHub Issues via the `gh` CLI**.
>
> **This repo is small and tracks features/chores, not a bug factory.** The
> taxonomy below is deliberately lightweight: it reuses GitHub's *stock* labels
> and does **not** invent `type:*` / `area:*` / `priority/*` label families. The
> only triage-specific labels are `triaged` and `needs-info`, created on first
> use. Section headings are fixed — the skill and analyst locate guidance by
> heading.

## Types

Use the existing **stock** GitHub labels as the category; pick the one that best
describes the work. Roughly one per issue:

- `bug` — incorrect behavior in shipped functionality.
- `enhancement` — a new feature, capability, or chore (incl. dependency/version bumps).
- `documentation` — docs-only changes.
- `question` — needs discussion/decision before it is actionable.

No `type:*` prefix scheme — the bare stock labels are the type.

## Priorities

Priority is recorded as a **triager judgment**, not a mandatory label. Default to
noting it in a triage comment (`Priority: P1 — major feature, no workaround`)
unless the maintainer opts into dedicated `priority/*` labels (not created yet).

Rough scale, by worst **observable** impact:

- `P0` — blocks a release or breaks the build; do now.
- `P1` — significant feature/chore with no workaround; this cycle.
- `P2` — has a workaround or is minor; schedule.
- `P3` — nice-to-have; backlog.

## Labels

- Stock category labels (above) — set the one that fits.
- `good first issue`, `help wanted` — optional, reporter or triager may set.
- `duplicate` — set on non-canonical members of a duplicate cluster.
- `needs-info` — set when required fields are missing; cleared when supplied. **Create on first use.**
- `triaged` — set **last**, by the skill, when triage is complete. **Create on first use.**

## Required fields

Every triaged issue must have: a clear problem/goal statement, a definition of
done (acceptance criteria, or for a chore the concrete target — e.g. the version
to pin), and one stock category label. Missing any of these → add `needs-info`
and comment exactly what is missing.

## Splitting

Split when one issue bundles unrelated work, or when a single item spans parts
that ship independently. Prefer **sub-issues** (a checkbox task-list referencing
new issues) when the parent is a tracking umbrella; prefer **separate issues**
when the parts share no parent. Keep the original as the canonical/umbrella.

## Duplicates

Policy: **link, do not auto-close.** For a duplicate cluster, choose the
canonical (usually the oldest with the best description), add `duplicate` to the
others, and comment `Duplicate of #<canonical>` on each. Close a duplicate only
with explicit per-item approval.

## Dependencies

Express a dependency with a comment on the blocked issue: `Blocked by #<id>`
(optionally `Blocks #<id>` on the other). For umbrellas, list dependencies as a
GitHub task-list under a `Depends on` heading.

## Mutation recipes

The exact commands the triage skill runs to apply **approved** changes. `{id}`,
`{label}`, `{text}`, `{canonical}`, `{other}`, `{title}`, `{body}`, `{tmpfile}`,
`{triagedLabel}`, and `{needsInfoLabel}` are substituted by the skill.

- Set category: `gh issue edit {id} --add-label "{label}"` (and `--remove-label` any wrong stock category)
- Edit body (clarify / fill missing info): `gh issue edit {id} --body-file {tmpfile}` — the skill writes the approved new body to `{tmpfile}` first
- Comment (priority note, clarification): `gh issue comment {id} --body "{text}"`
- Create a label on first use: `gh label create {label}` (only `needs-info` / `triaged` are expected)
- Flag missing info: `gh issue edit {id} --add-label {needsInfoLabel}` (pair with a Comment saying what's missing)
- Mark duplicate: `gh issue edit {id} --add-label duplicate` then `gh issue comment {id} --body "Duplicate of #{canonical}"`
- Close duplicate (only with approval): `gh issue close {id} --reason "not planned" --comment "Duplicate of #{canonical}"`
- Create split issue: `gh issue create --title "{title}" --body "{body}" --label "{label}"`
- Link dependency: `gh issue comment {id} --body "Blocked by #{other}"`
- Stamp triaged: `gh issue edit {id} --add-label {triagedLabel}`
