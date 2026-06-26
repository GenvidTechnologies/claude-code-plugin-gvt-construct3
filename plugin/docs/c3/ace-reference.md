# ACE Reference (`aces.json`) — plugin/behavior ACE metadata

How Construct 3 plugins and behaviors declare their **ACEs** — **A**ctions,
**C**onditions, and **E**xpressions — the verbs and queries an object type exposes
to the event sheet and the expression language. This is C3 *platform* structure
(the addon SDK's on-disk contract), distinct from how any tool indexes or searches
it. The gvt-construct3 `build-reference` skill reads these files to produce
construct3-chef's `c3-reference` cache; the cache's own schema is owned by chef
(see `construct3-chef://docs`), not restated here.

## What an ACE is

Every object type in a C3 project is an instance of a **plugin** (e.g. `Sprite`,
`Text`, the `System` object) or carries a **behavior** (e.g. `Platform`, `Tween`).
Each plugin/behavior publishes three kinds of ACE:

- **Action** — a command run from an event's *Then* side (`Sprite: Set position`).
- **Condition** — a test on an event's *When* side (`Sprite: Is overlapping`).
- **Expression** — a value read inside an expression (`Sprite.X`, `len(…)`).

An ACE has a stable **id**, a set of **parameters** (each with a name/id and a
type), and a human-facing description. Recipes and expressions reference ACEs by
these ids, so knowing the exact id and parameter names is what makes authoring
reliable.

## `aces.json` — the structured source (custom / third-party addons only)

A custom or third-party addon ships an `aces.json` in its addon folder
(`addons/<addon>/aces.json`). It is the **authoritative, machine-readable** ACE
declaration for that addon. Its shape (per the Construct Addon SDK's
`plugin-sdk/aces.schema.json` and `behavior-sdk/aces.schema.json`) has several
traps worth pinning down, because they differ from how the data is often *spoken
about*:

- **Top level is category-keyed.** The top-level keys are **category names**
  (author-defined groupings), *not* `"actions"`/`"conditions"`/`"expressions"`.
  Iterate the keys to enumerate categories.
- **Skip `$schema`.** A `"$schema"` key may sit alongside the categories; it is
  metadata, not a category — ignore it when walking.
- **Each category holds the three ACE arrays:** `conditions`, `actions`, and
  `expressions`.
- **Parameters are keyed by `id`, not `name`.** A param entry's identifier field
  is `id` (with a `type`). Consumers that expect a `name` field must map `id` →
  `name`.
- **Every ACE carries an `id`** — actions, conditions, and expressions alike. It
  is the stable identifier an entry references; an item without a string `id` is
  not a valid ACE.
- **The script/callable-name field differs by kind.** Actions and conditions
  carry an optional `scriptName`; **expressions carry `expressionName`** instead.
  A consumer normalizing to a single `scriptName` field must read `expressionName`
  for expressions and `scriptName` for actions/conditions.

## Built-in / system plugins have **no `aces.json`**

The built-in plugins and behaviors that ship with C3 — `Sprite`, `Text`, the
`System` object, `Platform`, `Tween`, and the rest — do **not** expose an
`aces.json` anywhere reachable:

- **C3 is a web application — there is no local install** to extract built-in
  addon files from. Their ACE metadata lives inside the editor's own runtime, not
  as a distributable file on disk.
- The **public Construct Addon SDK does not contain the built-in plugins** either
  — it ships the schemas and sample addons, not Scirra's first-party set.

So the only external reference for built-in ACEs is the **C3 manual** (the
version-pinned manual PDF, or the construct.net online manual — the latter is
Cloudflare-challenge-walled and not machine-fetchable, though its "View online"
URLs serve as stable canonical anchors). Any tooling that wants built-in ACE
coverage must source it from the manual, not from an `aces.json`.

## Why this matters

A recipe that calls an action by the wrong id, or an expression written with the
wrong parameter name, fails silently or at load time — these strings are invisible
to lint and typecheck (only C3 parses them). The `id`-vs-`name` and
`expressionName`-vs-`scriptName` distinctions above are the exact points where a
naive reader of `aces.json` produces wrong identifiers. They are encoded once here
so any consumer — the `build-reference` skill, an agent, or a human — reads them
from a single home rather than rediscovering them per project.
