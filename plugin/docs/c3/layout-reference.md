# C3 Layout Reference

> Part of the [C3 platform reference](README.md). Describes how Construct 3 layouts are structured on disk — the JSON that construct3-chef reads, mutates, and scaffolds.

## Layout Organization

Layouts define the visual screens of the project. When placing objects into a layout, verify the correct layer — layer ordering affects both rendering (visual depth) and event picking (which layer receives input events). Each layout JSON links to an event sheet:

```json
{
  "name": "SomeLayout",
  "layers": [ ... ],
  "eventSheet": "SomeLayoutEvents"
}
```

Projects typically group layouts into directories by purpose (gameplay levels, login/loading, menus, modals, template holders, etc.).

## Layer Rendering Order

Within a layout, layers render in array order -- **later layers render on top**:

```json
{
  "layers": [
    { "name": "Background" },     // renders first (bottom)
    { "name": "GameObjects" },    // renders second
    { "name": "HUD" },            // renders third
    { "name": "ModalOverlay" }    // renders last (top)
  ]
}
```

Layers support sub-layers for further nesting. Each layer has properties controlling visibility, interactivity, parallax, blend mode, and draw order. Instance `tags` are a comma-separated string (e.g., `"tags": "boss,flying"`) used in C3 conditions for filtering objects; layout summaries show them as `#tag1 #tag2`.

## Template System

A template master object is defined in one layout (often a dedicated "template holder" layout); template instances in other layouts reference that master. The `template` property on an instance controls which properties stay synchronized with the master:

```json
"template": {
  "mode": "template",
  "templateName": "default",
  "sourceTemplateName": "",
  "replicaHierarchyInSyncWithTemplate": false,
  "templatePropagateHierarchyChanges": true,
  "replicaIgnoreTemplateHierarchyChanges": false,
  "replicasUIDs": null,
  "components": [
    { "id": "plugin",            "component": [ { "key": "plugin",            "state": [ ["initially-visible", true], … ] } ] },
    { "id": "instance-variable", "component": [ { "key": "instance-variable", "state": [] } ] },
    { "id": "behavior",          "component": [] },
    { "id": "effect",            "component": [] },
    { "id": "world-instance",    "component": [ { "key": "world-instance",    "state": [ ["x", false], … ] } ] }
  ]
}
```

Three things the shorter form hides. There are **five** component ids, not four — `world-instance` is the fifth. Each `component` entry is `{ "key": …, "state": [[name, boolean], …] }`, a list of per-property sync flags, not an opaque blob. And the four sibling `template*` booleans plus `replicasUIDs` (observed as `null`, not an array) are always present.

**`templateName` and `sourceTemplateName` swap roles between the two modes** — exactly one is populated:

| | `mode` | `templateName` | `sourceTemplateName` | `replicaHierarchyInSyncWithTemplate` |
| --- | --- | --- | --- | --- |
| Master | `"template"` | `"default"` | `""` | `false` |
| Replica | `"replica"` | `""` | `"default"` | `true` |

Verified against `construct3-sample@v0.4.0` (master and replica of the same template, in different layouts).

### The `"o"` short key — two unrelated meanings, neither an override

Short-key flags named `"o"` appear in two different places in layout JSON. **Neither enables per-instance property overrides.** Verified against `construct3-sample@v0.4.0`.

**1. `sceneGraphData.flags` — `"o"` is transform-*opacity*-with-parent.** A scene-graph child carries `flags` alongside its `parent-uid`/`uid`/`children`:

```json
"flags": { "x": true, "y": true, "z": true, "w": true, "h": true,
           "d": true, "a": true, "o": false, "v": false, "sm": "normal" }
```

