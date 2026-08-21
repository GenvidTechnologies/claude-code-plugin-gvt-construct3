---
type: reference
title: Event Sheet Architecture
description: Event sheet JSON structure (events/children, blocks, the five event types and five action shapes), include composition, layout event sheets vs included event sheets, trigger installation and execution order, the expression-vs-enum parameter rule, and how behaviors attach and event-sheet ACEs target a behavior instance.
tags: [event-sheets, json-shape, behaviors, aces, includes]
status: stable
sources:
  - id: construct3-sample
    resource: https://github.com/GenvidTechnologies/construct3-sample/tree/v0.4.0
    title: construct3-sample@v0.4.0 — editor-validated C3 project; the verification ground truth for this doc's JSON shapes (#63)
    last_modified: 2026-08-04
---

# C3 Event Sheet Architecture

> Part of the [C3 platform reference](index.md). Describes how Construct 3 event sheets are structured on disk — the JSON that construct3-chef reads and mutates.

> **Verification provenance.** The on-disk JSON shapes in this doc were swept against the editor-validated [`construct3-sample`](https://github.com/GenvidTechnologies/construct3-sample) (`construct3-sample@v0.4.0`, cross-checked against `v0.1.0`–`v0.3.0`) in [#63](https://github.com/GenvidTechnologies/claude-code-plugin-gvt-construct3/issues/63). Sections carrying an *unverified* callout are claims that sweep could not settle; everything else was confirmed against the sample or corrected to match it. Facts added after this sweep must be verified the same way.

## Composition via Includes

> **Unverified — no example exists in the sample.** `construct3-sample` contains no `include` event and no `includeSheet` key at any tag (`v0.1.0`–`v0.4.0`), so the shape below has not been checked against an editor-validated project. It is the shape this reference has always documented; confirm against a real editor save before authoring it by hand.

Event sheets build complex behavior through composition. A sheet can include other sheets:

```json
{
  "eventType": "include",
  "includeSheet": "SharedEvents"
}
```

This creates a hierarchical structure where high-level orchestrator sheets pull in feature-specific sheets, and sheets under `eventSheets/` can be grouped into subdirectories.

**Include removal safety**: Removing an include silently breaks **all trigger-based events** in the removed sheet and its transitive includes. This includes `on-instance-signal`, `on-created`, `on-destroyed`, `on-timer`, `on-tweens-finished`, `on-start-of-layout`, `on-any-touch-end`, and any other trigger. Triggers only fire if their event sheet is in the current layout's include chain — there is no runtime error when they stop firing.

Before removing an include, verify the removed sheet (and all its transitive includes) has no triggers needed by the current layout. If a function depends on trigger handlers (e.g., an async network call that needs an `on-instance-signal` response handler), co-locate the trigger handler in the same group as the function and document the dependency in the function's description.

**What a `LayoutName ==` guard indicates**: A `LayoutName == "X"` condition inside an event sheet is there because that sheet is reachable from the include chain of layouts it is not meant to run on — the guard suppresses the block at runtime rather than keeping the sheet out of the chain. In TypeScript script actions the equivalent test is `runtime.layout.name === "X"`.

## Layout Event Sheets vs Included Event Sheets

Every layout has one **layout event sheet** — the sheet named in the layout's `"eventSheet"` field. All other sheets reachable from it via `include` are **included event sheets**. The distinction decides which blocks run for a given layout.

Nothing requires the mapping to be one-to-one in the other direction: several layouts can name the *same* sheet as their layout event sheet. When they do, every unguarded block in it — `on-start-of-layout` included — runs on all of them. The same holds one level down: an included sheet's `on-start-of-layout` and `on-end-of-layout` fire for **every** layout whose include chain reaches that sheet, not only for the layout that motivated the include. A sheet reached by exactly one layout is the only case in which a block can assume which layout it is running on without testing.

Two things follow for lifecycle blocks in a shared sheet:

- **Whatever its `on-start-of-layout` initializes is initialized on every including layout**, interleaved with that layout's other on-start blocks in the order described below.
- **Static event variables survive the layout change.** A static event variable (`isStatic: true`) retains its value across layout transitions, so an `on-start-of-layout` that unconditionally resets one overwrites whatever the previous layout left in it.

## Trigger Installation and Execution Order

The include chain decides which **triggers** are installed for a layout. It does not decide what can be *called*.

- **Functions and ACE calls resolve project-wide.** A function defined in any event sheet is callable from any other sheet, whether or not the defining sheet is in the current layout's include chain. Including a sheet does not make its functions reachable — they already were.
- **Trigger blocks are installed by inclusion.** A trigger block fires only when its host sheet is in the current layout's include chain — the same mechanism as the include-removal hazard above. A trigger that is simply not installed produces no error; it silently never fires.
- **So a function is safe to call from a layout that does not include its sheet only if the function depends on no trigger defined in that sheet.** A self-contained function is always safe. One that dispatches async work and relies on a response handler living in the same sheet is not: the work is dispatched, and the handler that would complete it never runs. The guide walks this failure mode through a concrete async fetch — see [Function/ACE Calls Hoist; Handler Blocks Don't](construct3-guide.md#functionace-calls-hoist-handler-blocks-dont).
- **Triggers fire in include order.** For a given trigger type, the matching block in the first included sheet fires before the same trigger type in the layout event sheet.
- **Some actions are dispatched rather than completed.** A dispatched (async/deferred) action returns before its work finishes. `System.wait-for-previous-actions()` suspends the current block until previously dispatched work in that block settles.
- **Actions within a block run in listed order.** A variable that a function call reads must be set earlier in the same action list. Symptom of getting this wrong: a layout shows stale state on first load and corrects itself as soon as something re-triggers the display (a navigation, a tab switch) — check that every variable is assigned before the display-update action in `on-start-of-layout`.

`wait-for-previous-actions` suspends the **block**, not the tick: other `on-start-of-layout` blocks queued for the same tick run while it waits, and the waiting block resumes against whatever shared state they left behind. Adding a wait to a block in a *shared* sheet therefore changes on-start interleaving for every layout that includes that sheet, not only for the layout being worked on. The general model — script actions racing within a block, what `wait-for-previous-actions` does and does not synchronize, and the `trigger-once-while-true` correction for contested globals — is owned by [typescript-integration.md, Block Concurrency Model](typescript-integration.md#block-concurrency-model).

## Event Sheet JSON Structure

Each event sheet is a JSON file with this shape:

```json
{
  "name": "EventSheetName",
  "events": [ ... ],
  "sid": 923318843836904
}
```

The `events` array contains five types of entries:

| Type | Purpose |
|------|---------|
| `comment` | Documentation annotations |
| `include` | Pulls in another event sheet |
| `variable` | Declares a local variable (number, string, boolean) |
| `group` | Organizes events into collapsible sections |
| `block` | Conditions + actions -- the core logic unit |

**`variable` and `group` entries** carry more fields than their one-line purpose suggests. Verified against `construct3-sample@v0.4.0`:

```json
{ "eventType": "variable", "name": "score", "type": "number",
  "initialValue": "0", "comment": "", "isStatic": false,
  "isConstant": false, "sid": 100000000000020 }

{ "eventType": "group", "disabled": false, "title": "GameLoop",
  "description": "", "isActiveOnStart": true,
  "children": [ /* … */ ], "sid": 100000000000022 }
```

Two traps here. A group's label key is **`title`**, not `name`. And `initialValue` is a **string** even for a `"type": "number"` variable — `"0"`, not `0`.

**Block structure:**

```json
{
  "eventType": "block",
  "conditions": [
    { "id": "on-clicked", "objectClass": "NavButton", "sid": 718113556931833 },
    { "id": "compare-eventvar", "objectClass": "System", "sid": 450713348459828,
      "parameters": { "variable": "temp", "comparison": 0, "value": "0" } }
  ],
  "actions": [ /* see Action Types below */ ],
  "sid": 573288374737163
}
```

**Every block, condition and action carries a mandatory `sid`** — a 15-digit integer, per the [SID range constraint](construct3-guide.md). The examples in this doc show them; omitting one produces JSON the editor will not round-trip cleanly.

**A condition with no parameters omits `parameters` entirely** rather than emitting `{}` — see `on-clicked` above. The editor drops the empty object on re-serialization, so writing `"parameters": {}` produces spurious diff churn.

Note the field name: nested events live under `children`, not `events`. Only the top-level event sheet object uses `events`. Hand-rolled JSON walkers that recurse on `events` will silently visit nothing past the root; recurse on `children`. (In the sample, `children` is demonstrated on a `group`; a `block` there carries none, so the key is optional and appears only where the event actually nests.)

**Looking up SIDs in source JSON.** Don't hand-parse event-sheet JSON to recover a node's SID — construct3-chef's read surface exposes them directly, and its docs own which tool to reach for. See `construct3-chef://docs`.

**Action types** -- actions in the `actions` array appear in five shapes:

**Standard action** (most common) -- C3 built-in or plugin action:

```json
{ "id": "set-text", "objectClass": "ScoreText", "sid": 503974656149130,
  "parameters": { "text": "0" } }
```

(The object and property names above are illustrative; the **shape** is verified. Note the `sid` is a full 15-digit integer — a short placeholder like `123` would violate the [SID range constraint](construct3-guide.md) and is not something the editor ever writes.)

An action targeting a *behavior* rather than the object itself carries an extra `behaviorType` key alongside `objectClass` — see [Behavior attachment and ACE targeting](#behavior-attachment-and-ace-targeting) below.

### Expression Parameters vs Enum Parameters

Action and condition `parameters` values are **C3 expressions**, not plain strings. This distinction matters for string literals:

- **Expression parameters** (e.g., `animation`, `layer`, `text`, `path`, `first-value`, `second-value`) — string literal values must be wrapped in escaped quotes: `"\"pressed\""`. A bare `"pressed"` is parsed as a variable name, producing "Unknown expression 'pressed'" errors. Numeric literals and variable references are bare: `"0"`, `"currentLevelIndex"`
- **Enum parameters** — C3 enums, not expressions. Two flavors:
  - **Keyword enums** (e.g., `visibility`, `from`, `type`) — bare keyword values: `"invisible"`, `"beginning"`, `"start"`.
  - **Numeric / combo-index enums** (e.g., `comparison`) — a bare *number* that indexes into a fixed combo, **not** a keyword: `"comparison": 4`. See [The comparison enum](#the-comparison-enum-compare-aces) below for the mapping.

```json
// ✓ Correct — string expression with escaped quotes, enum bare
{ "id": "set-animation", "parameters": { "animation": "\"pressed\"", "from": "beginning" } }
{ "id": "is-on-layer", "parameters": { "layer": "\"HUD Base\"" } }

// ✗ Wrong — bare string in expression param causes C3 errors
{ "id": "set-animation", "parameters": { "animation": "pressed" } }
{ "id": "is-on-layer", "parameters": { "layer": "BattleLayoutLayer Base" } }
```

When unsure whether a parameter is an expression or enum, check an existing eventSheet that uses the same action/condition.

#### The comparison enum (compare ACEs)

System **Compare two values** (`compare-two-values`) and the other compare ACEs
(Compare instance variable, Compare variable, Sprite: Compare X, …) all share one
**numeric `comparison` enum** — a combo *index*, stored as a bare number in both
the raw event-sheet JSON (`"comparison": 4`) and the extracted DSL
(`System.compare-two-values(first-value=X.Count, comparison=4, second-value=1)`).
Nothing in the JSON or DSL spells out the operator, so the number must be decoded:

| `comparison` | Operator | Meaning |
|---|---|---|
| `0` | `=` | Equal to |
| `1` | `≠` | Not equal to |
| `2` | `<` | Less than |
| `3` | `≤` | Less than or equal to |
| `4` | `>` | Greater than |
| `5` | `≥` | Greater than or equal to |

This is the standard order of C3's "Comparison" combo and is reused wherever a
compare ACE exposes a `comparison` parameter. Misreading it is a real hazard: a
guard like `X.Count comparison=4 second-value=1` means `X.Count > 1` (**not** `≥`
or `==`), so it skips the block whenever the count is exactly `1`.

> **Unverified — no example exists in the sample.** Of the five action shapes, only the **standard action** above (and its `behaviorType` variant) is confirmed against `construct3-sample`. The four that follow — script action, function call, custom action, and comment action — have **no instance at any tag** (`v0.1.0`–`v0.4.0`): the sample contains no `"type": "script"` action, no `callFunction`, no `customAction`, and no `function-block` or `custom-ace-block` for them to target. Their shapes are the ones this reference has always documented; confirm against a real editor save before authoring them by hand.

**Script action** -- embedded TypeScript:

```json
{ "type": "script", "language": "typescript", "script": ["const x = 1;", "console.log(x);"] }
```

**Function call action** -- calls a `function-block` defined in an event sheet:

```json
{ "callFunction": "playSFX", "parameters": ["\"menuNavClick\""] }
```

**Custom action** -- calls a `custom-ace-block` on a specific object class:

```json
{ "customAction": "Initialize", "objectClass": "CardScroller", "parameters": ["1", "\"heroes\""] }
```

When the custom action is **defined on a family** but called on one of its **member instances** (`InstanceType.FamilyAction()`), the action JSON also needs `customActionObjectClass` -- the family that defines the `custom-ace-block` -- while `objectClass` stays the member instance the action runs on:

```json
{ "customAction": "Refresh", "objectClass": "Widget", "customActionObjectClass": "WidgetFamily", "parameters": [] }
```

`customActionObjectClass` is **required** when calling a family-defined custom action on a member, and omitted when the ACE is defined directly on the object type. **Missing it fails silently at runtime:** C3 imports the project fine and the DSL renders byte-identically (renderers that format from `objectClass`/`customAction`/`parameters` never read `customActionObjectClass`), so the defect escapes editor import, visual review, and DSL diffs -- the action simply no-ops. Editor-import success does **not** mean the action resolves.

### Behavior attachment and ACE targeting

**A host (object type or family) carries a behavior via `behaviorTypes[]`** -- the same shape in both `objectTypes/*.json` and `families/*.json`:

```json
"behaviorTypes": [
  { "behaviorId": "MyCompany_MyBehavior", "name": "MyCustomBehavior", "sid": 246339555325721 },
  { "behaviorId": "Timer", "name": "Timer", "sid": 941140762763444 }
]
```

`behaviorId` is the **addon id** (matches the behavior's `addon.json` `"id"`) -- the stable join key from a project to a behavior addon. `name` is the behavior **instance name**, and it is **renameable** (above, `MyCompany_MyBehavior` is instanced as `MyCustomBehavior`). A single host may carry **two instances of the same behavior** -- two entries, same `behaviorId`, different `name`. `sid` is the usual stable node id.

**An event-sheet condition/action targets a behavior instance via `behaviorType`** -- the **instance name**, not the addon id:

```json
{ "id": "stop", "objectClass": "Sprite2", "behaviorType": "MyCustomBehavior", "sid": 444777231675422 }
```

**Family-member call subtlety (the non-obvious one):** when a behavior is attached to a *family* and the ACE is called on a *family member*, the call's `objectClass` is the **member's** name, not the family's -- while the behavior lives in the *family's* `behaviorTypes[]`. For example, `TextFamily` (members `Text`, `Text2`) carries `Timer`; an action `{ "id": "stop-timer", "objectClass": "Text", "behaviorType": "Timer" }` is a call on member `Text` of a behavior attached to `TextFamily`. Any resolver that maps a behavior call back to its host must expand family members -> family. This parallels the `customActionObjectClass` family case above, though here there is no separate "objectClass = family" field -- the host relationship is implicit via the family's `behaviorTypes[]`.

Third-party behaviors bundle a `.c3addon` under `addons/behavior/` (when `project.c3proj` `bundleAddons: true`); built-ins (Timer, Persist, ...) are `bundled: false` with no package, and `usedAddons` entries carry `type: "behavior"` -- see [addon-package-reference.md](addon-package-reference.md) for the addon package's internal layout.

**Comment action** -- inline documentation inside a block's actions array:

```json
{ "type": "comment", "text": "Setup player state" }
```
