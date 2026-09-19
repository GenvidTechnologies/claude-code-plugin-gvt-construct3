---
type: practice-note
title: The npm surface and the CI gate
description: >-
  Why the manifest and lockfile live in plugin/ and nowhere else, why an empty dependency set still makes a real gate, and the four measured ways a check here passes while verifying nothing — npm ci walking up to an ancestor manifest, a glob matched from the wrong directory, a wrong path reporting as a deleted lockfile, and a reporter whose counters cannot be grepped.
tags: [ci, npm, lockfile, verification, fail-open, plugin-artifact]
status: stable
generated: { by: process:plan-task, at: 2026-09-19T00:00:00Z }
---
# The npm surface and the CI gate

This repo carries a `plugin/package.json` and a committed `plugin/package-lock.json`
so a host can perform a **lockfile-gated dependency install**. Today the dependency
set is empty. That is not a placeholder — it is a working gate with one half armed
and unfired, and the distinction is worth stating precisely because it decides
whether the landing was meaningful.

## Why `plugin/` and nowhere else

Only `plugin/` reaches a consumer. The marketplace entry is a `git-subdir` source
with `path: "plugin"`, so a manifest at the repo root is invisible to the host
install path.

**npm workspaces is the tidy-looking alternative and is structurally disqualified.**
Measured: with `workspaces: ["plugin"]` at the root and the dependency declared in
`plugin/package.json`, `npm install --package-lock-only` creates a **root**
`package-lock.json` and **no** `plugin/package-lock.json`. Shipping that means
shipping a manifest with no lockfile — exactly the state where the host install is
silently skipped and nothing reports it. The one layout that looks cleanest is the
one that reintroduces the failure the lockfile exists to prevent.

The manifest is **version-less** and **private**. `private: true` means the subtree
can never be published by accident. Omitting `version` removes a second version
string that would otherwise drift against `.claude-plugin/plugin.json`, which is
where the plugin's real version lives and what the release tooling knows about.
There are no `scripts`, deliberately — an npm script would be a second home for the
test glob, and having one home for it is the point of the gate.

## Why an empty dependency set still makes a real gate

Split the two halves:

- **The CI half is live today.** `npm ci` was measured firing on both failure modes
  against a manifest with `dependencies: {}`.
- **The host-install half is armed but unfired.** With nothing to install there is no
  `node_modules/` to create. It becomes load-bearing when a real dependency is named —
  and at that moment the lockfile is already committed, already tracked and already
  CI-enforced, which is the whole prerequisite.

The two `npm ci` arms, with their verbatim messages:

| Arm | Setup | Result |
|---|---|---|
| **Deletion** | lockfile removed | exit 1, `EUSAGE`, "The `npm ci` command can only install with an existing package-lock.json" |
| **Divergence** | manifest gains a dependency, lockfile untouched | exit 1, `EUSAGE`, "…are in sync" plus `Missing: <pkg> from lock file` |
| **Control** | honest pair | exit 0, "up to date" |

**Deletion is the arm that matters and the one an acceptance criterion is most likely
to omit.** "Fails when the manifest and lockfile disagree" describes divergence only.
A missing lockfile is not a disagreement — it is an absence, and it is the mode that
fails silently.

## Four measured ways a check here passes while verifying nothing

This is the section to re-read before adding a step to the workflow.

**1. `npm ci` from a directory with no manifest exits 0.** It walks *up* the tree and
installs against an ancestor manifest, creating `node_modules/` in the ancestor while
the directory you meant stays empty. A CI step that loses its working directory
therefore passes having done nothing. The workflow pins `working-directory: plugin`,
and step 1 asserts both files exist at their exact paths before npm runs at all.

**2. A wrong path reports as a deleted lockfile.** `npm ci --prefix ./does-not-exist`
exits 1 — but with the *deletion-arm* message. So a red run cannot, by itself,
distinguish "the lockfile is gone" from "the step is looking in the wrong place".
That is the reason the existence assertion runs *before* npm rather than being left
to npm's own error, and why it prints `found and tracked: <path>` on success.

**3. A test glob matched from the wrong directory prints `# pass 0` and exits 0.**
This is the oldest trap here and the reason the floors exist. `scripts/ci/gate.mjs`
expands each suite's glob in Node against an explicit directory, asserts a
**file-count floor** before running anything, and fails closed on an empty match.

The gate resolves each suite's directory against `process.cwd()`, **not**
`import.meta.url`. That looks like a bug and is not. Anchoring on the script's own
location would make the gate run correctly from anywhere, which sounds strictly
better — but the gate's *sensitivity to where it is run from* is the property under
test. An `import.meta.url`-anchored gate could never report `files matched: 0`, so
the fail-open it exists to catch would become unobservable.

**4. The default test reporter's counters are not greppable.** `node --test` prefixes
its summary with a non-ASCII character; `--test-reporter=tap` emits plain ASCII
`# tests N` / `# pass N` / `# fail N`. Any assertion on a count must use TAP. The
gate parses those lines by **literal prefix**, never a regex — an escape sequence that
survives a shell round-trip as valid-but-different still compiles and still matches,
just not what was meant.

The general shape behind all four: **a check that can degrade to "matches everything"
or "matches nothing" is not a check.** Before adding one, say what it would print on a
known-bad input. If the answer is "the same thing", it is decorative. Every step in
the workflow carries that answer as a comment for this reason.

## The floors have exactly one home

`scripts/ci/gate.mjs` owns the file-count and pass-count floors. `commands.validate`
and `.github/workflows/gate.yml` both call that script rather than restating a glob,
so the two paths cannot drift apart by construction. Don't copy a floor into prose;
point at the gate. Floors are `>=`, so adding tests never breaks CI — only losing
them, or matching nothing, does.

## The one deliberate asymmetry

`npm ci` runs **in CI only**, not in `commands.validate`. That is a decision, not
drift. `commands.validate` is required to stay hermetic — it runs as a plain `node`
process and must not make registry calls. With zero dependencies `npm ci` is cheap
today, but the moment a real dependency lands it becomes network- and cache-dependent.
Keeping the lockfile arm in CI preserves hermeticity by construction rather than by
luck.

## Do not wire a red-on-main checker into CI

`check-index-mirrors.mjs` and `check-doc-anchors.mjs` are green as of this writing,
but the rule stands regardless: every additional check widens what a red run can mean.
When a CI failure has to prove one specific thing — as it does when demonstrating that
the lockfile gate works — anything else that can go red is noise that makes the
demonstration inconclusive. Keep the failure surface narrow, and keep the hand-run
checkers hand-run.

The same reasoning applies to `claude plugin validate`. It is **not** in CI: the
Claude Code CLI is not on a GitHub runner and whether it runs unauthenticated there
is unverified. CI runs a small dependency-free manifest-shape check instead, and
`claude plugin validate plugin` stays the local gate. Note that form — it works from
the repo root, which is what let `commands.validate` drop its `cd`.
