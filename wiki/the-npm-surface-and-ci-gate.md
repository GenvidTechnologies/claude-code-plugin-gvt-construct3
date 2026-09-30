---
type: practice-note
title: The npm surface and the CI gate
description: >-
  Why the manifest and lockfile live in plugin/ and nowhere else, why an empty dependency set still makes a real gate, the four measured ways a check here passes while verifying nothing — npm ci walking up to an ancestor manifest, a glob matched from the wrong directory, a wrong path reporting as a deleted lockfile, and a reporter whose counters cannot be grepped — and what to do when a test-count floor moves: the file-count floor is derived from a declared inventory, so only the pass-count floor is ever a number you touch by hand. Also how to bump the audit-core pin and prove the audit's behaviour did not change.
tags: [ci, npm, lockfile, verification, fail-open, plugin-artifact, audit-core, pin-bump]
status: stable
generated: { by: process:plan-task, at: 2026-09-19T00:00:00Z }
---
# The npm surface and the CI gate

This repo carries a `plugin/package.json` and a committed `plugin/package-lock.json`
so a host can perform a **lockfile-gated dependency install**. The surface landed
with an empty dependency set (#119). Since #95 it carries one real dependency,
`@genvidtech/audit-core`, pinned exactly. The section on the empty set below is kept
as the record of why the surface was worth landing before anything needed it.

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
- **The host-install half had nothing to install yet.** With no dependencies there
  was no `node_modules/` to create. It became load-bearing when #95 named
  `@genvidtech/audit-core`. By then the lockfile was already committed, tracked and
  CI-enforced, which was the whole prerequisite. Claude Code's plugin docs state that
  a copied marketplace plugin gets `npm ci --ignore-scripts` in its cache: the install
  needs a lockfile, times out at 60 s, and cannot be disabled. A git checkout or a
  local-directory marketplace plugin gets no install, which is why the audit CLI
  runs a usability preflight.

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

TAP's totals don't tell you whether a *named* test ran, though. With
`--test-name-pattern`, a pattern that matches no test still reports
`tests 1 / pass 1 / fail 0` and exits 0: the one "test" counted is the file itself.
Measured 2026-09-30 in #142: `--test-name-pattern="zzz-no-such-test"` and the real
`"semver: higher patch"` print identical summaries. To confirm a named test ran, grep
the full-file TAP for its own line, `^ok [0-9]+ - <name>`, and treat a count of 0 as
"did not run", not as "passed".

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

## `npm ci` runs in both paths now — the asymmetry was retired

ADR 0019 originally kept `npm ci` in CI only, so that `commands.validate` stayed
hermetic. That held while the dependency set was empty. Once the audit imported
`@genvidtech/audit-core`, a fresh checkout or worktree could not run the plugin
suite without an install. So `commands.validate` now begins with
`npm ci --prefix plugin --ignore-scripts --no-audit --no-fund`
([ADR 0022](/decisions/0022-audit-core-adoption-and-npm-ci-in-validate.md)). The
cost is a registry call, or a cache hit, on every validate. That is accepted for
the maintainer's git checkout only. Consumers are unaffected, because Claude Code
performs their install once per cached plugin version and their audit makes no
registry call. CI and `commands.validate` both pass `--ignore-scripts`, matching
the install Claude Code performs.

## Bumping the `@genvidtech/audit-core` pin

The MCP pins have their own page ([Verifying an MCP pin bump](pin-bump-verification.md)).
This dependency does not, and its checks are different: nothing here is a tool surface,
and the question is only whether the audit still behaves the same. Worked out on #139
(0.2.0 → 0.2.1). Do the steps in this order, because step 2 cannot be done afterwards.

1. **Diff the two published tarballs before trusting the issue.** `npm pack` both
   versions in a scratch directory sealed with a `{}` `package.json` (otherwise npm
   resolves against `%TEMP%`'s own manifest), extract them, and `diff -r`. #139 said the
   only shipped change was a `.d.ts` comment. The diff also showed the exported `VERSION`
   constant and the package's own `package.json` changing. Neither mattered, but only the
   diff could say so. Compare `dependencies` and `engines` explicitly: a new runtime
   dependency is what consumers would actually receive.
2. **Capture the audit at the repo root before installing anything.** Run `audit.mjs`
   from the repo root with `C3_PROJECT_DIR` unset, normalise stdout and stderr with
   `scripts/lib/audit-diff.mjs`'s `normalise`, and save them with the exit code. Take it
   twice and `cmp` the two runs, so a later difference can't be noise. Re-run it after
   step 3 and `cmp` against the baseline. Once the install happens, nothing can rebuild
   the "before", so this row is point-in-time.
3. **Install exactly that version, and nothing else.**
   `npm install @genvidtech/audit-core@<v> --save-exact --prefix plugin --ignore-scripts`.
   Then read `git diff plugin/package-lock.json`: only the audit-core entry (version,
   `resolved`, `integrity`) and the root `dependencies` line should move. Check the
   `integrity` against `npm view @genvidtech/audit-core@<v> dist.integrity`.
4. **Run the before/after harness after committing.**
   `node scripts/audit-diff.mjs origin/main HEAD` installs each side from its own
   lockfile, so it compares the two pins on four fixture projects, not just what is on
   disk. It needs the bump committed. Exit 0 means every fixture matched on stdout,
   stderr and exit code, and its built-in control still separates two different repos.
5. **Run the gate.** Three tests (`frontmatter`, `frontmatter-branches`,
   `config-resolve`) import audit-core directly. ADR 0022 names them as the early warning
   for a behaviour change in a bump.
6. **The CHANGELOG entry depends on the release.** If the pin being replaced has never
   been released, correct the `[Unreleased]` entry that introduced it rather than adding a
   second bullet, since no consumer ever received the old pin. Once a pin has shipped, a
   bump gets its own entry. ADR 0022 keeps naming the version it adopted; it is a record,
   and is not swept.

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

## When a test-count floor moves

`gate.mjs` holds, per suite, a declared list of the test files making up that suite
(`expect: [...]`), plus one pass-count floor. The file-count floor is not written
anywhere — it is the list's length.

Adding or removing a test file means you list the file by name in `expect`, or remove
its entry; the file-count floor follows automatically. Adding or removing a test case
inside an existing file moves only the pass-count floor — the file itself didn't
change, so the file-count floor has nothing to move.

You do not have to measure anything by hand: run `node scripts/ci/gate.mjs` from the
repo root (not `cd plugin` first — `CLAUDE.md`'s own single-test recipe does exactly
that, and the shell's working directory persists between calls). A file you added but
did not declare is reported as unlisted; a pass count above the pass-count floor is
reported as stale. Neither turns the gate red — that is what `>=` is for — so the
report is the prompt, and acting on it is the rule, not optional housekeeping.

Both suites follow the same rule. The plugin suite ships and the workspace suite does
not, but that difference attaches to the test file, not to the file-count or
pass-count floor: a new test file under `plugin/` also earns a `plugin/CHANGELOG.md`
entry and a release bump, while `gate.mjs` itself sits outside `plugin/`, so changing
`gate.mjs` alone earns neither. The single rule's silence is not permission to skip
the CHANGELOG.

The `>=` rationale in one sentence: adding tests never breaks the gate — only losing
a declared file, or a glob matching nothing, does. `>=` is the margin for work in
flight, not a standing margin: if `gate.mjs`
prints a pass count above the pass-count floor on `main`, the pass-count floor is
stale and someone owes an edit, the same way an unlisted file owes a line in `expect`.

See ADR 0020 for why this repo calibrates exact-current rather than declared slack,
and for the dated review of the plugin suite's test-count floors against that policy.
