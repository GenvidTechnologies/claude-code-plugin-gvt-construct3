---
type: decision-record
title: "0019. The npm Surface Ships in `plugin/` Only, and the Audit Stays Out of `commands.validate`"
description: >-
  The manifest and committed lockfile live in plugin/ with an empty dependency set, whose CI gate is live while its host-install half stays armed and unfired; and audit-c3-conventions is deliberately not wired into commands.validate, because its target is the working directory and this repo can never be a valid target.
tags: [decision, architecture, ci, npm, audit]
status: stable
generated: { by: process:plan-task, at: 2026-09-19T00:00:00Z }
---
# 0019. The npm Surface Ships in `plugin/` Only, and the Audit Stays Out of `commands.validate`

- **Status:** Accepted
- **Recorded:** 2026-09-19
- **Issue:** #119
- **Relates to:** #95 (the rewire this unblocks), `gvt-dev` ADR-0051 (the permitted
  shape), #120 / ADR 0018 (the pin the manifest check asserts against)

## Context

This repo had no npm surface at all — no manifest, no lockfile, no CI. Issue #95
cannot land without one, because `gvt-dev` ADR-0051 permits exactly one shape for a
shared-audit dependency: *a real npm dependency inside `plugin/`, lockfile-gated,
installed by the host once per cached version*, where the lockfile is load-bearing
rather than hygiene — without it the install is silently skipped and nothing reports
that.

Two questions had to be answered together, because the second only arises once the
first creates something for `commands.validate` to run.

## Decision

### 1. The manifest and lockfile ship in `plugin/`, with an empty dependency set

`plugin/package.json` is `private`, **version-less**, declares `type: "module"`, and
carries `dependencies: {}`. `plugin/package-lock.json` is generated, never
hand-authored, and committed.

- **`plugin/` only.** The marketplace entry is a `git-subdir` source with
  `path: "plugin"`, so nothing outside that subtree reaches a consumer. A root
  manifest is invisible to the host install path.
- **Not workspaces.** Measured: a `workspaces: ["plugin"]` layout creates a **root**
  lockfile and none in `plugin/`, which would ship a manifest with no lockfile — the
  precise silently-skipped state this record exists to prevent. The tidiest layout is
  the one that reintroduces the failure.
- **Version-less** so no second version string drifts against
  `.claude-plugin/plugin.json`, which is what the release tooling actually reads.
- **No `scripts`**, so the test glob keeps exactly one home.

**The empty dependency set does not make the gate vacuous, and the split is worth
stating precisely.** The **CI half is live today** — `npm ci` was measured firing on
both failure modes against this exact zero-dependency manifest: deletion (`EUSAGE`,
"can only install with an existing package-lock.json") and divergence (`EUSAGE`,
"Missing: `<pkg>` from lock file"). The **host-install half is armed but unfired** —
with nothing to install there is no `node_modules/` to create. It becomes load-bearing
when #95 names a real dependency, and at that moment the lockfile is already committed,
already tracked and already CI-enforced. That is the whole prerequisite.

Independence is preserved: `@genvidtech/audit-core` is a neutral third leaf with no
dependency of its own on the dev-workspace plugin, so depending on it later does not
contradict what `plugin/CONVENTIONS.md` publishes to consumers.

### 2. `commands.validate` does **not** invoke `audit-c3-conventions`

Six grounds:

1. **The audit's target is `process.cwd()`** (`audit.mjs:34`), and this repo can never
   be a valid target — it has no C3-project marker and no `domain-config.json`, and
   never will, being a plugin dev workspace rather than a C3 project. Run from the repo
   root it exits 1. Permanently, by design rather than by defect.
2. **A permanently-red gate gets deleted or `|| true`'d**, and `|| true` is this repo's
   named fail-open shape — the thing the rest of this change exists to remove.
3. **The only cure is a target flag**, which is at best adjacent to ADR-0051's standing
   directive that the audit's root must remain derived and never become a flag,
   argument, or environment variable. That directive is written about the *plugin* root
   and the *target* root is a different derivation, so this is not claimed as a
   violation — but its rationale (a flag is assertable by anyone) transfers, and
   settling it belongs upstream, not here.
4. **Non-hermetic, and 15–45× the cost.** The audit makes live
   `npx -y @genvidtech/*` registry probes; measured at 8 s warm and 23 s cold —
   state-determined, not intermittent — against 0.52 s and 0.11 s for the two suites.
   Hermeticity is the property ADR-0051's own ground (b) exists to protect.
5. **Two standing precedents.** All three repo-root CLIs carry a header saying they are
   deliberately not wired into `commands.validate`, restated at
   `wiki/doc-inventories.md`. Wiring the audit in would be the first exception.
6. **The "no" is paired with a strict increase in coverage.** The same change moves the
   previously-ungated 33 workspace tests *into* the gate alongside the 197. That pairing
   is what makes this a decision rather than an omission.

## Consequences

- **`commands.validate` becomes `node scripts/ci/gate.mjs && claude plugin validate
  plugin`** — no `cd`, because `claude plugin validate plugin` works from the repo root
  and the gate resolves its own directories. The `cd plugin &&` fail-open class is
  retired from the config, though it still applies to any glob typed by hand and the
  documentation of it stays.
- **All 230 tests are gated**, up from 197.
- **One deliberate asymmetry:** `npm ci` runs in CI only, never in `commands.validate`.
  With zero dependencies it is cheap today, but it becomes network- and cache-dependent
  the moment a real dependency lands, and `commands.validate` must stay hermetic.
  Recorded here so it reads as a decision rather than drift.
- **Consumers receive two extra files and zero bytes of third-party code.**
- **A boundary #95 inherits.** ADR-0051 records an unresolved limit — from the plugin
  cache, both `require.resolve` and dynamic `import()` failed to resolve a package, with
  a Node builtin passing as a control on the same path, and the cause was never
  established. This landing does not depend on it, since nothing is installed. #95 does:
  this repo's audit runs *from the plugin cache* on every consumer, so the usability
  preflight must be discharged there before a runtime dependency ships.
- **The version bump this step earns is owed, not waived.** ADR-0051 states the manifest
  step carries a version bump on its own merits. It is deferred to the release, not
  declined.
