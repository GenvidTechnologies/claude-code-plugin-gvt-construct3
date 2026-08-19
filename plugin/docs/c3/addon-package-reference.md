---
type: reference
title: Addon Package Reference
description: "The addon package's on-disk layout, companion to ace-reference.md: where properties are declared (editor ROOT plugin.js), the lang/*.json localization structure, and the opaque load-time error a missing language string produces."
tags: [addons, packaging, localization, plugin-js]
status: stable
---

# Addon Package Reference — layout, properties, and `lang/*.json`

How a Construct 3 addon package is laid out on disk: where its **properties**
are declared and how its **localization strings** (`lang/*.json`) are
structured. This is C3 *platform* structure (the Construct Addon SDK's
on-disk contract), the companion to [ace-reference.md](ace-reference.md)
(which covers the `aces.json` ACE-metadata model) — read that doc for ACE
shape; this one covers everything else in the package.

## Authoritative source

The canonical, authoritative reference for addon package structure and
property declaration is the **Construct Addon SDK**, published by Scirra:
`https://github.com/Scirra/Construct-Addon-SDK.git`. A consuming C3 repo may
vendor a copy as a **git submodule** (typically under `SDK/`). This doc
records the facts a tool or skill needs at a glance; the SDK repo is ground
truth — verify against the vendored SDK when in doubt.

## Package layout

The relevant files inside an addon folder (`addons/<addon>/`):

- **editor-side ROOT `plugin.js`** — the editor SDK entry point. Declares the
  addon's info **and its properties** (see below). For behaviors, the
  analogous editor entry point is `behavior.js`; the `properties`/`lang`
  mechanics are the same. For how a project attaches a behavior instance
  (`behaviorTypes[]`) and how an event-sheet ACE targets it (`behaviorType`),
  see [event-sheet-architecture.md](event-sheet-architecture.md#behavior-attachment-and-ace-targeting).
- **`c3runtime/plugin.js`** — the **runtime** file. It carries **no property
  declarations.** This "looks like the obvious place" for properties because
  it shares the `plugin.js` name and sits deeper in the tree — but that
  intuition is wrong. Properties live only in the editor ROOT `plugin.js`.
- **`addon.json`** — carries the addon's **`id`**.
- **`aces.json`** — the ACE declaration. See
  [ace-reference.md](ace-reference.md) for its structure and traps; not
  restated here.
- **`lang/*.json`** — the localization strings (structure below).

## Where properties are declared

Properties are declared in the **editor ROOT `plugin.js`**, as JavaScript —
not in any JSON file, and not in `c3runtime/plugin.js`:

```js
this._info.SetProperties([
  new SDK.PluginProperty("<type>", "<id>", { /* options */ })
]);
```

Each `PluginProperty` call's `<id>` is the property id referenced elsewhere
(recipes, `lang/*.json` — see below).

## `lang/*.json` structure

Localization strings for a plugin nest under
`text.plugins.<pluginId>.{ name, description, aceCategories, properties,
conditions, actions, expressions }`:

- ACE entries are keyed by **ace id** under the plural category
  (`conditions` / `actions` / `expressions`), each with a
  `params.<paramId>.name`.
- `properties.<propId>.name` names a property; combo, link, and group
  properties additionally carry a `properties.<propId>.items.<itemId>`
  string map (one entry per selectable item).
- **Effects** use `text.effects.<id>` instead of `text.plugins.<pluginId>`.

Illustrative shape (generic/example ids only — not from any real addon).
The nesting and the field names named in the bullets above (`name`,
`description`, `properties`, `items`, `params.<paramId>.name`) are the
documented contract; the finer per-ACE-entry keys shown below
(`list-name`, `display-text`, `desc`) are representative of C3's convention
but not enumerated in this doc's source — verify them against the vendored
SDK before relying on the exact spelling:

```json
{
  "text": {
    "plugins": {
      "myPlugin": {
        "name": "My Plugin",
        "description": "Example plugin for illustration.",
        "aceCategories": {
          "general": "General"
        },
        "properties": {
          "myMode": {
            "name": "Mode",
            "items": {
              "modeA": "Mode A",
              "modeB": "Mode B"
            }
          }
        },
        "conditions": {},
        "actions": {
          "myAction": {
            "list-name": "My action",
            "display-text": "My action ({0})",
            "description": "Does the thing.",
            "params": {
              "myParam": {
                "name": "Amount",
                "desc": "How much."
              }
            }
          }
        },
        "expressions": {}
      }
    }
  }
}
```

## The plugin key = the addon `id`

The key under `text.plugins` is the addon's **`id`**, as declared in
`addon.json` — not a category name, not the display name. **`aces.json`'s
top-level keys are category groupings** (see ace-reference.md's "Top level is
category-keyed" trap), so do not use them as a source for the `lang` plugin
key; read `id` from `addon.json` instead.

## Load-time failure mode

A missing language string does not fail lint or typecheck — it makes
Construct reject the addon **at load**, with an opaque editor error. This is
the greppable hook for the failure mode:

```
ACE parameter language string 'name' missing for '<param>'. Context is plugins.<id>.<kind>.<aceId>.params.<paramId>
```

Like the `aces.json` id/name mismatches in
[ace-reference.md](ace-reference.md#why-this-matters), this is **invisible to
`tsc`/`eslint`** — only C3 itself parses these strings, and only at addon
load time.

## Why this matters

These facts were derived while implementing construct3-chef's
`validate-addons` aces↔lang consistency check (chef #98), and are reused by
the remaining c3addon-tooling leaves (chef #109 `diff-addon-aces`, #110 ACE
usage/blast-radius, #111 `list-addons`) and any `gvt-construct3` skill that
audits or scaffolds addon localization. They are encoded here once so
consumers read from a single home rather than re-deriving the package layout
per project.
