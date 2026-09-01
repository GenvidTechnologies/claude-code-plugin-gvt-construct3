# Changelog

All notable changes to the `gvt-construct3` plugin (formerly `genvid-c3`) are
documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **The agents now read a consuming repo's LLM-wiki.** If the repo's
  `.gvt-agent.json` declares a `wiki` block (`wikiDir` / `rawDir`, as written by
  `/gvt-dev:maintain-wiki`), `c3-explorer` and `c3-implementer` look there for
  project-specific facts in addition to `CLAUDE.md` — reading `<wikiDir>/index.md`
  first and opening only the page whose `description` matches, and treating
  `<rawDir>/` as provenance-only. Neither agent ever writes to either directory.
  `audit-c3-conventions` reports the block at **`info`** severity when absent
  (a discoverability note; it does not affect the exit code). Entirely optional —
  `CLAUDE.md` remains the default home for project facts. See
  `CONVENTIONS.md` → "If your repo keeps an LLM-wiki".
- **`docs/c3/` is now an OKF v0.2 bundle.** Every doc opens with `type` / `title` /
  `description` / `tags` frontmatter, and the five docs swept in #63 additionally
  carry a machine-readable `sources` entry citing `construct3-sample@v0.4.0`. This
  makes the platform reference routable by the same wiki tooling a consumer uses on
  its own pages. **The prose content of the docs is unchanged.**

### Changed
- **BREAKING — the plugin now requires `construct3-chef` ≥ `1.2.0`** (was `≥ 1.0.0`),
  and all four skills raise their declared `minVersion` to match
  (`audit-c3-conventions`, `author-navigation-patterns`, `build-reference`,
  `create-c3-op`). `audit-c3-conventions` **fails** against an older chef rather than
  warning. The floor moves because the plugin now cites chef's documentation resource
  by its path-shaped `docs:///` names, which exist only from `1.2.0`; below that they
  fail with `McpError(InvalidParams)` instead of resolving. If you pin chef yourself,
  bump it before taking this release.
- **Pinned MCP servers bumped: `construct3-chef` `1.1.0` → `1.2.0`, and
  `c3-domain-manager` `0.8.0` → `0.9.0`.** Neither release adds, removes, or renames a
  single MCP **tool** — verified by packing both versions of each server — so
  `c3-explorer`'s `tools:` allow-list is unchanged. What moved is each server's
  `docs:///` **resource** surface: both retired a flat `docs/` tier into a recursive
  `wiki/` bundle, so every served document is now addressed by its real relative path
  rather than a bare stem.
