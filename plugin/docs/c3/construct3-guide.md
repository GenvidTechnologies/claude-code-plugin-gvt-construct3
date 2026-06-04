# Construct 3 Guide

Comprehensive reference for Construct 3 platform behavior: event sheets, layouts, runtime scoping, and TypeScript integration. This is vendor-neutral reference material for any Construct 3 project. Sibling deep-dive documents live alongside this file in `docs/c3/`. For tooling and recipe authoring (the construct3-chef toolchain), see `construct3-chef://docs`.

## Table of Contents

- [1. Project Setup](#1-project-setup)
- [2. TypeScript Integration](#2-typescript-integration)
- [3. Event Sheet Architecture](#3-event-sheet-architecture)
- [4. Event Types & Actions](#4-event-types--actions)
  - [Event Types That Contain Scripts](#event-types-that-contain-scripts)
  - [Script Action JSON: `language` Field Required](#script-action-json-language-field-required)
  - [Type Safety Caveat](#type-safety-caveat)
  - [Script Action Typing](#script-action-typing)
- [5. C3 Runtime Behavior](#5-c3-runtime-behavior)
  - [Variable and Function Accessibility](#variable-and-function-accessibility)
  - [Variable Preference Hierarchy](#variable-preference-hierarchy)
  - [Boolean Event Variable Conditions](#boolean-event-variable-conditions)
  - [Boolean Instance Variable Conditions](#boolean-instance-variable-conditions)
  - [else Chaining](#else-chaining)
  - [OR Condition Semantics](#or-condition-semantics)
  - [Same-Tick Event Processing Order and Touch Passthrough](#same-tick-event-processing-order-and-touch-passthrough)
  - [Touch Event Timing and Animation Guards](#touch-event-timing-and-animation-guards)
  - [Scope Type Caveat: Parent Actions vs Child Variables](#scope-type-caveat-parent-actions-vs-child-variables)
  - [`pick-children` Scoping vs Gating](#pick-children-scoping-vs-gating)
  - [Unpicked Custom Actions Broadcast to All Instances](#unpicked-custom-actions-broadcast-to-all-instances)
- [6. Layout Architecture](#6-layout-architecture)
- [7. C3 Conventions](#7-c3-conventions)
  - [Event Sheets](#event-sheets)
  - [Instance Variables for Cross-Block State](#instance-variables-for-cross-block-state)
  - [Token-Based String Iteration](#token-based-string-iteration)
  - [Addon Plugins](#addon-plugins)
  - [Animation Name Is Unreliable as an Identity](#animation-name-is-unreliable-as-an-identity)
  - [Common C3 Editor Errors](#common-c3-editor-errors)
- [Related Documentation](#related-documentation)

---

## 1. Project Setup

### project.c3proj

All files under the C3-tracked directories (`scripts/`, `files/`, `objectTypes/`, `sounds/`, `music/`, `fonts/`, `icons/`, `layouts/`, `families/`, `timelines/`, `flowcharts/`, and `eventSheets/`) must be registered in `project.c3proj`. Omitting a script file means C3 will not compile it.

**Never edit `project.c3proj` by hand.** Run your project's c3proj sync command after adding or removing files (construct3-chef provides `sync-project`) — it handles SID generation, MIME types, and folder structure automatically. A dry-run validate command checks for drift without modifying.

Script entries require unique 15-digit `sid` values. The sync tool generates these automatically and preserves existing SIDs for unchanged files.

**SID range constraint — never hand-pick SIDs.** Every `sid` in any C3 JSON (project, layout, eventSheet, sprite, instance, instanceFolderItem, scene-graphs entry) **must fit in `Number.MAX_SAFE_INTEGER` (2^53 − 1 ≈ 9.007 × 10¹⁵)**. SIDs above that lose trailing digits when JS parses them — the file value and in-memory value diverge, and C3 refuses to open the layout with `Error: invalid SID`. Existing project SIDs are 15-digit integers in `[1e14, 1e15)`. Use the **SID generator provided by construct3-chef (`generateUniqueSid()` from `c3/sidUtils.js`)** rather than picking numeric SIDs by hand. The utility:

- Returns values in `[1e14, 1e15)` — guaranteed safe-int.
- Reads a project-wide SID registry (init via `initSidContext(path)`) so collisions are deduped project-wide.
- Is already used internally by the eventSheet, instVar, and layout mutators. Manual scaffolding paths may not auto-plug into it — call it explicitly.

The same SID often appears in multiple places for one instance: the instance's own `sid`, its `instanceFolderItem.sid`, and (for templates) the layout's `scene-graphs-folder-root.items` array. Replace all of them.

**SID = 0 sentinel**: C3 accepts `0` (or any duplicate) as a valid SID and overwrites it with a fresh unique value on next project save. Tooling that generates C3 JSON (eventSheets, layouts) should use `"sid": 0` to mark generated elements — this avoids collision risks and clearly distinguishes tooling output from C3 editor output.

**Re-serialization and default value injection**: When the C3 editor opens a project, it re-serializes all JSON files. Most changes are formatting-only (whitespace, empty `parameters: {}` removal, string booleans → actual booleans), but re-serialization can **inject default values** for fields C3 doesn't recognize. Example: an `interactive` property set to `false` was converted to `true` because C3 replaced the value with its default. This is not a display bug — it silently changes game behavior. After opening a project in C3, check `git diff` on JSON files for unexpected value changes before committing.

**Case-only renames on Windows**: When C3 renames an object type with only a casing change (e.g., `PlantRanged` → `plantRanged`), it updates `project.c3proj` but NTFS preserves the old filename on disk (case-insensitive but case-preserving). In these cases, `project.c3proj` is canonical — the disk filename is stale. Fix with `git mv -f OldName.json NewName.json` (the `-f` flag handles case-only renames on case-insensitive filesystems). Your project's c3proj validate command detects these mismatches.

---

## 2. TypeScript Integration

See [./typescript-integration.md](./typescript-integration.md) for facade pattern, runtime access, async model, signals, variable scoping, and JSON iteration.

---

## 3. Event Sheet Architecture

See [./event-sheet-architecture.md](./event-sheet-architecture.md) for include composition, layout vs included sheets, per-layout pattern, JSON schema, and hierarchy.

---

## 4. Event Types & Actions

### Event Types That Contain Scripts

**`block`** — conditions + actions, with optional nested `children`. The most common event type; fires when all conditions are true.

**`function-block`** — named function with `functionParameters`, conditions, actions, children. `functionCopyPicked` controls instance picking:
- When `false` (default), the function starts with all instances picked (like a normal block)
- When `true`, it inherits the caller's picked instances, operating on a subset

This is frequently used and affects runtime behavior significantly — verify which mode a function uses before calling it.

**`custom-ace-block`** — same structure as `function-block`, plus `aceType`, `aceName`, `objectClass`. Custom actions can be called from TypeScript via:

```typescript
instance.callCustomAction("actionName", ...args)
```

**Parameter type caveat**: `callCustomAction` accepts `CallFunctionParameter` (`string | number`), not `boolean`. C3 declarative JSON allows `false`/`true` in parameters (evaluated at runtime), but TypeScript script blocks must use `0`/`1` instead.

**`group`** — container with `children` (no actions of its own, but children can have scripts). Groups increment the event counter even though they have no actions.

### Script Action JSON: `language` Field Required

When hand-writing `"type": "script"` actions in event sheet JSON, the `"language": "typescript"` field is **required**. Without it, the DSL generator outputs `[unknown action]` and C3 may not execute the script at runtime:

```json
{
  "type": "script",
  "language": "typescript",
  "script": ["// your code here"],
  "sid": 123456789
}
```

The `language` field has no default — omitting it produces a broken action that passes JSON validation but silently fails at the DSL and runtime levels.

### Type Safety Caveat

Event sheet scripts frequently use `as Type` casts because C3 instance variables and JSON data are untyped strings. These casts bypass TypeScript's type narrowing, so type changes (like tightening `string` to a union) **will not** surface as compile errors in event sheets — they compile but may be semantically wrong at runtime. Always review event sheet scripts manually when tightening types.

### Script Action Typing

C3 script actions are typechecked via the extracted `.ts` files. Common typing issues:

**`getJsonDataCopy()` returns `unknown`** — When accessing JSON object data in script actions, the result is untyped. Arrow function parameters operating on this data need explicit `any` annotation:

```typescript
// BAD — fails typecheck: "Parameter 'h' implicitly has an 'any' type"
const data = runtime.objects.MyData.getFirstInstance()?.getJsonDataCopy();
const items = data?.items ?? [];
items.some(h => h.name === savedName);

// GOOD — explicit any
items.some((h: any) => h.name === savedName);
```

**`runtime.globalVars` is typed** — Global variables are available as `runtime.globalVars.variableName` with string/number types inferred from C3's variable definitions.

**`localVars` type generation** — Local variables in C3 event blocks are available in script actions as `localVars.variableName`. Types are generated from the event sheet definitions by the extraction toolchain.

---

## 5. C3 Runtime Behavior

### Variable and Function Accessibility

> **Key rule: Functions are global, triggers are local.** When analyzing whether an event sheet needs to be included, the question is never "can this function be called?" (always yes). The question is "does the excluded sheet have triggers that set up state this function needs?" Including a sheet solely to make its functions callable is unnecessary and may install unwanted triggers (on-start-of-layout, every-tick) that reference objects or layers not present on the target layout.

**Functions are globally callable** — any function defined in any event sheet can be called from any other event sheet, regardless of include chain. Expression-style function calls (`Functions.myFunction`) also resolve globally. The only thing that deactivates a function call is if its containing **group is inactive**. This enables event sheet extraction: moving a function to a new sheet doesn't break callers. However, if the function depends on its event sheet's runtime state (signals, timers, variables set by event handlers), calling it from a layout that doesn't include that sheet risks silent failures — the function executes but its dependencies may not be active. Include the defining event sheet when the function relies on side effects from its sheet's event handlers.

**Event handlers are NOT global** — `on-start-of-layout`, `on-signal`, `every-tick`, `on-created`, `on-destroyed`, `on-timer`, `on-tweens-finished`, `on-any-touch-end`, and all other trigger-based events only fire if their event sheet is in the active layout's include chain. There is no runtime error when they stop firing — they silently don't execute. This is why pure function library event sheets (no layout handlers) are safe to include anywhere.

**Variable scope by nesting depth:**

- **Root-level** — variables declared at the ROOT of an event sheet (direct children of the `events` array, not inside any group or block) are **globally accessible** from all event sheets, regardless of include chains. For example, a `const` declared at the root of a configuration sheet (e.g. `MyConfigEvents`) is usable in any other sheet (e.g. `MyMenuEvents`) without any include. All root-level variables appear in `globalVars.d.ts`.
- **Group-scoped** — variables declared inside a group (`events[N].children[...]`) are accessible only within that group's scope. A function always has access to its own event sheet's variables, regardless of which layout or event chain invokes it. A sheet-local variable referenced from another sheet causes `cannot find event variable` at runtime.
- **Function-scoped** — variables (including `static` and `const`) declared inside a `function-block`'s `children` array are scoped to that function. Other functions and root-level blocks cannot reference them, even though `static` variables persist their values between calls. Common symptom: C3 editor error "Unknown expression 'varName': This is not a system expression or variable name in this scope."

Static variables (`isStatic: true`) persist their values across layout transitions; non-static variables reset each transition — but both scoping rules apply equally. When extracting shared logic into included event sheets, audit all variable references: root-level globals are safe, but nested variables must be declared in the destination sheet.

**Initialization order matters** — while variables are *visible* everywhere in their scope (the `extract-scripts` tool pre-collects all variables at each level before traversing blocks), initializer code runs in array order. A variable declared after events that set it will have its initializer run after those events, silently resetting the value to its default. Always declare variables before the events that reference them.

**Multiple `on-start-of-layout` blocks fire in array order** — when several `on-start-of-layout` blocks live in the same sheet (or across included sheets), they execute strictly in the order they appear in the `events` array, regardless of whether they're conditional or unconditional. A reset/initialization block placed after a conditional block that depends on clean state will run **too late**, and the conditional block will read stale state from the previous layout. When adding initialization, always verify the array position relative to other `on-start-of-layout` blocks (use the DSL index). If in doubt, create a dedicated unconditional block and insert it before all others.

**DSL caveat**: The DSL format uses `static`/`var`/`const` for both root-level globals and nested event variables — there is no visual distinction. Check indentation: root-level (no indent) = global; indented inside a group = sheet-local.

**Implication for extraction**: To share functions across layouts without pulling in unwanted handlers, create a dedicated event sheet containing only function-blocks and variables (no `on-start-of-layout`, `on-signal`, etc.). Include it from any layout's event sheet chain. Callers in event sheets that don't include the new sheet still work (global callability).

### Feature Flag Access

A common pattern: declare feature-flag **keys** (constants) at the root of a configuration event sheet, e.g. `const FeatureFlag_SomeFeature: string = "someFeature"`. These are root-level globals and thus accessible from any sheet without include changes.

Feature flag **values** are typically fetched per-caller via a function such as `Functions.GetFeatureFlagAsString(key, fallback)` (or boolean/number variants). When there is no pre-populated global that holds the current value, each consumer fetches at use time into a local scratch `var` or into a sheet-local static:

```text
// Typical pattern inside a function or on-start block
do: System.set-eventvar-value(variable=someFeature, value=Functions.GetFeatureFlagAsString(FeatureFlag_SomeFeature, ""))
```

The sheet-local static is then readable from inline scripts as `localVars.someFeature`. When writing a new on-start handler that needs a flag value inside an inline script, insert the fetch action **before** the script — C3 actions run in array order, so a script that reads the static before the fetch runs will see whatever previous transition left behind (or the declared default).

When the same flag is read in multiple sites, having each consumer own its own fetch is a deliberate choice — it ensures stale values from a prior layout cannot leak across context switches.

### Variable Preference Hierarchy

When choosing where to store state, prefer the most restrictive scope that works (Clean Architecture principle). In order of preference:

1. **Local variable** — temporary variable scoped to a function or block, reset every tick. Cheapest and safest.
2. **Instance variable on a meaningful instance** — typically on a global singleton object (e.g., a JSON or data plugin instance). Ties the value to its owning entity.
3. **Static event variable** — persists across ticks/layout transitions like a private variable. Access from outside the event sheet via a **Function** (e.g., a `GetCurrentLanguage` function that exposes a `currentLanguage` static). Never reference another sheet's static directly through `localVars` — it couples sheets and breaks extracted TypeScript type checking.
4. **Global variable** — visible everywhere. Must warrant public accessibility. Declared at root level of any event sheet and accessible from all others.

### Functions vs Custom Actions

Prefer **custom actions** (`custom-ace-block`) over **function-blocks** when the callable does not return a value. Custom actions are semantically clearer (they *do* something, they don't *compute* something) and integrate better with C3's picked-instance and event flow model. Reserve function-blocks for callables that need to return a value via `Functions.set-function-return-value`.

### Calling Function-Blocks from Expressions

In an **expression context** (a `value` field on `set-eventvar-value` / `set-instvar-value`, any condition or action parameter that takes an expression), a function-block with **zero parameters** is referenced as a bare identifier — `Functions.MyFunc` — with **no parentheses**. Functions with one or more parameters use the familiar form `Functions.MyFunc(arg1, arg2)`.

Writing `Functions.MyFunc()` (empty parens) raises a C3 load-time error:

```text
EventSheetName, event N, action M: Syntax error: ')' can't go here - are you missing something before it?
```

The function *definition* keeps `"functionParameters": []` regardless — this rule applies only at call sites in expressions. Calling a zero-arg function as a *standalone action* (not inside an expression) is unaffected: that uses a `customAction` slot on a separate action object and does not run through the expression parser.

Empirical check: grep the project for `"value":\s*"Functions\.[A-Z][a-zA-Z]+\(\)"` — working code has zero matches. Any new zero-arg function called from an expression should follow the same bare-identifier pattern.

This is invisible to lint, typecheck, and c3proj validation. The only validator is C3 itself at project load time. For any cross-cutting change that touches event-sheet `value` strings, load the project once before declaring the migration done.

### Boolean Event Variable Conditions

Boolean event variables (static, var, or const) must use `System.compare-boolean-eventvar`, **not** `System.compare-two-values` against `0`. In eventSheet JSON:

```json
{
  "id": "compare-boolean-eventvar",
  "objectClass": "System",
  "sid": 0,
  "parameters": {
    "variable": "myBooleanVar"
  }
}
```

This checks if the boolean is `true`. To check `false`, add `"isInverted": true`. Using `compare-two-values(first-value=myBooleanVar, second-value=0)` compiles without error but evaluates incorrectly at runtime — C3 treats booleans and numbers as distinct types in conditions.

In DSL output, the correct form reads:

```text
when: System.compare-boolean-eventvar(variable=myBooleanVar)
when: NOT System.compare-boolean-eventvar(variable=myBooleanVar)
```

If you see `compare-two-values` with a boolean variable name, it's a bug.

### Boolean Instance Variable Conditions

Boolean instance variables use `is-boolean-instance-variable-set` on the **object class** (not System):

```json
{
  "id": "is-boolean-instance-variable-set",
  "objectClass": "MyData",
  "parameters": { "instance-variable": "hasPending" }
}
```

This is distinct from `compare-boolean-eventvar` (which is a System condition for event-scoped boolean variables). Do not use `compare-instance-variable` with comparison/value params for booleans — use `is-boolean-instance-variable-set` instead.

### else Chaining

`else` only evaluates against the **immediately preceding** sibling block. To add multiple guard conditions before a final `else`, use an if / else-if / else chain:

- The first block has plain conditions
- Subsequent guards combine `else` with their conditions
- The final `else` is the fallback

A standalone block (without `else`) between a guard and the final `else` breaks the chain — the final `else` would only check against the standalone block, not the original guard.

### OR Condition Semantics

C3 uses child `[OR]` blocks for OR logic. **Conditions within a child `[OR]` block are OR'd with each other**, not AND'd like in regular blocks.

**Trigger conditions must be first and cannot be ANDed with other triggers.** Conditions like `on-start-of-layout`, `on-tap-object`, and `on-signal` must appear as the first condition in the `conditions` array. Multiple trigger conditions in the same block are not supported.

**For `trigger AND (condA OR condB)`, use a parent block with a child `[OR]` block.** Put the trigger in the parent (with no actions), and the OR'd conditions + actions in the child:

```text
block                                    <- trigger only, no actions
  when: System.on-start-of-layout()

  block [OR]                             <- conditions here are OR'd
    when: LayoutName == "LayoutA"
    when: LayoutName == "LayoutB"
    do: { some actions }                <- actions on the child
```

In JSON, the child block has `"isOrBlock": true` and multiple conditions — those conditions are OR'd because they're inside an OR block.

**Do not use `orBlock: true` on individual conditions in a `conditions[]` array** — this does not produce the expected OR grouping.

### Same-Tick Event Processing Order and Touch Passthrough

**Event sheet processing order within a tick**: When multiple event sheets are included in a layout, they process in include order (document order in the layout's root event sheet). Within a single tick, all event sheets run sequentially — later sheets see state changes made by earlier sheets. This means an action in `SheetA` that sets a variable or changes layer interactivity is immediately visible to `SheetB` if `SheetB` is included after `SheetA`.

**Touch event interactivity check timing**: `on-tap-object` and similar touch conditions check layer interactivity at evaluation time, not at the moment the physical touch occurred. If a handler in an earlier event sheet re-enables a layer's interactivity during the same tick, touch events in later event sheets will fire on that layer for the same physical tap. This is the root cause of "touch passthrough" bugs — a tap that closes a modal can also trigger a button behind it if the close handler re-enables the background layer synchronously.

**`trigger-once-while-true` same-tick transitions**: `trigger-once-while-true` fires on the transition from false to true. If a close handler hides a modal (making the trigger condition false) and the `else` branch re-enables background layers, this all happens in the same tick — meaning touch events on those re-enabled layers can fire on the same physical tap that closed the modal. The sequence within one tick:

1. Touch event fires `on-tap-object` on the modal's close button (modal layer is interactive)
2. Close handler sets modal to hidden, making `trigger-once-while-true` condition false
3. The `else` branch runs, re-enabling background layer interactivity
4. Later event sheets process the same tick — `on-tap-object` conditions on the now-interactive background layer evaluate as true for the same physical tap

**Mitigation**: Prefer a shared helper that defers layer re-enable to the next tick — e.g. a `toggleInteractiveLayers()` function with a built-in `System.wait(0.1)` — over hand-coded `trigger-once-while-true` layer management. When writing custom modal open/close logic, always ensure that layer re-enable is deferred by at least one tick (e.g., via `System.wait(0)` or `System.wait(0.1)`) relative to the close action.

### Touch Event Timing and Animation Guards

Touch events (`on-touched-object` start/end) and tap events (`on-tap-object`) have distinct timing within the same physical input. Touch start fires first, then touch end, then tap (synthesized after touch completes). When using animations to manage button state (e.g., "Default", "Pressed", "Enabled"), each handler needs its own animation guard to prevent state clobbering:

```text
// Touch start: only transition from Default to Pressed
block
  when: Touch.on-touched-object(Button, start)
  when: is-animation-playing("Default")
  do: set-animation("Pressed")

// Touch end: revert Pressed back to Default (if tap didn't fire)
block
  when: Touch.on-touched-object(Button, end)
  when: is-animation-playing("Pressed")
  do: set-animation("Default")

// Tap: only act if button is in the expected animation state
block
  when: Touch.on-tap-object(Button)
  when: is-animation-playing("Enabled")
  do: navigate to target layout
```

Without independent guards, the touch start/end cycle can override animation states set by the tap handler (or vice versa), especially for disabled buttons where multiple animations represent distinct states.

### Scope Type Caveat: Parent Actions vs Child Variables

Variables declared in a block's `children` array are visible to **sub-events** (sibling child blocks) but **not** to the parent block's own `actions`. This is a C3 runtime constraint — C3 will error with "cannot find event variable" if a parent's action references a variable declared in its children. The TypeScript extractor mirrors this: it does not include child variables in the scope type for the parent's `actions` array.

**Problem pattern:**

```text
ace MyObject.DoStuff() -> none
  do: System.set-eventvar-value(variable=myVar, ...)  <- C3 error: cannot find event variable
  do: script { localVars.myVar = "hello"; }            <- TS error: myVar not in scope type
  var myVar: string =
  block
    do: script { localVars.myVar ... }                  <- OK: myVar IS in scope here
```

The parent's actions cannot see `myVar` because the variable is a child event, not an ancestor. Child blocks at the same level DO see the variable because they are sibling sub-events.

**Fix:** Move the actions into an unconditional child block:

```text
ace MyObject.DoStuff() -> none
  var myVar: string =
  block                                          <- unconditional wrapper
    do: script { localVars.myVar = "hello"; }    <- OK: myVar in scope
  block
    ...
```

This applies to `custom-ace-block`, `function-block`, and regular `block` event types. The same limitation means variables declared just OUTSIDE a function (as siblings) are accessible at runtime but risky — the extractor may not include them in the function's scope type, and the coupling between the variable and function is fragile.

### `pick-children` Scoping vs Gating

`pick-children` is used as a block condition to scope ACE calls to children of a specific object hierarchy (e.g., targeting a `ChildWidget` that is a child of a specific `ParentList` instance).

**Important:** When `pick-children` (or `compare-instance-variable`) is used as a block condition, the entire block is skipped if the parent object type has zero instances on the current layout. This means ALL actions in the block are gated — not just the ACE that needs scoping.

**Pattern — keep scoping narrow:**

```text
// WRONG: wraps unrelated actions in the scoped block
block
  when: ParentList.compare-instance-variable(itemId == currentItemId)
  when: ParentList.pick-children(ChildWidget, bottom)
  do: call updateLabelText()              // doesn't need ParentList
  do: SomeText.set-text(...)              // doesn't need ParentList
  do: ace ChildWidget.setValue(...)       // ONLY this needs pick-children
  do: call refreshOtherUI()               // doesn't need ParentList

// RIGHT: only scope the ACE that needs it
do: call updateLabelText()
do: SomeText.set-text(...)
block
  when: ParentList.compare-instance-variable(itemId == currentItemId)
  when: ParentList.pick-children(ChildWidget, bottom)
  do: ace ChildWidget.setValue(...)
do: call refreshOtherUI()
```

On layouts where the parent type (e.g., `ParentList`) has zero instances, the narrow block is harmlessly skipped while all other actions still execute. The wide block would skip everything.

### Sprite `set-animation-frame` Accepts Number or String

The C3 Sprite plugin's `set-animation-frame` ACE accepts either a **number** (0-based frame index) or a **string** (frame tag name), dispatching by `typeof` on the parameter expression at runtime. Expressions that may return either form — for example a data lookup such as `MyData.Get("some.asset.path")` — flow through to the ACE without any coercion or disambiguation logic.

**Practical consequence:** when migrating a value through this ACE (e.g. a number → tag-name migration), inline the lookup expression directly at the `frame-number=` parameter. No script wrapper, no parse-and-re-dispatch is needed at the ACE boundary. The chokepoint is **upstream typed C3 vars** — see the next subsection.

This dual-type acceptance applies to the ACE boundary only; downstream picking and animation-state changes still follow normal C3 semantics.

### Typed-Number C3 Vars Silently Coerce Strings to 0

When a C3 instance variable or static event variable is declared `type: "number"`, assigning a string-valued expression to it — whether via TS `localVars.x = someString`, `as unknown as number` cast, or `set-eventvar-value` with a string source — coerces the stored value to **`0`** at the runtime layer. Not `NaN`, not the original string. Downstream readers that pass the var into ACEs like `set-animation-frame(frame-number=...)` then silently get frame 0.

**Why this is a trap:** the TypeScript `as` cast satisfies the compiler but has no effect on C3's runtime type semantics. A typed-number var that bridges a `number | string` value is a silent zero-injector.

**How to apply:**

- **Never** use a TS cast to flow a heterogeneous value through a typed C3 var. The TS layer and the C3 runtime layer have different type semantics.
- When a value can be number-or-string, read it at the use-site so the JSON type is preserved all the way through to the ACE (which accepts both).
- If a C3 var bridge is genuinely unavoidable, change the var's `type` to `string` and stringify on write; readers that need the number form parse on read.

The general principle: read at the use-site and defer any clear/coercion, rather than bridging a heterogeneous value through an intermediate typed var.

### Unpicked Custom Actions Broadcast to All Instances

Calling `ace ObjectType.customAction()` without a prior pick condition applies the action to **all instances** of that object type. On layouts with multiple instances (e.g. a `ChildWidget` appearing as children of every item in a `ParentList`), this clobbers per-instance state across every instance simultaneously.

Always scope custom action calls with a pick condition before the call:

```text
// WRONG: hits every ChildWidget on the layout
do: ace ChildWidget.setValue(5)

// RIGHT: scoped to the child of the picked ParentList instance
block
  when: ParentList.compare-instance-variable(itemId == currentItemId)
  when: ParentList.pick-children(ChildWidget, bottom)
  do: ace ChildWidget.setValue(5)
```

When targeting a single known instance from TypeScript (not from an event block), use `getFirstInstance()` — it avoids broadcasting entirely. The broadcast-to-all behavior produces no error or warning; the symptom is all instances updating when only one should.

---

## 6. Layout Architecture

See [./layout-reference.md](./layout-reference.md) for layout organization, layers, templates, navigation patterns, and modal management.

### `Create object` and Templates

`Create object` System actions **must always specify a non-empty `template-name`**. Empty `template-name` is tech debt regardless of whether `create-hierarchy` is set.

**Why:** With empty `template-name`, C3 picks an arbitrary instance of the object type as the "model" for the new instance. The pick is non-deterministic and (observed in a production C3 project) appears to depend on project-tree order. Two failure modes:

1. **Property/animation drift.** Without `create-hierarchy`, properties of the picked model — initial-animation, initial-frame, opacity, scale — propagate to the new instance. A UI-only tweak to one layout's instance can ghost-affect a runtime spawn elsewhere.
2. **Cross-layer hierarchy crash.** With `create-hierarchy: true`, C3 also clones the picked model's children. If the picked model's parent and child sit on different layers, `_CreateChildInstancesFromData` reads `[1]` of an undefined record and the layout fails to load. Symptom: the layout is empty, console shows the read-of-undefined, and switching tabs/layouts hangs.

**Pattern:** Define a deterministic master template once, use its name everywhere.

- **UI components** — define the master in a shared UI components layout (e.g. `UIComponentsLayout`) that houses your reusable button/widget templates. Keep the same layer for parent and children.
- **Gameplay templates** — define in the appropriate templates layout (e.g. a `Core/Templates/*Layout`).
- **Recipe form** — `"template-name": "\"TemplateName\""` (the parameter is a C3 expression, so the JSON value is a quoted string).

When triaging a `_CreateChildInstancesFromData` / `CreateInstanceFromData` crash at runtime, the empty-template-name pattern is a leading suspect — find the `Create object` action that fires immediately before the crash.

---

## 7. C3 Conventions

### Event Sheets

- **Objects sharing instance variables** should be placed under a Family for shared behaviors and cleaner event sheet logic
- **New object logic** should be created within a dedicated event sheet
- Place event sheets in folders based on the object's purpose or type
- Import new event sheets into the appropriate parent/root event sheet for the relevant layouts
- **Reduce usage of Global variables** — prioritize Local variables
- Use **Every seconds** instead of **Every ticks** where possible for better performance
- **`pick-children` is required in for-each loops** — when iterating over parent objects with "For each" and acting on child objects, every child type referenced in actions needs a corresponding `pick-children` condition. Without it, actions affect all instances of that type rather than just the child of the current parent

#### Event Sheet Organization

Follow this canonical structure for event sheet `events` arrays:

1. **Includes** — all `include` directives at the very top
2. **Root-level variables** — global/static/const variables immediately after includes
3. **Main group** — a single top-level group wrapping all event logic, containing:
   - Local variables (declared before any blocks that reference them)
   - Subgroups and function-blocks
   - Event blocks

**Never reference a variable before its declaration in the JSON tree**, even if it's `static` or `const`. While C3 scoping makes variables visible throughout their group, the runtime processes nodes in array order — referencing a variable before its declaration position can produce `NaN` or `undefined` values at runtime (e.g., NaN coordinates when positioning objects). See [Variable and Function Accessibility](#variable-and-function-accessibility) for the full scoping rules.

### Disabling UI Input: prefer `toggleInteractiveLayers` over group deactivation

When a modal goes up and the underlying UI must stop responding to input, prefer a layer-interactivity helper such as [`toggleInteractiveLayers`](./layout-reference.md#modal-layer-management-toggleinteractivelayers) (or `System.set-layer-interactive`) over `System.set-group-active(state=deactivated)`.

**Why:** Group deactivation stops *every* event in the group from firing — including signal handlers, timers, and any cross-cutting handlers that happen to live in the same group as the buttons. Layer interactivity only stops touch input on that layer; signal/tick handlers continue to run. A common bug class: a modal's "disable layers" action deactivates a navbar group while the modal is up, dormant-ing a success-signal handler that lives in the same group — so a badge or counter never refreshes.

**When group deactivation is the right tool:** when a group contains expensive tick-based handlers (e.g., per-tick animation updates, per-tick polling) that genuinely shouldn't evaluate while a feature is closed/inactive. Touch and signal handlers don't need it — they're cheap, event-driven, and you usually want them to keep running.

**If you do deactivate a group:** define the group narrowly. Only put handlers in it that you genuinely want dormant when the group is off. Co-locating signal handlers with touch handlers because they "feel related" creates a hidden dependency between modal state and unrelated subsystems. The fix is to split: a parent group for always-on handlers, a nested subgroup (with the deactivation-target name) for the input-bearing ones.

### Instance Variables for Cross-Block State

When a script action needs to pass temporary state to subsequent C3 blocks (e.g., an ACE that resolves data then branches on the result), use **instance variables** on the relevant object — not JSON properties. InstVars avoid polluting the data model, have reliable type handling, and persist naturally on the instance.

**InstVar types**: boolean, number, or string only. Assigning `undefined` to an instVar causes `TypeError: Cannot read properties of undefined (reading 'toString')` — C3 internally calls `.toString()` on assigned values. Choose type based on how C3 will consume the value:

- **Boolean** → `compare-boolean-instance-variable` (reliable, no coercion issues)
- **Number** → standard `compare-two-values`
- **String lists** → comma-separated, iterated with `tokencount`/`tokenat` (see below)

**From TypeScript**, set instVars via `instance.instVars.varName`:

```typescript
const obj = runtime.objects.MyObject.getFirstInstance()!;
obj.instVars.hasPending = pending.length > 0;
obj.instVars.pendingKeys = pending.join(",");
```

**Why not JSON properties**: Storing metadata like `__pendingKeys` in a JSON instance mixes control state with game data, making it hard to reason about what the object "really" contains. InstVars keep metadata separate from the JSON payload.

**InstVars on global singletons vs static locals**: When multiple event sheets share the same state (e.g., a count or a current-selection used for display), prefer instVars on a global data object (e.g., `MyStateJSON.itemCount`) over duplicated `static` variables in each event sheet. Benefits: single source of truth, accessible via expressions anywhere (`MyStateJSON.itemCount`), and naturally scoped to the data they describe. Use custom ACE actions on the data object to encapsulate shared logic that operates on these instVars.

### Token-Based String Iteration

For iterating comma-separated lists stored in string variables or instVars, use `tokencount` and `tokenat`:

```text
block
  when: System.repeat(tokencount(MyObject.myList, ","))
  do: SomeAction(value=tokenat(MyObject.myList, loopindex, ","))
```

Or equivalently with `System.for`:

```text
block
  when: System.for("i", 0, tokencount(MyObject.myList, ",") - 1)
  do: SomeAction(value=tokenat(MyObject.myList, loopindex("i"), ","))
```

**Empty string caveat**: `tokencount("", ",")` returns 1 (one empty token), not 0. Always guard with a boolean or length check before the loop to avoid processing a spurious empty token.

This pattern is common wherever comma-separated lists are stored in C3 string variables or instVars (e.g. position lists, character lists, coordinate strings, level-data fields).

### Addon Plugins

C3 addon plugins are stored as `.c3addon` files (zip archives) in `addons/plugin/` and `addons/effect/`. It is common to also extract each addon into a same-name subfolder (e.g., `addons/plugin/MyPlugin/`) for direct source inspection, while `.gitignore` tracks only the `.c3addon` files and ignores the extracted folders.

To inspect a plugin's API surface, read its extracted files directly:

- `aces.json` — action, condition, and expression definitions with parameter schemas
- `c3runtime/` — runtime implementation (`actions.js`, `domSide.js`, `expressions.js`, etc.)
- `lang/en-US.json` — display strings and parameter descriptions for the C3 editor
- `addon.json` — plugin metadata (ID, version, author)

To extract a new or updated addon:

```bash
mkdir -p addons/plugin/AddonName && cd addons/plugin/AddonName && unzip -o ../AddonName.c3addon
```

### Animation Name Is Unreliable as an Identity

A helper that derives an identity from a sprite's animation name (e.g. stripping trailing skin/variant digits) does **not** necessarily strip semantic suffixes like `"Active"` or `"Locked"`. An animation named `"FooActive"` may return `"FooActive"`, not `"Foo"`.

Use a dedicated instance variable (e.g. `MyList.instVars.itemId`) for reliable identification. Never derive an identity from an animation name unless the animation naming convention is under your control and explicitly guarantees a clean base name.

### Prefer Instance-Count Guards Over Layout-Name Exclusion Lists

When C3 logic must run conditionally based on whether an object exists on the current layout, check the object's instance **count** rather than excluding specific layout names.

```text
# Brittle — every new layout that doesn't host the object must update this list.
when: LayoutName != "LayoutA"
when: LayoutName != "LayoutB"
do:   MyPlugin.<action>

# Self-maintaining — adapts to new layouts automatically.
when: MyPlugin.Count > 0
do:   MyPlugin.<action>
```

The count check is self-maintaining: adding a new layout that doesn't host the object Just Works without further edits. Layout-name exclusion lists are a known regression source. When you see `LayoutName != "X" AND LayoutName != "Y" [AND …]` guarding access to an object type, replace with `ObjectType.Count > 0` (or `> 1` for global singletons whose first instance is the canonical one).

### Common C3 Editor Errors

- **"expected finite number"** on project open — a JSON value has wrong type (string where C3 expects number). Check recipe-generated params.
- **"Error removing animation: animation name '' does not exist"** — iterating an Array with default values (`0`). Guard with `CurValue <> ""` AND `CurValue <> 0`.
- **"Unknown expression 'varName'"** — referencing a variable outside its scope. See [Variable and Function Accessibility](#variable-and-function-accessibility).
- **"Property 'X' does not exist on type 'IConstructProjectLocalVariables_NNNNN'"** in a script block — sheet-root variables are globals, not locals. Wrap the variable (and its consumers) in a top-level group. See [Sheet-Root Variables Are Globals](#sheet-root-variables-are-globals).

### Sheet-Root Variables Are Globals

A variable declared at the **root of an event sheet** (outside any group/block) is a **global variable**, regardless of the `isStatic` flag. Globals are accessed via `globalVars.X` or as bare identifiers in event-sheet expressions — they do **not** appear on a script block's `localVars` interface.

To make a variable a true **local** (accessible as `localVars.X` from inside `script { }` blocks), declare it **inside a block or group**. The `isStatic` flag then controls reset behavior (static = preserves value across enter/exit of the scope; non-static = reset on each entry).

```text
# Broken — root-level static is actually a global; script block can't see it
static mySelectedLabel: string =
block when: ...
  do: script { localVars.mySelectedLabel = "foo"; }  // TS error

# Working — wrap in a group; static is now a true local
group "My Group" (active)
  static mySelectedLabel: string =
  block when: ...
    do: script { localVars.mySelectedLabel = "foo"; }  // works
```

Symptom: C3 editor reports `Property 'X' does not exist on type 'IConstructProjectLocalVariables_<SID>'`. The SID in the error is the consuming scope's SID — it doesn't include sheet-root variables in its typed interface. The fix is always the same: place the variable (and every script block that reads or writes it) inside the same top-level group.

### Function/ACE Calls Hoist; Handler Blocks Don't

C3 has an asymmetric scoping rule that bites async fetch flows:

- **Function and ACE calls** (`do: call myFunc()`, `do: ace MyObj.MyAction()`) resolve **project-wide**. You can call a function defined in any event sheet from anywhere — hoisting is automatic.
- **Trigger / response handler blocks** (`when: MyData.onloaddata()`, `when: AJAX.on-completed(tag="x")`, `when: System.on-start-of-layout()`) only fire when the host event sheet is in the **include chain of the currently-active layout**.

This creates a silent failure mode: an async ACE that uses `instance-wait-for-signal` works correctly only if both the ACE definition **and** its response-handler blocks (the ones that fire the signal) live in sheets active on every layout that calls the ACE. The call hoists, the response handlers don't — so the network request fires, the response arrives, but no handler is listening to convert it into a signal. The wait hangs indefinitely. No error, no log, just silence.

Symptom: an async fetch's network request completes (visible in DevTools), but downstream code after `wait-for-previous-actions` never runs.

Pattern: co-locate the ACE, signal const, and all response handlers in a sheet that's included by every layout that invokes the load (the full stack: ACE + plan + get + load + onload-success + onload-failed + AJAX fallback, all in one sheet).

### JSON Plugin `set-json` Parses Async — Signal from `on-parse-success`

C3's JSON-plugin `set-json` action queues parsing on a later tick. Firing `instance-signal` synchronously after `set-json` resolves the wait **before** the data is queryable — downstream code reads an empty/stale JSON instance.

The canonical pattern uses an instVar discriminator (e.g., `ParsingKey`) because `on-parse-success` and `on-parse-error` fire globally on the JSON instance — they don't carry which `path` was being parsed:

```text
1. block when: <fetch-load-trigger>
     do: <Instance>.set-instvar-value(ParsingKey, "myKey")
     do: <Instance>.set-json(path="myKey", json=...)  # async parse queued
     # NO signal here

2. block when: <Instance>.on-parse-success()
     when: <Instance>.compare-instance-variable(ParsingKey == "myKey")
     do: <Instance>.set-instvar-value(ParsingKey, "")  # reset defensively
     do: <Instance>.instance-signal(MyLoadSignal)

3. block when: <Instance>.on-parse-error()
     when: <Instance>.compare-instance-variable(ParsingKey == "myKey")
     do: <Instance>.set-instvar-value(ParsingKey, "")
     do: <error-reporting-action>
     do: <Instance>.instance-signal(MyLoadSignal)  # signal on failure too
```

Reset `ParsingKey` to `""` after firing the signal — prevents stale matches if some unrelated parse happens later on the same instance.

### HTML Controls Don't Respect Layer Visibility

C3 HTML controls (text input, list/select inputs, etc.) render in a DOM overlay above the C3 canvas — not as C3 sprites. Layer-level `set-layer-visible(invisible)` does **NOT** hide them. The DOM element stays visible regardless of the layer's C3 visibility flag.

To hide an HTML control properly, toggle both the layer **and** the instance:

```text
do: System.set-layer-visible(layer="MyHtmlLayer", visibility=invisible)
do: System.set-layer-interactive(layer="MyHtmlLayer", interactive=false)
do: MyHtmlControl.set-visible(visibility=invisible)  # required: hides the DOM element
```

And to show:

```text
do: System.set-layer-visible(layer="MyHtmlLayer", visibility=visible)
do: System.set-layer-interactive(layer="MyHtmlLayer", interactive=true)
do: MyHtmlControl.set-visible(visibility=visible)  # required: shows the DOM element
```

Layer placement also matters more for HTML controls — they can render over the top of everything regardless of C3 z-ordering, so the layer's stacking has to be set deliberately in the layout JSON.

### Match UI Layouts to the Project Viewport

A C3 layout can have a surface larger than the project's viewport, but only **gameplay levels** benefit from the extra surface (extra-canvas content for level design, where the camera scrolls). **UI layouts** (menus, modals, selection screens, etc.) should match the viewport — any extra area is wasted, since the camera never scrolls there.

When placing new instances on a UI layout, use the viewport's coordinate space; the center is roughly half the viewport width and height. When opportunistically opening an old UI layout that's sized larger than the viewport, resize it down. When asking tooling (or another author) to place a widget or UI element on a UI layout, specify coordinates in the viewport coordinate space, not whatever larger size the layout currently shows.

---

## Related Documentation

### Sibling deep-dive documents

These documents (in this same `docs/c3/` directory) expand on sections within this guide:

- [./event-sheet-architecture.md](./event-sheet-architecture.md) — Include composition, per-layout pattern, JSON schema (expands §3)
- [./typescript-integration.md](./typescript-integration.md) — Facade pattern, runtime access, async model, signals (expands §2)
- [./layout-reference.md](./layout-reference.md) — Layer system, templates, navigation patterns (expands §6)
- [./scripting-reference.md](./scripting-reference.md) — C3 scripting API quick reference

### Tooling and recipes

For the construct3-chef toolchain — recipe authoring, generators, SID handling, project sync, and related tooling gotchas — see the `construct3-chef://docs` MCP resource (start with `recipe-reference.md`).
