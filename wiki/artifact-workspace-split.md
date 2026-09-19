---
type: reference
title: The artifact / workspace split
description: Why the shipped plugin lives in plugin/ while the repo root is a gvt-dev dev workspace, what each side owns, and why that split forced the marketplace entry onto a git-subdir source rather than a plain url.
tags: [architecture, repo-layout, plugin-root, marketplace, git-subdir, release, adr-0004]
status: stable
generated: { by: process:maintain-wiki, at: 2026-08-26T00:00:00Z }
sources:
  - id: adr-0004
    resource: https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/blob/main/wiki/decisions/0004-plugin-subfolder-split-and-git-subdir.md
    title: ADR 0004 in the repo (living version)
---

# The artifact / workspace split

This repo is **two things at once**, and the directory layout is what keeps them
apart. It *ships* the `gvt-construct3` plugin, and it is itself a *dev workspace*
that **consumes** the `gvt-dev` plugin.[^adr-0004]

| Tree | Role | Owns |
| --- | --- | --- |
| **`plugin/`** | the **shipped artifact** | `plugin/.claude-plugin/plugin.json` (the manifest), `plugin/agents/`, `plugin/skills/`, `plugin/docs/c3/`, `plugin/CONVENTIONS.md`, `plugin/CHANGELOG.md` |
| **repo root** | the **dev workspace** consuming `gvt-dev` | `.gvt-agent.json` (`paths.plugin_root`, `commands.validate`, `repo.*`), `wiki/`, this repo's `CLAUDE.md` |

The marketplace installs the `plugin/` subtree, so **`${CLAUDE_PLUGIN_ROOT}`
resolves to `plugin/`**, not to the repo root.

## Why the split exists

Originally the shipped artifact lived at the repo root, so consumer-side dev files
and shipped files shared one namespace. Two concrete failures followed:[^adr-0004]

- The `gvt-construct3` contract (`CONVENTIONS.md`) was **indistinguishable** from
  `gvt-dev`'s own root-level conventions — two different contracts, one namespace.
- A root-level `gvt-dev:audit-conventions --fix` **could touch shipped files**.

Moving the artifact into `plugin/` makes "what ships" unambiguous. A root `--fix`
now only ever touches workspace files, never the plugin.

**A flat repo was the rejected alternative**, and it was rejected for exactly those
two reasons — not on aesthetics.[^adr-0004]

## The split forced the `git-subdir` marketplace source

These are **one decision, not two.** Because the artifact sits in a subfolder, the
catalog entry cannot use a plain `url` source — it must point at the *subtree*,
which is what a **`git-subdir` source with `path: "plugin"`** expresses. The `url`
form stopped being viable the moment the artifact moved.[^adr-0004]

The `url` → `git-subdir` migration shipped at **v1.1.0**. Steady-state releases
since are a **single-value `source.ref` bump** in the catalog.[^adr-0004]

> **The catalog is `GenvidTechnologies/claude-code-gvt-marketplace`, marketplace name
> `gvt-plugins`** — resolved, and the resolution is simpler than it looked. There is
> **one catalog, not two.** `genvid-holdings/claude-code-marketplace` and
> `GenvidTechnologies/claude-code-gvt-marketplace` are the **same repository**,
> renamed — identical repo `id` (`1255536717`) and identical `created_at`. The old
> path still resolves only because GitHub redirects a renamed repo.
>
> **That redirect is why this looked like a disagreement for so long, and it is the
> trap to remember.** Fetching either name succeeds and returns plausible content, so
> a check that "confirms both exist" confirms nothing — it followed a redirect. The
> discriminator is the repo `id`, not the name, not a successful fetch, and not the
> file contents. Compare ids before concluding two remotes are distinct.
>
> So the living docs were not picking the wrong side of a live disagreement; they were
> pointing at a **pre-rename name**. The marketplace `name` is `gvt-plugins`; the docs
> said `genvid-plugins`, which was never any catalog's name, so an install command
> built from them would have failed outright. Corrected wherever it was load-bearing.
>
> ADR 0004's *decision* is untouched. It settled that a subfolder artifact forces a
> `git-subdir` source, and that remains true; only an incidental fact it recorded in
> passing — the hosting repo's name — has decayed. Records are not swept, so ADR 0004
> still names the repo under the name it had; read this page for the current one.

## What follows from it

- **Plugin checks are scoped to `plugin/`, but no longer by a `cd`.** `commands.validate`
  used to do `cd plugin && …`, which fails *open*: run the test glob from anywhere else and
  it matches nothing and still exits 0. It now runs `node scripts/ci/gate.mjs`, which
  expands each suite's glob in Node against an explicit directory and fails closed on an
  empty match. The scoping survives; the fail-open does not.
  See [Doc inventories, ADRs, and the changelog](/doc-inventories.md).
- **Releases are cross-repo.** `gvt-dev:release-plugin` (≥ 2.8.0) honors
  `paths.plugin_root`, operates on `plugin/.claude-plugin/plugin.json` and
  `plugin/CHANGELOG.md`, and keeps the catalog entry on its `git-subdir` source.[^adr-0004]
- **This repo is in `gvt-dev` MIGRATED state** (it has `.gvt-agent.json`), so
  `audit-conventions --fix` does **not** run the greenfield scaffolder here. The
  `.gvt-agent.json` and `wiki/index.md` were hand-tuned — prefer editing them by hand
  over a blanket fixer run.[^adr-0004]

## Why this page carries no `stale_after`

It restates a **settled split**. Per the schema's decay policy, a page restating a
settled boundary or split changes only by a superseding ADR — the ADR is the signal,
not a date.

[^adr-0004]: ADR 0004 — `plugin/` artifact-vs-workspace split and the `git-subdir` marketplace source.

## Related

- [The knowledge boundaries](/knowledge-boundaries.md) — the *other* structural split: which of four homes a given C3 fact belongs to.
- [Doc inventories, ADRs, and the changelog](/doc-inventories.md) — the hand-maintained inventories that span both trees.
- [Skill authoring conventions](/skill-authoring-conventions.md) — what a skill under `plugin/skills/` must look like.