- **The plugin's citations of chef's documentation resource were malformed and are now
  corrected** (#86). Every reference was written as `construct3-chef://docs`, which
  transposes the server name and the URI scheme and **has never resolved** — 28
  occurrences across 13 shipped files and the dev workspace. They now name the pair:
  the `construct3-chef` server plus a `docs:///<path>` URI (for example
  `docs:///reference/recipe-reference`). **If you copied `construct3-chef://docs` into
  your own agents, skills, or docs, grep for that exact string — it does not work
  there either.** The two agents differ deliberately: `c3-implementer` is told to read
  the resource with `ReadMcpResourceTool`, while `c3-explorer` — whose hard `tools:`
  allow-list contains no MCP-resource tool — is told the resource is out of its reach
  and to hand the question to its orchestrator, rather than being handed an
  instruction it cannot execute. Recorded as ADR 0013, which amends ADR 0010's link
  form while leaving its capability-not-symbol rule intact.
- **`c3-domain-manager`'s schema doc is cited the same way** — `domain-architecture.md`
  becomes the `c3-domain-manager` server's `docs:///reference/domain-architecture`
  resource. Both bundled servers register the `docs` scheme, so every citation names
  its server; a bare `docs:///…` URI would not say which server it addresses.
- **`docs/c3/README.md` is now `docs/c3/index.md`** — the file is unchanged apart
  from the rename and the fixes below; it remains both the bundle index and the doc
  table. If you deep-link `docs/c3/README.md` from your own docs, repoint it.
  Links to the individual docs (`docs/c3/construct3-guide.md#anchor` and siblings)
  are **unaffected** — no doc was moved, and no heading anchor changed.

### Fixed
- **The C3 platform reference stated one production project's house conventions as Construct 3
  rules, and named that project's sheets, layouts and helpers** (#70) — the last of the
  four-issue de-Burbanking family (#69, #72, #76). In
  `docs/c3/event-sheet-architecture.md`, the sections *"Layout Event Sheets vs Included Event
  Sheets"*, *"Per-Layout Event Sheet Pattern"* and *"Event Sheet Hierarchy"* prescribed one
  studio's include conventions in platform voice ("should", "never", "the preferred pattern")
  and named `CommonEvents`, `MainMenuEvents`, `HeroSelectionEvents`, `HeroSelectLayoutEvents`,
  `BattleLayout`, `HeroSelectLayout` and `startGameRequest()` / `callCloudScript`;
  `docs/c3/typescript-integration.md` told readers to *"always import from index files (e.g.,
  `common/public/index.js`)"* — a module layout that exists in no generic C3 project — and
  used `Functions.canAffordGame` and a `CloudScript` backend as its worked examples.
  **One of these was not merely house-specific, it was wrong:** the doc claimed that
  including a shared utilities sheet first "ensures common functions ... are available
  everywhere", which the same page contradicted fifteen lines later. C3 functions are global
  regardless of the include tree; what an include controls is whether that sheet's
  **triggers** are installed for the layout.
  **What it is now:** every platform mechanic in those sections is kept, and stated once
  instead of up to four times — one layout event sheet per layout (the `"eventSheet"`
  field), an included sheet's `on-start-of-layout` / `on-end-of-layout` firing for every layout
  whose include chain reaches it, statics surviving layout changes, triggers firing in
  include order, dispatched actions, action ordering within a block, and
  `wait-for-previous-actions` suspending the block rather than the tick. The house rules, the
  migration advice and the "5+ layouts" threshold are gone.
  **Structural note:** `## Per-Layout Event Sheet Pattern` is replaced by
  `## Trigger Installation and Execution Order`, and `## Event Sheet Hierarchy` — which
  contained no fact not already stated earlier in the same file — is removed. **The anchors
  `#per-layout-event-sheet-pattern` and `#event-sheet-hierarchy` no longer resolve**; update
  any external link into them. Nothing in `## Event Sheet JSON Structure` changed.
  **What to re-check:** if you ordered a layout event sheet's includes to put a shared
  utilities sheet first *so that its functions would be callable*, that was never what the
  include did — check instead which of that sheet's **triggers** your layout depends on. And
  grep your own project for `CommonEvents`, `HeroSelectionEvents`, `startGameRequest`,
  `callCloudScript`, `Functions.canAffordGame` and `common/public/index.js`: those are names
  from the project this reference was adapted from, and they exist only if you defined them.
- **The C3 platform reference told you to call two construct3-chef functions that
  no longer exist.** `docs/c3/construct3-guide.md` directed readers to
  `generateUniqueSid()` from `c3/sidUtils.js`, and to initialise a SID registry via
  `initSidContext(path)`. Both were **removed from chef** when the SID singleton was
  retired; the current entry point is `mintUniqueSid(usedSids)` in
  `src/c3/sidUtils.ts`, and the cited `.js` path was wrong as well. **If you wrote
  scaffolding against either name, it never resolved** — re-check any SID-minting
  code you based on that passage, and see `construct3-chef://docs` for the current
  API. The platform half of the passage was correct and is unchanged: SIDs must fit
  `Number.MAX_SAFE_INTEGER`, C3 refuses the layout with `Error: invalid SID`
  otherwise, and existing project SIDs sit in `[1e14, 1e15)`.
- **construct3-chef tooling facts removed from the C3 platform reference** (#69).
  `docs/c3` no longer restates chef's CLI commands (`generate`, `sync-project`,
  `scaffold-layout`, `navigation-graph`) or its MCP tools (`read-event-sids`,
  `read-dsl-index`, `list-global-layers`); each now links to
  `construct3-chef://docs`, which owns them. Nothing about C3 itself was removed —
  the global-layer `"global"` / `"overriden"` semantics, the template/replica rules
  and the SID range constraint all stay. Per ADR 0010, these docs now refer to the
  toolchain by *capability* and never by symbol name, so this class of rot cannot
  recur. The `global-layers.txt` report format and the `list-global-layers` tool
  were undocumented on chef's side too, and are filed as
  [chef#196](https://github.com/GenvidTechnologies/construct3-chef/issues/196).
- **Four dead links in the C3 platform reference index.** `docs/c3/README.md`
  pointed at `../recipe-reference.md`, `../generators.md`, `../cli.md`, and
  `../mcp-architecture.md` — paths inherited from the founding import out of
  construct3-chef, which have never existed in this plugin, so all four 404'd for
  every consumer since the reference first shipped. They now point at
  `construct3-chef://docs`, the actual home of the tooling reference. If you
  followed one of those links and concluded the tooling docs were missing, they
  were simply never here — see `construct3-chef://docs`.
- **Bumped both pinned MCP servers** — `construct3-chef` `1.0.0` → **`1.1.0`** (#73)
  and `c3-domain-manager` `0.7.0` → **`0.8.0`** (#74). Shipped together: both adopt
  the same upstream generation (`@genvidtech/c3source ^2.0.0`, `@genvidtech/mcp-utils
  ^0.7.0`), and running mismatched c3source majors against one `extracted/` tree is
  the coupling `docs/c3/toolchain-config.md` warns about. `minVersion` floors are
  unchanged — this is a pin bump, not a floor bump.
- **`list-layouts` now returns only `.json` files.** As of chef `1.1.0`, stray
  non-`.json` files under `layouts/` are no longer listed (fallout of c3source
  2.0.0's `.json` item policy). A file's absence from the output is therefore not
  evidence it is missing from disk. Noted in `c3-explorer`.
- **The C3 platform reference recommended a modal-input helper and a feature-flag
  getter that don't exist in Construct 3** (#76). `docs/c3/construct3-guide.md`
  told readers, at three sites, to call `toggleInteractiveLayers` to disable UI
  input under a modal, and named `Functions.GetFeatureFlagAsString(key, fallback)`
  as how flag values "are typically fetched" — both are project-specific helpers
  belonging to the production project this reference was originally adapted from,
  not C3 APIs. The `toggleInteractiveLayers` recommendation also linked to
  `layout-reference.md#modal-layer-management-toggleinteractivelayers`; git history
  confirms no revision of `layout-reference.md` has ever contained that heading —
  the link shipped broken in the founding import and was never valid, so it was
  **deleted rather than repaired** (no replacement section exists to point at; see
  `docs/decisions/0011-a-docs-provenance-note-is-part-of-the-move-cost.md`). Both
  passages now state the platform mechanism directly: use
  `System.set-layer-interactive(interactive=false)` on the layers beneath a modal,
  not `System.set-group-active(state=deactivated)`, which stops every event in the
  group including signal and timer handlers; and a neutral
  `Functions.GetFlagAsString(key, fallback)` placeholder, with the doc now saying
  plainly that C3 exposes no feature-flag primitive so the function must be
  project-defined. The platform half of each passage is unchanged — notably that
  layer re-enable must be deferred by at least one tick past the modal close, or
  the same physical tap passes through to the layer beneath. **If you wrote
  event-sheet logic or tooling calling `toggleInteractiveLayers` or
  `Functions.GetFeatureFlagAsString` on the strength of this reference, it was
  calling something that only exists if your own project defines it** — grep for
  both names. Separately, the guide's `## 7. C3 Conventions` section is renamed to
  `## 7. Platform Gotchas and Field Knowledge`, since a "Conventions" section in a
  platform reference invited readers to treat one project's house rules as C3
  rules; house-rule content was removed and every platform behaviour in it was
  kept. The section number is unchanged, but **the old anchor
  `#7-c3-conventions` no longer resolves** — update any external link into it.

### Added
- **`preview-addon-metadata-sync`** (chef `1.1.0`, `READ_ONLY`) added to
  `c3-explorer`'s `tools:` allow-list and tool inventory — a dry-run report of
  `version`/`author` drift between bundled `.c3addon` packages and
  `project.c3proj`'s `usedAddons` entries. Because that allow-list is a hard
  capability gate, this is a functional addition, not a doc update.
- **`sync-addon-metadata`** (chef `1.1.0`, `MUTATE`) documented in
  `c3-implementer` — only `direction: manifest-from-package` writes; the opposite
  direction is a read-only report. Documentation only: that agent has no `tools:`
  allow-list.

### Fixed
- **DSL-renderer behaviour is no longer stated as C3 platform behaviour** (#72) in
  `docs/c3/construct3-guide.md` and `docs/c3/event-sheet-architecture.md`. Five
  clauses described what an extraction/rendering tool does with event-sheet JSON as
  though it were what Construct 3 itself does. The worst used a *tool* implementation
  detail as the evidence for a *platform* scoping claim — variables being visible
  throughout their scope was attributed to an extractor pre-collecting them — leaving
  a reader unable to tell which was the platform rule. Two clauses named
  **`extract-scripts`, a tool that does not exist**: verified against the pinned
  `@genvidtech/construct3-chef@1.1.0` (`npm pack` + whole-tree grep, exit 1, with a
  `read-scripts` control at exit 0); the only registered `extract-*` MCP tool is
  `extract-template`. With no correct owner to point at, the clauses were **deleted
  rather than re-attributed**; the renderer behaviours are recorded upstream as
  [`c3source#81`](https://github.com/GenvidTechnologies/c3source/issues/81). Platform
  halves are preserved throughout — the `"language": "typescript"` requirement and its
  runtime consequence, and the visibility-vs-initializer-order rule. **No new ADR 0008
  `unverified` callout accompanies the last of these, deliberately**: it sits in
  `## 5. C3 Runtime Behavior`, which ADR 0008 §1 puts outside marker scope and the
  doc's own provenance note already covers by name — a marker there would have implied
  the rest of §5 was sample-verified. That corrects an acceptance criterion on #72
  itself, which had asked for one.
- **`"o"` is not a per-instance override flag** (#63) in `docs/c3/layout-reference.md`.
  It was documented as enabling per-instance property overrides on template children,
  with advice to set `"o": true` for runtime property changes. No such mechanism
  exists. `"o"` is two unrelated short keys: `transformOpacity` within
  `sceneGraphData.flags` (which maps 1:1 onto the SDK's `SceneGraphHierarchyOpts`),
  and a template-sync flag in the separate `template.components[world-instance]`
  namespace. **If you set `"o": true` expecting per-instance overrides, that edit did
  something else.**
- **Overridden layers do not have their content cleared** (#63) in
  `docs/c3/layout-reference.md`. The doc claimed a shadowed layer's `instances` "MUST
  be empty", that instances "are cleared" when a layer becomes overridden, and offered
  `git show` recovery for the supposed loss. All wrong, and wrong in the dangerous
  direction. `overriden` is **passive** — it marks the layer *being* shadowed by a
  same-named global layer elsewhere, joined by name — and that layer carries
  `"global": false`, keeps its own `sid`, and **retains its instances**, which are
  ignored at runtime and restored if the layer reverts to non-global. **Tooling that
  "repaired" shadowed layers by emptying them was destroying live data.**
- **`instanceFolderItem` and `scene-graphs-folder-root` do not exist** (#63) in
  `docs/c3/construct3-guide.md` and, more seriously, in the `c3-implementer` agent,
  which instructed it to replace an instance's SID in all three places. Neither key
  exists in C3 project JSON at any version. An instance has exactly one `sid`;
  `sceneGraphData` references relatives by `uid`, never by SID.
- **The `subLayers` "casing mismatch" was never a C3 fact** (#63) in
  `docs/c3/layout-reference.md`. C3 uses camelCase `subLayers` in JSON *and*
  camelCase `subLayers()` / `allSubLayers()` in the SDK — both methods. No lowercase
  `sublayers` form exists anywhere in C3; the mismatch described a consumer tool's own
  interface. The confirmed half (camelCase JSON key, positional sublayer membership)
  is preserved.
- **The `project.c3proj` registration rule listed directory names, not keys** (#63) in
  `docs/c3/construct3-guide.md`. Registration is by kind under *singular*
  `rootFileFolders` keys (`script`, `icon`, …), `models3d` and `video` were missing
  entirely, and the blanket "all files under these directories" rule has a live
  counterexample — `tilemapBrushes/` and `addons/` carry no manifest entry at all.
- **`importsForEvents.ts` imports rather than re-exports** (#63) in
  `docs/c3/typescript-integration.md`.

### Changed
- **Raised the baseline `construct3-chef` contract floor `0.11.2` → `1.0.0`** (#32),
  in `audit-c3-conventions`' `metadata.expects.mcp` and the `CONVENTIONS.md` contract
  table. Consuming repos on a chef older than `1.0.0` now fail the audit with an
  error. The floor moves here rather than with the pin bump (#61) because the pin
  alone required nothing new functionally — the `validate-addons` guidance added
  below does. The `c3-domain-manager` floor stays at `0.6.1`.
- **Bumped the pinned `construct3-chef` MCP server `0.11.2` → `1.0.0`** (#61) and
  the pinned `c3-domain-manager` MCP server `0.6.2` → `0.7.0` (#60), in
  `plugin.json` `mcpServers` plus the version prose in both agents and
  `plugin/docs/c3/toolchain-config.md`.

### Added
- **Verification provenance for the whole C3 platform reference** (#63). Each
  `docs/c3/` doc swept in this pass now carries a provenance note naming the ground
  truth (`construct3-sample@v0.4.0`, cross-checked against `v0.1.0`–`v0.3.0`), plus
  per-section *unverified* callouts in three forms — construct absent from the sample,
  key present but empty, and not observable from an on-disk project. The note states
  the invariant that makes a marker's **absence** meaningful: an unmarked section was
  confirmed against the sample or corrected to match it. `grep -rn construct3-sample
  plugin/docs/c3/` returns the complete inventory.
- **Completed JSON examples that previously omitted mandatory keys** (#63). Event-sheet
  blocks, conditions and actions now show their mandatory 15-digit `sid` (one example
  carried `"sid": 123`, which the SID range constraint forbids); a parameter-less
  condition now shows `parameters` omitted entirely rather than `{}`; the `variable`
  and `group` shapes are complete, including that a group's label key is `title` (not
  `name`) and that `initialValue` is a string even for numeric variables. The template
  block gains its five missing keys, its fifth `world-instance` component id, and the
  `templateName` / `sourceTemplateName` master-vs-replica swap. `instanceVariables` is
  documented as an array on a declaration but a map on an instance.
- **A consuming-repo recommendation to run chef's `validate-addons`** (#32) in
  `CONVENTIONS.md`. It is a CLI subcommand of the already-pinned package (no extra
  dependency), read-only, and exits non-zero on findings, so it chains with `&&`
  into `commands.validate`, a CI step, or an npm script. It covers package
  integrity, metadata drift against `project.c3proj`'s `usedAddons`, orphan /
  missing / duplicate packages, and each addon's `aces.json` / `properties` against
  its `lang/*.json`. Safe to add unconditionally: on a project that does not bundle
  addons it reports nothing and exits `0`, because the missing-package pass only
  considers `usedAddons` entries marked `bundled: true`. The MCP-only recon tools
  (`diff-addon-aces`, `scan-addon-usage`) are deliberately left to `c3-explorer` —
  they have no CLI subcommand. The plugin recommends and runs this tooling; it does
  not reimplement it, and `audit-c3-conventions` stays limited to contract
  presence/reachability.
- **Five new read-only tools on `c3-explorer`'s hard `tools:` allow-list**
  (30 → 35 entries). From chef `1.0.0`, a bundled-`.c3addon` inspection surface:
  `list-addons` (inventory of bundled packages + `project.c3proj` entries +
  editor-only addons), `validate-addons` (cross-checks each package's internal
  `addon.json` against its `usedAddons` entry; reports orphan / missing /
  duplicate packages — the version-drift check `validate-project` does not do),
  `diff-addon-aces` (ACE-contract diff between two addon versions), and
  `scan-addon-usage` (every call site of an addon's ACEs — the upgrade blast
  radius when paired with a diff). From dm `0.7.0`, `addon-inventory`
  (project-wide addon attribution: which addons are used, by which object types
  and domains). The existing `read-addon` also now decodes the bundled package's
  version/metadata directly, with no manual unzip.
- **ADR 0007** (`docs/decisions/0007-verifying-the-resolverootfolder-mirror.md`)
  — how to discharge the ADR 0006 `resolveRootFolder` hand-mirror obligation on a
  `c3-domain-manager` bump: diff `dist/adapters/locations.js` *and* prove the
  `@genvidtech/mcp-utils` range cannot resolve to an unreviewed version, rather
  than trusting release notes.
- **An `## Effects` section in `plugin/docs/c3/layout-reference.md`** (#59),
  promoted out of the global-layer section because the rules are general, not
  global-layer-specific. Documents the declare-vs-apply split (`usedAddons` entry,
  the `effectTypes[]` declaration on an object type / family / layer / layout, and
  the applied data), the differing applied shapes per host, and the
  `effectId` → renameable `name` → `effects` map-key join — cross-linked to its
  structural twin, the behavior chain in `event-sheet-architecture.md`. Carries the
  completeness gotcha it was filed for: a declaration without its applied data is
  *half-applied* and can **null-pointer the whole project on editor load**, while
  the addon stays valid, the JSON parses, and `validateForEditor` passes.

### Fixed
- **`CONVENTIONS.md` cited a stale baseline chef floor of `≥ 0.4.0`** (#32) on the
  `author-navigation-patterns` and `create-c3-op` skill rows, describing their own
  floors as sitting *above* it. The baseline had long since moved past `0.4.0`, and
  at `≥ 1.0.0` those per-skill floors are now **subsumed by** the baseline rather
  than above it. Both rows corrected.
- **The documented instance-level `effects` shape was wrong** (#59). It showed an
  array of objects carrying a `name` field; an applied effect is a **map keyed by
  the effect's name**, with `{ isEnabled, parameters }` values. Verified against
  the editor-validated `GenvidTechnologies/construct3-sample@v0.1.0`. Anything
  authored from the old snippet produced a half-applied effect — see the gotcha
  above.

### Notes
- **A floor tracks what a skill *needs*, not what is pinned.** That is why the pin
  bump (#61) left both `minVersion` floors alone and the chef floor moved only once
  #32 added guidance that functionally requires chef `1.0.0` — see *Changed* above.
  The `c3-domain-manager` floor stays at `≥ 0.6.1` in `audit-c3-conventions` and
  `CONVENTIONS.md`: nothing in this release requires more of it.
- **`audit.mjs` is untouched.** The ADR 0006 discovery mirror was verified
  drift-free by the ADR 0007 method, not assumed so.

## [2.2.1] - 2026-07-16

### Added
- **Documented the behavior-attachment serialization shape in the C3 platform
  reference** (`plugin/docs/c3/event-sheet-architecture.md`, new "Behavior
  attachment and ACE targeting" section): how a host (object type / family)
  carries a behavior via `behaviorTypes[]` (`behaviorId` addon-id join key vs.
  the renameable instance `name`), how an event-sheet condition/action targets a
  behavior instance via `behaviorType` (the instance name, not the addon id), the
  family-member `objectClass` subtlety (member name in the call while the behavior
  lives in the family's `behaviorTypes[]`), and the built-in-vs-third-party
  (`.c3addon` under `addons/behavior/`) packaging distinction. Cross-linked from
  `addon-package-reference.md`; the docs README table and `docs/TOC.md` coverage
  summaries updated to match. Facts verified against a real r-series export. (#56)

### Changed
- **Bumped the pinned `c3-domain-manager` MCP server `0.6.1` → `0.6.2`**
  (`@genvidtech/c3-domain-manager@0.6.2` in `plugin.json` `mcpServers`, plus the
  version citations in `c3-explorer.md`, `c3-implementer.md`, and
  `toolchain-config.md`). The patch is an internal file-discovery fix:
  `generate` / `domain-health` / `context-map` no longer crash with `ENOENT`
  on a C3 project that has no `scripts/` directory. **No MCP tool was added,
  renamed, or removed**, so the `c3-explorer` `tools:` allow-list needs no
  reconciliation and the audit's `resolveRootFolder` discovery mirror is
  unaffected. The `minVersion` floors stay at `0.6.1` (a plain pin bump does
  not raise the contract floor). (#55)

## [2.2.0] - 2026-07-13

### Added
- **`audit-c3-conventions` gains a second bespoke check, discovery ambiguity,**
  mirroring how `c3-domain-manager` auto-discovers its project root when the
  plugin launches it with bare args (no `--project-dir`): scanning the repo
  root's immediate child directories (depth 1) for `project.c3proj`. If the
  repo root itself has no `project.c3proj` but 2+ child directories each
  contain one, that server-side `resolveRootFolder` discovery aborts and the
  server fails to start with `-32000` — previously a failure the audit was
  green on. The check now surfaces it as a new advisory **`warning`**-severity
  finding (a tier between `error` and `info`) naming the colliding
  directories; warnings do not change the exit code (only errors → exit 1).
  A `C3_PROJECT_DIR` env override (or `--project-dir`) suppresses discovery,
  so the check does not fire when one is set, and a repo-root
  `project.c3proj` short-circuits discovery entirely. (#47)
- **Two refinements to the discovery-ambiguity check.** First, the
  discovery-ambiguity `warning` is now also suppressed when a workspace-root
  `.mcp.json` overrides the `c3-domain-manager` server entry with a
  `--project-dir` arg or `env.C3_PROJECT_DIR` — previously only the live
  `C3_PROJECT_DIR` env var suppressed it, so a repo pinning the root purely
  via `.mcp.json` saw a false-positive warning. Second, a new advisory
  **`info`**-severity finding (`discovery-divergence`) fires when
  `.gvt-agent.json` `paths.c3project` resolves to a different root than bare
  auto-discovery would pick — the server may operate on a different (but
  valid) project than the audit validated, which is not a guaranteed
  `-32000` crash and so is `info`, not `warning`. Neither refinement changes
  the exit code. (#49)
- **`docs/c3/addon-package-reference.md`**: new platform-reference doc, the
  companion to `ace-reference.md`, covering the addon package's on-disk
  layout — where properties are declared (the editor ROOT `plugin.js`, not
  `c3runtime/plugin.js`), the `lang/*.json` localization structure keyed by
  the addon `id`, and the opaque load-time error a missing language string
  produces. The Construct Addon SDK
  (`https://github.com/Scirra/Construct-Addon-SDK.git`, published by Scirra)
  is the canonical source. (#51)

### Changed
- **`c3-implementer` now guides finalizing `extracted/` regeneration with the
  consuming repo's repo-pinned generation command, not the MCP `regenerate`
  tool.** MCP `regenerate` / `apply-recipe` auto-regen runs the *plugin-bundled*
  `construct3-chef`, which can differ from a consumer's pinned
  `@genvidtech/construct3-chef`; a version skew re-renders DSL with annotations
  the consumer's CI baseline predates (e.g. `comparison=1` → `comparison=1 (≠)`),
  producing spurious drift across untouched event sheets that fails
  `extracted-fresh` / CI. A new "Finalizing regeneration" section (with
  cross-pointers at Recipe Workflow step 7, Commit Protocol, and the `regenerate`
  tool listing) tells the agent to finalize with the repo-pinned command (read
  from the consumer's `CLAUDE.md`; hand back if none is documented) and to revert
  any skew-only DSL drift before staging. Guidance stays generic. (#48)

## [2.1.1] - 2026-07-07

### Fixed
- **author-navigation-patterns preview helper now scans `--dsl` directories
  recursively.** `collectDslFiles` used a non-recursive `fs.readdir`, so
  pointing `--dsl` at a nested `extracted/` tree matched 0 files and
  misreported "0 captures" as a bad pattern. It now recurses (`{ recursive:
  true }`, building each path from the Dirent's `parentPath`) and warns to
  stderr when a `--dsl` directory contains no DSL files, distinguishing
  "scanned nothing" from "matched nothing". (#45)

## [2.1.0] - 2026-07-03

### Changed
- **Both bundled MCP servers moved from the `@genvid` npm scope to `@genvidtech`,
  with a version bump each:** `construct3-chef` `@genvid/…@0.10.2` →
  `@genvidtech/construct3-chef@0.11.2` (#39) and `c3-domain-manager`
  `@genvid/…@0.5.0` → `@genvidtech/c3-domain-manager@0.6.1` (#40). The old
  `@genvid` scope is frozen/deprecated (chef last published `0.11.1`, dm `0.5.0`);
  `@genvidtech` is the live scope. The bump also carries chef's adoption of
  `@genvidtech/c3source` 1.7.0 (comparison-operator DSL annotation, inherited
  transparently) and both servers' migration to `@genvidtech/mcp-utils`.
  **No MCP tool-surface change** — chef stays at 31 tools, domain-manager at 13;
  verified by diffing the `reg(…)` / `registerTool(…)` names of the old pins
  against the new (`0.10.2`↔`0.11.2`, `0.5.0`↔`0.6.1` both identical), so the
  `c3-explorer` `tools:` allow-list and the agents' tool enumerations are
  unchanged apart from the pinned-version prose.
- **`audit-c3-conventions` minimum-version floors raised to the new scope's
  first-published releases:** `construct3-chef` `≥ 0.4.0` → `≥ 0.11.2` and
  `c3-domain-manager` `≥ 0.1.1` → `≥ 0.6.1` (nothing is published below those
  under `@genvidtech`), reflected in both the `metadata.expects.mcp` entries and
  `CONVENTIONS.md`. The `expects.mcp.package` names across every skill
  (`audit-c3-conventions`, `build-reference`, `author-navigation-patterns`,
  `create-c3-op`) now probe the `@genvidtech` packages the plugin actually
  launches. (#39, #40)
- **`audit-c3-conventions` now reads a consuming repo's gvt-dev config as
  `.gvt-agent.json`**, falling back to the legacy `.genvid-agent.json` (with an
  info-severity deprecation finding) during the consumer transition, following
  the `genvid-dev`→`gvt-dev` / `.genvid-agent.json`→`.gvt-agent.json` rename.
  The C3-project marker check, project-root resolution, and `CONVENTIONS.md`
  contract are updated; un-migrated consumers are not broken (#42).

## [2.0.0] - 2026-06-29

### Changed

- **BREAKING: the plugin is renamed `genvid-c3` → `gvt-construct3`**, matching the
  repository rename (`claude-code-plugin-genvid-c3` → `claude-code-plugin-gvt-construct3`).
  This changes the plugin's identifier everywhere consumers reference it:
  - **Install id:** `genvid-c3@genvid-plugins` → `gvt-construct3@genvid-plugins`.
    Consumers must **uninstall the old plugin and install the new one** — a
    `/plugin update` does not rename it.
  - **Skill invocation:** `/genvid-c3:<skill>` → `/gvt-construct3:<skill>`.
  - **Agent dispatch:** `subagent_type: "genvid-c3:<agent>"` → `"gvt-construct3:<agent>"`.
  - The `audit-c3-conventions` report now labels the component `gvt-construct3`.

  Historical changelog entries below keep the `genvid-c3` name they shipped under.

## [1.6.0] - 2026-06-18

### Added
- **`audit-c3-conventions` now resolves `expects.files` entries relative to the
  C3 project root** when a file is annotated `base: project` in the component's
  frontmatter. The project root is derived from `.genvid-agent.json`
  `paths.c3project`, falling back to the repo root when absent. Four
  `expects.files` entries are annotated with `base: project`:
  `domain-config.json` in `audit-c3-conventions`, and
  `construct3-chef.config.json` in `author-navigation-patterns`,
  `build-reference`, and `create-c3-op`. Entries without `base:`
  continue to resolve against the repo root (no behavior change for rooted
  consumers). The `base:` field is now part of the data-driven `metadata.expects`
  contract; adding a new project-root file requirement needs only a frontmatter
  annotation, no audit-script change. (#26)
- **`docs/c3/toolchain-config.md`** rewritten: the stale "Non-Root C3 Project
  Limitation" section (which claimed no override existed) is replaced with an
  accurate "Non-Rooted C3 Projects" section covering the four-tier precedence
  (`--project-dir` > `C3_PROJECT_DIR` > depth-1 auto-discovery > cwd fallback),
  the zero-config single-project-subdir path, ambiguity divergence between the
  two servers, and the consumer escape hatches (`C3_PROJECT_DIR` or a
  workspace-root `.mcp.json` override entry). Also corrects `domain-config.json`
  placement from "workspace root" to "C3 project root" to match the actual
  resolution model. (#26)
- **ADR `docs/decisions/0005-non-rooted-c3-project-support.md`** (dev workspace,
  not shipped): records why `plugin.json` stays bare (static manifest cannot
  express a per-consumer subdir; `--project-dir ${CLAUDE_PROJECT_DIR}` suppresses
  auto-discovery) and why `metadata.expects.files` gains a per-entry `base:` field
  rather than a hardcoded filename allow-list or a per-skill base. (#26)
- **Backfilled four earlier architecture decisions as ADRs** (dev workspace, not
  shipped), dated from their original commits and recorded 2026-06-18: 0001 the
  three knowledge boundaries, 0002 the data-driven audit contract + minimal
  frontmatter parser, 0003 the two-agent capability split, 0004 the `plugin/`
  subfolder split + `git-subdir` marketplace source. The non-rooted ADR was
  renumbered 0001 → 0005 so the records read chronologically.

### Changed
- **Bumped bundled MCP server pins:** `construct3-chef` `0.10.1` → `0.10.2`
  (#28) and `c3-domain-manager` `0.4.0` → `0.5.0` (#27). Both releases add
  project-root resolution (`--project-dir` flag / `C3_PROJECT_DIR` env var /
  `project.c3proj` discovery, precedence in that order, falling back to `cwd`),
  letting the servers target a C3 project that is **not** at the launch cwd —
  the server-side groundwork for non-rooted C3 projects (#26). **No MCP tool
  surface change** (chef stays at 31 tools, domain-manager at 13; verified by
  diffing `registerTool` across both packages' `dist/`), so no agent
  `tools:` allow-list changes — only the pinned-version prose in
  `c3-explorer`, `c3-implementer`, and `docs/c3/toolchain-config.md` was swept.

## [1.5.0] - 2026-06-16

### Changed
- **`build-reference` now sources built-in ACE *shape* from the C3 editor CDN's
  `allAces.json`** instead of heuristic manual-PDF table parsing — shape (kebab `id`,
  `scriptName`/`expressionName`, params **with real types**, `kind`) is now
  deterministic with full coverage. The manual PDF is demoted to **descriptions +
  concept chunks**, joined onto the CDN shape via a two-tier name match (exact
  normalized, then token-subset, e.g. `IsAnimPlaying` ↔ "Is playing"). Adds two
  reusable scripts alongside `build-index.mjs`: `fetch-aces.mjs` (download
  `plugins/` + `behaviors/` `allAces.json` for an editor `--rev`, or `--input` a
  local file offline) and `merge.mjs` (join descriptions onto CDN shape with a
  plugin-name alias map + per-objectClass coverage report). `manualVersion` now
  records the editor revision + manual pull date (e.g. `r476-4+manual-2026-06-11`).
  Shape is authoritative for 100% of built-in ACEs; description-join coverage stays
  best-effort and is reported honestly. (Closes #24.)

## [1.4.0] - 2026-06-15

### Added
- **`build-reference` skill** (`/genvid-c3:build-reference`): produces
  construct3-chef's `c3-reference` cache (`<extractedDir>/c3-reference/index.json`)
  so `search-docs` can resolve **built-in plugin ACEs, layout/scripting docs, and
  the Expression language** — coverage that needs the cache (custom-addon ACEs
  already work live). Reads the version-pinned C3 manual PDF (the only
  machine-reachable source for built-ins; construct.net is Cloudflare-challenge-
  walled, so its URLs serve only as `canonicalUrl` anchors), extracts built-in ACE
  tables + concept prose, and writes a schema-valid cache via a bundled assembler
  (`scripts/build-index.mjs` + `scripts/lib/reference-index.mjs`, 21 unit tests).
  The bundled validator mirrors chef's `ReferenceIndexSchema` as a *preview*;
  chef's own `search-docs` is the authoritative check. The cache holds
  `source:"builtin"` ACEs + chunks **only** — chef reads `addons/*/aces.json` live
  and merges it, so caching addon ACEs would double-count them. Declares
  construct3-chef `minVersion 0.9.0` in `metadata.expects`. (Closes #13;
  construct3-chef#87.)
- `docs/c3/ace-reference.md`: new platform-reference doc for the ACE
  (action/condition/expression) metadata model — the `aces.json` structure for
  custom addons (category-keyed; params keyed by `id`; expressions use
  `expressionName`; `$schema` skipped) and why built-in/system plugins have no
  `aces.json` (C3 is a webapp — no install). The durable platform knowledge the
  `build-reference` skill relies on, documented once per the chef-owns-tooling /
  plugin-owns-platform split.
- `c3-explorer` and `c3-implementer` now document construct3-chef's **`search-docs`**
  MCP tool (new at `0.9.0`). It is `READ_ONLY` — looks up C3 ACE (action/condition/
  expression) reference (parameter names/types, expression syntax, condition/action
  ids). Custom-addon ACEs are always available (read from the project's `addons/`);
  built-in plugins, layouts, scripting, and the Expression language light up when the
  `c3-reference` cache is present. Added to `c3-explorer`'s `tools:` allow-list +
  "read & list" body, and to `c3-implementer`'s "Reading" list. (construct3-chef#87.)
- `c3-explorer` and `c3-implementer` now document construct3-chef's **user-defined
  ops** surface (new at `0.10.0`, construct3-chef#89). `list-ops` is `READ_ONLY` —
  lists the project's parameterized recipe-template ops (from the `ops/` dir) with
  their params; added to `c3-explorer`'s `tools:` allow-list + "read & list" body and
  `c3-implementer`'s "Reading" list. `apply-op` and the dynamically-registered
  `op-<name>` tools (one per op file, hot-reloaded) are `MUTATE` — documented as a
  class in `c3-implementer`'s mutation lists (the names are not fixed; enumerate via
  `list-ops`), and deliberately kept off `c3-explorer`'s read-only allow-list.
- **`create-c3-op` skill** (`/genvid-c3:create-c3-op`): authors and dry-run-validates
  a construct3-chef **user-defined op** — a parameterized recipe template (one JSON
  file in the ops dir whose filename is the op name). Elicits typed params (flagging
  the `required:false`-without-`default`, `default`/`type`-mismatch, and typed
  whole-value-vs-embedded-vs-object-key substitution pitfalls), places `{{PARAM}}`
  tokens, and writes the op-file shell on confirmation, then validates via chef's
  `list-ops` + `apply-op --dry-run` (the sole authoritative checks — no bundled
  helper script). Authors the op **wrapper only**; the recipe body defers to chef's
  `recipe-reference.md` + the `c3-implementer` agent, and the skill never runs a
  writing `apply-op`. Declares construct3-chef `minVersion 0.10.0` in
  `metadata.expects` (the feature floor — ops landed in #89). (Refs #21.)
- The README **and shipped `CONVENTIONS.md`** skill tables now list
  `author-navigation-patterns`, `build-reference`, and `create-c3-op` (both
  previously omitted `build-reference` and `create-c3-op`).

### Changed
- Bumped the pinned `construct3-chef` MCP server `0.8.0` → `0.9.0`. **Tool-surface
  reconciliation run** (`registerTool` diff, 29 → 30 tools): the only surface change
  is the added `search-docs` tool above — no tools were renamed or removed. The
  `construct3-chef` minimum-version floor in `CONVENTIONS.md` / `audit-c3-conventions`
  stays `≥ 0.4.0` — this is a pin bump, not a floor bump. Also swept the now-stale
  `@0.8.0` pinned-version strings in the `c3-explorer` / `c3-implementer` bodies and
  the `docs/c3/toolchain-config.md` example to `@0.9.0`.
- Bumped the pinned `construct3-chef` MCP server `0.9.0` → `0.10.1`. **Tool-surface
  reconciliation run**: the static `dist/mcp/server.js` `registerTool` surface is
  unchanged (30 tools), but chef `0.10.0` (construct3-chef#89) adds the
  user-defined-ops surface registered in `dist/mcp/opsRegistry.js` (the `list-ops` +
  dynamic `op-<name>` tools above) — a `server.js`-only grep diffs empty even though
  the surface grew, so `docs/tool-surface-reconciliation.md`'s count anchor now records
  where the ops tools live and their `READ_ONLY`/`MUTATE` split. No tools renamed or
  removed. The `construct3-chef` floor in `CONVENTIONS.md` / `audit-c3-conventions`
  stays `≥ 0.4.0` — pin bump, not a floor bump. Swept the now-stale `@0.9.0`
  pinned-version strings in the `c3-explorer` / `c3-implementer` bodies and the
  `docs/c3/toolchain-config.md` example to `@0.10.1`. (#21; supersedes #18.)

## [1.3.0] - 2026-06-11

### Added
- `c3-explorer` and `c3-implementer` now document c3-domain-manager's
  **`validate-editor`** MCP tool (new at `0.4.0`). It is `READ_ONLY` — an
  editor-strictness diagnostic that re-walks `eventSheets/` fresh (never the
  cached domain index) and reports what the C3 editor would reject. Added to
  `c3-explorer`'s `tools:` allow-list + "read & report" body (next to
  `validate-boundaries`), and to `c3-implementer`'s "Domain-config maintenance"
  section as a post-mutation editor-strictness check complementing
  `validate-project`. (c3-domain-manager#13, adopts `@genvid/c3source` 1.4.0
  `validateForEditor`.)
- `c3-explorer` can now call chef's **`navigation-graph`** MCP tool (added to its
  `tools:` allow-list and "MCP Tools Available" body list). It renders the layout
  navigation graph (every `System.go-to-layout` / configured nav call in the
  extracted DSL) as a `from sheet → target layout → line` table, or a PlantUML
  diagram via `format: "plantuml"`. The tool is `READ_ONLY`, so it belongs on the
  read-only explorer; it is not part of the recipe-mutation flow, so it is not
  added to `c3-implementer`. (`navigation-graph` was CLI-only at `0.7.0`;
  construct3-chef#85 exposes it as an MCP tool at `0.8.0`.)

### Changed
- Bumped the pinned `c3-domain-manager` MCP server `0.3.0` → `0.4.0`.
  **Tool-surface reconciliation run** (`registerTool` diff, 12 → 13 tools): the
  only surface change is the added `validate-editor` tool above — no tools were
  renamed or removed. The enriched cross-domain dependency graph
  (`domain-health` / `validate-boundaries` / `context-map` now also account for
  event-variable references, not just `include` edges — c3-domain-manager#14) is
  richer output with the same one-line tool purposes, so the agent descriptions
  are unchanged. The `c3-domain-manager` minimum-version floor in
  `CONVENTIONS.md` / `audit-c3-conventions` is unaffected — this is a pin bump,
  not a floor bump. Also swept the now-stale `@0.3.0` pinned-version strings in
  the `c3-explorer` / `c3-implementer` bodies and the
  `docs/c3/toolchain-config.md` example to `@0.4.0`.
- Bumped the pinned `construct3-chef` MCP server `0.7.0` → `0.8.0`. **Tool-surface
  reconciliation run** (`registerTool` diff, 28 → 29 tools): the only surface
  change is the added `navigation-graph` tool above — no tools were renamed or
  removed. The other `0.8.0` changes are runtime/behavioral and need no agent
  edits: single-block tool responses (`txId` folded into the success block,
  errors as a single `Error:` block — construct3-chef#80), `list-event-sheets` /
  `list-layouts` pagination (#82), and `validateForEditor` editor-strictness
  validation (#86). The `construct3-chef` minimum-version floor in
  `CONVENTIONS.md` / `audit-c3-conventions` stays `≥ 0.4.0` — this is a pin bump,
  not a floor bump.
- Corrected stale pinned-version strings in the agent/doc prose that still read
  `@0.6.0` after the `0.7.0` bump: `c3-explorer` and `c3-implementer` bodies and
  the `docs/c3/toolchain-config.md` example now read `@0.8.0`.

## [1.2.0] - 2026-06-05

### Added
- `author-navigation-patterns` skill (`/genvid-c3:author-navigation-patterns`):
  helps a user author and validate a construct3-chef `navigation.targetPatterns`
  / `definitionMarkers` convention for a project that routes navigation through a
  wrapper function. Inspects the extracted DSL, proposes a one-capture-group
  regex, previews captures/skips with a bundled helper, and validates against
  `construct3-chef navigation-graph`. Declares `construct3-chef` `minVersion
  0.7.0` in its `metadata.expects` (the config surface landed there), so
  `audit-c3-conventions` reports the requirement with no audit-script change.
- `docs/c3/layout-reference.md` now documents how navigation renders in the
  extracted DSL (built-in `System.go-to-layout` forms, wrapper call sites, and
  the call-site-vs-definition-line distinction) — the platform knowledge the new
  skill links to.

### Changed
- Bumped the pinned `construct3-chef` MCP server `0.6.0` → `0.7.0` (adds the
  configurable `navigation.targetPatterns` / `definitionMarkers` convention,
  construct3-chef#43). The MCP tool surface is **unchanged** between the two
  versions (verified via `registerTool` diff), so the `c3-explorer` /
  `c3-implementer` allow-lists need no edits. The `construct3-chef`
  minimum-version floor in `CONVENTIONS.md` / `audit-c3-conventions` stays
  `≥ 0.4.0` — this is a pin bump, not a floor bump.
- `c3-explorer` now enumerates the **full read-only tool surface** of both
  pinned servers (`construct3-chef@0.7.0`, `c3-domain-manager@0.3.0`) in its
  `tools:` allow-list and body. Newly available reads: chef
  `read-event-sids`, `read-sid-registry`, `resolve-anchor`,
  `list-global-layers`, `get-state`, plus the non-mutating helpers
  `validate-project` / `generate-sids`; and c3-domain-manager
  `glossary-check`, `validate-boundaries`, `domain-health`, `context-map`.
  Because the agent's `tools:` is a hard allow-list, these reads were
  previously uncallable (issue #4).
- `c3-implementer` documents the construct3-chef template/layer mutation
  recipes added at `@0.6.0` (`extract-template`, `templatize-in-place`,
  `clone-replica-to-layouts`, `replace-instance-with-replica`,
  `remove-layer`, `generate-sids`) and the mutation-flow reads
  `read-event-sids` / `read-sid-registry` / `resolve-anchor` /
  `validate-project`. Adds a "Domain-config maintenance" section covering
  c3-domain-manager's `set-overrides` / `remove-overrides` / `regenerate`,
  flagging that domain *content* is project-specific (issue #4).

## [1.1.0] - 2026-06-04

### Added
- `docs/c3/toolchain-config.md`: new reference doc explaining how
  `construct3-chef` and `c3-domain-manager` resolve configuration from the
  workspace root (the cwd model), the `extracted/` coupling between the two
  servers, and the non-root-project limitation.
- `audit-c3-conventions` now requires `domain-config.json` at the workspace
  root. `c3-domain-manager` resolves this file from cwd with no `--config`
  arg, so consumers satisfy the check by placing it at the repo root. The
  `evaluateFile` and `evaluateConfig` audit helpers are now exported and
  covered by unit tests.
- The plugin's MCP server launch args are intentionally left as bare `server`
  (no `--project-dir` / `--config` / `--extracted`): both servers resolve
  their config from the Claude-Code-provided workspace cwd, so consumers
  configure per-repo by dropping config files at the root rather than the
  plugin hardcoding paths. Monorepo non-root-subdir support requires upstream
  env-var support in both servers (tracked separately).

### Changed
- The shipped plugin now lives in the repo's `plugin/` subfolder, separate from the
  dev workspace at the repo root. The marketplace entry uses a `git-subdir` source
  (`path: "plugin"`). Consumers are unaffected — `${CLAUDE_PLUGIN_ROOT}` still resolves
  to the installed plugin subtree.
- MCP servers are now declared in `plugin.json` (`mcpServers`) instead of a bundled
  `.mcp.json`, using the **scoped** package names `@genvid/construct3-chef@0.6.0` and
  `@genvid/c3-domain-manager@0.3.0`, pinned and launched via `npx -y … server`.

### Fixed
- `audit-c3-conventions` reachability probe now resolves servers by their scoped
  package name (`npx -y @genvid/construct3-chef --version`) instead of the bare bin
  name, which npx treated as a package name and 404'd.

## [1.0.0]

### Added
- Initial release: `c3-explorer` and `c3-implementer` agents, the
  `audit-c3-conventions` skill, the C3 platform reference (`docs/c3/`), and the
  bundled `construct3-chef` / `c3-domain-manager` MCP servers.