These map one-to-one onto the SDK's `SceneGraphHierarchyOpts` (`scripts/ts-defs/runtime/IWorldInstance.d.ts`) — `transformX`, `transformY`, `transformZ`, `transformWidth`, `transformHeight`, `transformDepth`, `transformAngle`, **`transformOpacity`**, `transformVisibility`. Each says whether that property is inherited from the parent, not whether it can be overridden. The sibling `sceneGraphData.preview` block spells the same field out in full as `transformO`, which confirms the expansion.

Two loose ends, observed but **not** explained by the sample: `sm` (seen as `"normal"`) has no `SceneGraphHierarchyOpts` counterpart, and the interface's `destroyWithParent` does not appear in the `flags` object. Do not assume a meaning for either.

**2. `template.components[].component[].state` — a template-sync flag list.** Under `"id": "world-instance"` the `state` array uses a *different, larger* short-key namespace recording which world properties a replica keeps synchronized with its template:

```
x, y, z, w, h, a, o, c, sx, sy, bm, sam, tgs,
twpx, twpy, twpz, twpw, twph, twpa, twpd, dwp, ssm, d, sz
```

Entries are `[name, boolean]` pairs, e.g. `["o", true]`. This namespace is not the `flags` namespace above and the two must not be read as the same set.

Layout summaries (`.layout.txt`) show template definitions with full hierarchy; replicas (`mode: "replica"`) skip the hierarchy. Template definitions show all child instances; replicas show only the top-level instance.

## Global Layers and Overrides

### What global layers are

A layer marked `"global": true` in one layout (the **originating layout**) is inherited by all other layouts. The originating layout defines the layer and all its instances. Consuming layouts get those instances automatically — no per-layout duplication needed.

### Shadowing: what `overriden` actually means

**`overriden` is passive.** It marks a layer that *is being* shadowed by a same-named global layer defined in another layout — not a layer that is doing the overriding. The join is **by name**: when a layout holds a layer whose name matches a global layer elsewhere, that local layer is flagged `"overriden": 1` and carries `"global": false`. Only the originating layer carries `"global": true`, with `"overriden": 0`.

```json
{
  "name": "previously local",
  "overriden": 1,
  "global": false,
  "sid": 777789560330719,
  "instances": [
    {
      "type": "Sprite2",
      "uid": 17,
      "sid": 939527566805562,
      "behaviors": { "MyCustomBehavior": { "properties": { "test-property": 2 } },
                     "Persist": { "properties": {} } },
      "effects": { "Burn": { "isEnabled": true, "parameters": {} } }
    }
  ]
}
```

**A shadowed layer keeps its content.** It is a full, independent layer object — its own `sid`, its own property set, and its own instances, which may be entirely different objects from the global layer's. That content is **not** deleted; it stays on disk and is ignored at runtime in favour of the global layer's. Reverting the layer to non-global brings its own content back.

This makes `overriden` primarily a **recovery and name-collision** mechanism rather than a per-layout customisation feature. It is what happens when a local layer's name collides with a global one, and it preserves the local content so the collision stays reversible.

**`overriden` is an integer, not a boolean, and it is present on every layer.** Every layer and sub-layer object in the sample carries the key — value `0` for the ordinary case, `1` only when the layer is shadowed. Its absence is not the "not shadowed" encoding; `0` is. (Note the spelling: one `d`, `overriden`, not `overridden`.)

Two consequences for tooling that walks layout JSON. A shadowed layer with a non-empty `instances` array is **normal**, not corruption — do not "repair" it by emptying it, and do not count its instances as rendering. And because the join is by name, renaming either layer breaks the relationship.

Both forms occur in `construct3-sample@v0.4.0`: one shadowed layer with empty `instances`, and one — the example above — retaining a fully populated instance. The empty case is incidental, not a rule.

### Adding an effect to a global layer instance

