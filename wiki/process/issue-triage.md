# Issue Triage Conventions

> Project conventions consumed by `/gvt-dev:triage-issues`. The companion **access
> mechanics** (fetch queries, label names) live in the `bugTracker` block of
> `.gvt-agent.json`.
>
> This is the **flat-label variant** — this repo uses GitHub's default category
> labels with no `type:`/`priority/`/`area:` scheme, plus two repo-specific labels
> (`triaged`, `blocked-upstream`).

## Types

A single category label per issue, drawn from the existing flat set:

- `bug` — incorrect behavior in shipped plugin functionality (audit script, skill
  scripts, agent frontmatter that fails to load).
- `enhancement` — a new skill, agent capability, audit check, or improvement.
- `documentation` — a docs-only gap or fix, including the `plugin/docs/c3/`
  platform reference and the dev-workspace `wiki/`.
- `question` — a request for information or clarification (doubles as the
  needs-info signal — see Required fields).

Set exactly one category label. Add new categories only if the repo already uses
them — never invent a taxonomy the repo doesn't have.

**Chores** (pin bumps, release mechanics) have no dedicated label in this repo;
label them `enhancement` and let the title's `chore:` prefix carry the intent.

## Priorities

**This repo has no priority labels.** Don't invent a `priority/*` scheme. When
ordering work, rank by recency and observable impact in discussion rather than a
label — a triaged issue carries no priority field. (If the repo later adopts
priority labels, switch to the structured template.)

## Labels

- category — exactly one of `bug` / `enhancement` / `documentation` / `question`.
- `duplicate` — set on non-canonical members of a duplicate cluster.
- `question` — also used to flag missing info (see Required fields); cleared when
  supplied.
- `wontfix` — set only with explicit approval when an issue is closed as out of scope.
- `blocked-upstream` — see **Upstream deferrals** below.
- `triaged` — set **last**, by the skill, when triage is complete.

The triager sets the category label. Reporters may suggest one.

## Required fields

Every triaged issue should have enough to act on: for a `bug`, a reproduction
(steps or a failing case) plus expected vs. actual behavior and the plugin/server
version; for an `enhancement`, a clear statement of the desired outcome and
motivation. For a **pin-bump chore**, the target version and whether the server's
MCP tool surface changed (which determines if `/gvt-dev:reconcile-mcp-pin` is
required — see [Verifying an MCP pin bump](/pin-bump-verification.md)).

Missing the essentials → add the **`question`** label and comment exactly what is
needed. (This repo has no dedicated `needs-info` label; `question` serves that
role — the `needsInfoLabel` in the `bugTracker` block must be set to `question`.)

## Upstream deferrals

Several issues here belong to the authoritative tool (`construct3-chef`) rather
than the plugin — content-validation and addon tooling in particular (see the
[validation boundary](/the-audit-contract.md) and
[Deferring an issue upstream](/deferring-issues-upstream.md)). When deferring:

1. File the target-repo issue **in the same session**, and comment the link back
   on the origin issue so the linkage is bidirectional. An issue that merely
   *names* another repo as its home is **not** tracked there.
2. If an origin-side umbrella stays open as the plugin-side "recommend/run"
   tracker, label it **`blocked-upstream`** so triage and ranking de-prioritize it
   mechanically instead of comment-diving.
3. **Drop `blocked-upstream` once the upstream ships** and the origin-side
   follow-up becomes actionable. Triage should re-check each `blocked-upstream`
   issue's upstream state on every run — a stale block silently hides plannable
   work.
4. **Decide "shipped" by contents, never by existence — and never trust a
   re-check recipe recorded on a previous run.** A package name can be published,
   and a repo created, long before anything consumable exists: npm's OIDC
   trusted-publishing setup reserves the name with a stub release. So
   `npm view <pkg> version` returning *a* version, or `gh api repos/<org>/<repo>`
   returning 200, means the **name** is taken, not that the **tool** exists.
   Require a real entry point (`main`/`exports`), a version past the placeholder,
   and a description that is not the setup stub:

   ```bash
   npm view <pkg> --json   # read files/unpackedSize/main/exports, not just .version
   ```

   The trap is that this decays in the **false-green** direction, which is the
   expensive one for a block: the recorded check starts *succeeding*, so a
   conscientious re-run reads as "the gate cleared" and the label comes off work
   that still cannot start. Recording the earlier negative result is what sets
   the trap — a comment saying *"`npm view` → E404, `gh api` → 404"* reads as a
   reusable recipe, and it is the one shape that inverts silently.

   > **Precedent.** #95's block was recorded 2026-09-18 with exactly those two
   > commands and their 404s. By 2026-09-19 both returned success —
   > `@genvidtech/audit-core@0.0.0`, 2 files, 2051 bytes, no `main`, no
   > `exports`, described as *"OIDC trusted publishing setup package"*. Nothing
   > consumable had shipped, and `gvt-dev#457` was still open.

## Splitting

Split when one issue bundles unrelated concerns, or when a single piece of work
spans parts that ship independently. Prefer **sub-issues** (a task-list of
checkboxes referencing new issues) when the parent is a tracking umbrella; prefer
**separate issues** when the parts share no parent. Keep the original as the
canonical/umbrella and move each split-out concern's detail into its own issue.

## Duplicates

Policy: **link, do not auto-close.** For a duplicate cluster, choose the canonical
(usually the oldest with the best detail), add `duplicate` to the others, and
comment `Duplicate of #<canonical>` on each. Close a duplicate only with explicit
per-item approval.

## Dependencies

Express a dependency with a comment on the blocked issue: `Blocked by #<id>`
(optionally `Blocks #<id>` on the other). For umbrellas, list dependencies as a
GitHub task-list under a `Depends on` heading. For a cross-repo block, use the
full `owner/repo#<id>` form and apply `blocked-upstream` (see above).

## Mutation recipes

The exact commands the triage skill runs to apply **approved** changes. `{id}`,
`{type}`, `{text}`, `{canonical}`, `{other}`, `{title}`, `{body}`, `{tmpfile}`,
`{triagedLabel}`, and `{needsInfoLabel}` are substituted by the skill. (There are
no `{p}`/`{a}` substitutions — this repo has no priority or area labels.)

- Set category: `gh issue edit {id} --remove-label "bug,enhancement,documentation,question" --add-label "{type}"`
- Edit body (language fix / fill missing info): `gh issue edit {id} --body-file {tmpfile}` — the skill writes the approved new body to `{tmpfile}` first
- Comment: `gh issue comment {id} --body "{text}"`
- Flag missing info: `gh issue edit {id} --add-label {needsInfoLabel}` (i.e. `question`; pair with a Comment saying what's missing)
- Clear missing-info flag: `gh issue edit {id} --remove-label {needsInfoLabel}`
- Mark duplicate: `gh issue edit {id} --add-label duplicate` then `gh issue comment {id} --body "Duplicate of #{canonical}"`
- Close duplicate (only with approval): `gh issue close {id} --reason "not planned" --comment "Duplicate of #{canonical}"`
- Create split issue: `gh issue create --title "{title}" --body "{body}" --label "{type}"`
- Link dependency: `gh issue comment {id} --body "Blocked by #{other}"`
- Mark blocked upstream: `gh issue edit {id} --add-label blocked-upstream`
- Clear upstream block: `gh issue edit {id} --remove-label blocked-upstream`
- Stamp triaged: `gh issue edit {id} --add-label {triagedLabel}`