Effects on a global layer follow the same declare-then-apply rules as anywhere else — see [Effects](#effects) for the shapes. The one global-layer-specific rule is **where** the applied data goes: author it on the instance in the **originating** layout. Applying it to a shadowed copy of the layer has no effect — that layer's content is ignored at runtime (see above), so the edit is silently inert rather than rejected.

All consuming layouts that inherit the global layer then pick up the effect automatically, with no per-layout changes.

### Initialization trap

Global layers persist their visibility and interactivity state across layout transitions. Every layout that uses a global layer must explicitly reset it in `on-start-of-layout` — typically `set-layer-visible(invisible)` and/or `set-layer-interactive(false)` — then open it only when needed. Forgetting the reset causes the layer to appear with stale data when navigating back to a layout.

### Global-layer tooling

The `extracted/global-layers.txt` report (6th generator) lists every global layer with its originating (source) layout, the layouts that shadow it, and its instance count — counted **deep**, summing the source layer's own `instances` and those of its sublayers at any depth. The `list-global-layers` MCP tool returns the same report on demand. A layer is treated as the source where `"global": true` appears with `"overriden": 0`; shadowing layouts carry the same-named layer with `"overriden": 1` and `"global": false`, and that layer **may hold instances of its own**, which are ignored at runtime and must not be counted. Format:

```
global layer: source="Second Layout", overridingLayouts=[Main Layout], instanceCount=2
```

(Closed the former tooling gap, issue [#20](https://github.com/genvid-holdings/construct3-chef/issues/20).)

## Effects

An effect reaches a project through **two** separate pieces of data: a **declaration** naming the effect on a host, and the **applied data** that actually enables it. Both are required — a declaration alone is a broken project, not a disabled effect.

### Declaring an effect

The effect addon is listed once in `project.c3proj`'s `usedAddons` array:

```json
{ "type": "effect", "id": "MyCompany_MyEffect", "name": "My custom effect", "author": "Scirra", "bundled": true, "version": "1.0.0.0" }
```

`bundled` is `true` for an effect shipped as a `.c3addon` inside the project (see [addon-package-reference.md](addon-package-reference.md)) and `false` for one installed into the editor.

A host then **declares** the effect in its `effectTypes[]` array. Object types (`objectTypes/*.json`), families (`families/*.json`), layers, and layouts all carry one:

```json
"effectTypes": [
  { "effectId": "burn", "name": "Burn" },
  { "effectId": "MyCompany_MyEffect", "name": "MyCustomEffect" }
]
```

`effectId` is the **addon id** — the stable join key back to the `usedAddons` entry. `name` is the effect **instance name**, and it is **renameable**: above, addon `MyCompany_MyEffect` is instanced as `MyCustomEffect`.

### Applying an effect

`effectTypes[]` only *declares*. The applied effect needs per-instance data, whose shape depends on the host.

**Object instances** carry an `effects` map, **keyed by the effect's `name`** — not its `effectId`:

```json
"effects": {
  "Burn": { "isEnabled": true, "parameters": {} },
  "MyCustomEffect": { "isEnabled": true, "parameters": { "color": [1, 0, 0, 1] } }
}
```

**Layers and layouts** instead carry the applied data **inline on the `effectTypes[]` entry**, under `instance`:

```json
"effectTypes": [
  {
    "effectId": "MyCompany_MyEffect",
    "name": "MyCustomEffect",
    "instance": { "isEnabled": false, "parameters": { "color": [0.5019607843137255, 0, 0, 1] } }
  }
]
```

So the join to follow is `effectId` → renameable `name` → the `effects` map key. **Keying the map by `effectId` yields an effect that is declared but never applied** — the failure below. This mirrors the behavior chain (`behaviorId` → renameable `name` → `behaviorType`) in [event-sheet-architecture.md → Behavior attachment and ACE targeting](event-sheet-architecture.md#behavior-attachment-and-ace-targeting); an instance's `behaviors` and `effects` are both name-keyed maps and sit side by side.

### A project must apply an effect completely

A host that declares an effect in `effectTypes[]` without its applied data is **half-applied**, and can **null-pointer the whole project when the C3 editor loads it**.

Nothing catches this before the editor does:

- the effect addon itself is a valid, loadable package;
- the project JSON parses cleanly;
- it passes `validateForEditor`, which inspects **event-sheet structure**, not effect application.

**Author effect application in the editor, not by hand.** A real editor save writes the complete, consistent set — the `usedAddons` entry, the declaration, and the applied data together.

> Surfaced while building canonical fixtures for `construct3-chef` ([#130](https://github.com/GenvidTechnologies/construct3-chef/issues/130), [#132](https://github.com/GenvidTechnologies/construct3-chef/issues/132)): a fixture referenced a custom effect in `effectTypes[]` without the rest of the application data, and importing the project null-pointered the editor — while the addon was perfectly valid ([#125](https://github.com/GenvidTechnologies/construct3-chef/issues/125)).

## Localization in Layouts

Text instances commonly use a `[[key]]` syntax for localized strings, resolved at runtime by a localization plugin (e.g. I18N) from a loc file:

```json
{
  "type": "Text",
  "instanceVariables": {
    "text": "[[some.loc.key]]"
  }
}
```

**`instanceVariables` is two different shapes on two different hosts.** On an *instance* it is an **object** (a map), as above. On the **declaring** object type or family it is an **array** of descriptors:

```json
"instanceVariables": [
  { "name": "BossArenaEdge", "type": "string", "desc": "", "show": true,
    "sid": 274269985570573 }
]
```

Confirmed on `families/LevelMaps.json` in `construct3-sample@v0.4.0`. Do not carry the array form onto an instance or the map form onto a declaration.

> **Key confirmed; populated shape unverified.** Every instance in `construct3-sample` (`v0.1.0`–`v0.4.0`) carries `"instanceVariables": {}`, which settles that the key is valid on an instance and that its container is an object — and **nothing** about the populated form. The `{ "text": … }` example above shows the *convention* this reference has always documented, not a shape observed in an editor-validated save. The declaration side is a different shape and is confirmed; do not read it as evidence for the instance side.

## Sublayers

**The on-disk key is `subLayers` (camelCase)**, on every layer and sub-layer object that has one. Verified against `construct3-sample@v0.4.0`.

C3's own runtime scripting API is camelCase too, and exposes sub-layers as **methods**, not a property — `subLayers()` (direct children) and `allSubLayers()` (recursive), both on `ILayer` in `scripts/ts-defs/runtime/ILayer.d.ts`, each returning a `Generator<IAnyProjectLayer>`:

```typescript
for (const sub of layer.subLayers()) { /* direct children */ }
for (const sub of layer.allSubLayers()) { /* recursive */ }
```

No lowercase `sublayers` form exists anywhere in C3 — not in the project JSON and not in the SDK type definitions. If a tool's own TypeScript model of the on-disk JSON declares a lowercase `sublayers` field, that is that tool's interface, not C3's, and reading it against real project JSON returns `undefined` for that reason alone.

In the layout JSON, an instance's sublayer is determined by which `subLayers[].instances` array the instance object appears in — not by any explicit property on the instance itself.

## Instance Naming Doesn't Imply Scope

An instance whose name ends in `*Layout` reads as "lives in that one layout," but the name only records the *original* host — the same instance can be cloned into any number of layouts. The layout files that actually contain the instance are the ground truth; the name suffix is not a reliable host list. When a `LayoutName`-gated branch in an event sheet must cover every layout that hosts an instance, search the extracted layout summaries for the instance name rather than trusting the suffix — a missing branch is a common cause of "this UI never refreshes on layout X" bugs.

## Adding a New Layout

Creating a new layout requires several coordinated steps:

1. **Create the layout JSON** in `layouts/`. Layouts contain layer definitions, instance placements with unique UIDs and SIDs, and scene-graph parent-child relationships. The C3 editor is strongly recommended for this step — manual JSON editing is fragile due to UID/SID uniqueness requirements. (construct3-chef's `scaffold-layout` clones an existing layout with freshly remapped UIDs/SIDs to make this safe.)

2. **Create the event sheet** in `eventSheets/` — the JSON file that contains the layout's logic. Link it from the layout JSON via the `"eventSheet"` field (just the name, not the path).

3. **Sync `project.c3proj`** to register the new files (`construct3-chef sync-project`). Never edit `project.c3proj` by hand.

4. **Regenerate extracted files** (`construct3-chef generate`).

**Key constraints:**

- **UIDs** must be unique across the entire project (sequential integers). Check the max UID before assigning new ones.
- **SIDs** are large random integers, unique per object, used for C3 internal references.
- **Templates are layout-bound** — a template instance cannot be created from a layout other than where the master is defined. For cross-layout reuse, place the template master in a shared "components" layout.

## Navigation Between Layouts

C3 layouts navigate using the System `GoToLayout` action. Two common patterns:

- **Full-screen navigation** (separate layouts): the previous layout name is stored in a variable before navigating, and the back button calls `GoToLayout` with the stored name. `construct3-chef navigation-graph` extracts these `GoToLayout` calls into a navigation graph.
- **Embedded layer modals**: a popup lives on its own layer within the current layout and is toggled with `set-layer-visible` / `set-layer-interactive` rather than a layout change.

construct3-chef's `navigation-graph` subcommand surfaces the `GoToLayout` edges between event sheets, which is the tool-visible view of a project's navigation structure.

### How navigation renders in the extracted DSL

`navigation-graph` finds navigation by scanning the **extracted DSL** text line by
line with regexes. What it matches depends on *how the navigation call renders*, so
authoring a detection convention requires knowing the rendered forms:

- **Built-in System action** (auto-detected, no config needed). The two built-in
  actions render as:

  ```
  System.go-to-layout(layout=<LayoutName>)          # by reference — unquoted layout name
  System.go-to-layout-by-name(layout="<expr>")      # by name — quoted string/expression
  ```

  These are matched out of the box; a project using only these needs no `navigation`
  config.

- **Wrapper function** (needs a detection pattern). A project that routes navigation
  through its own function (e.g. `GoToLayout("Title")`) renders the **call site** as:

  ```
  do: call <Fn>("<LayoutName>", ...)                # event-sheet action
  <Fn>("<LayoutName>", ...)                          # bare call inside a TypeScript script
  ```

  Note event-sheet string arguments render **double-quoted** in the DSL, which is what
  a `…("([^"]+)"…` capture keys off. The wrapper's own **definition** line —
  `function <Fn>(...)` — also contains the function name and can false-match a naive
  pattern; it must be excluded (see below).

**Call site vs. definition line.** The single most common authoring pitfall: a pattern
that matches `GoToLayout("…")` will also match the wrapper's `function GoToLayout(target = "Menu")`
definition, injecting a phantom edge. The convention separates the two with a
*definition marker* — a substring (e.g. `"function GoToLayout"`) that marks a line as a
definition to skip.

**Configuring a wrapper convention.** Point the graph at the wrapper via the
`navigation` block in `construct3-chef.config.json`:

```jsonc
{
  "navigation": {
    "targetPatterns": ["GoToLayout\\(\"([^\"]+)\""],  // exactly one capture group = target layout name
    "definitionMarkers": ["function GoToLayout"]        // substring → line is a definition, skipped
  }
}
```

Each `targetPatterns` entry must have **exactly one capture group**, and that group is
the resolved target layout name. `definitionMarkers` are matched as plain substrings.
The field-level schema and matching semantics are owned by construct3-chef — see
`construct3-chef://docs` (`cli.md`, the **Configuration file** and **navigation-graph**
sections). The `/gvt-construct3:author-navigation-patterns` skill helps inspect a project's
DSL and author/validate these entries.
