---
type: practice-note
title: Tracing a C3 editor fact in the editor bundle
description: How to settle a C3 editor-behaviour claim that no on-disk project can show (a load-time check, a value coercion, a save rewrite) by reading the editor's published JavaScript at a named release; the files, the leads that worked, and the limits that keep a trace from claiming more than it shows.
tags: [c3, editor, verification, docs-c3, provenance, construct3-chef, c3source]
status: stable
stale_after: 2027-11-05
generated: { by: process:maintain-wiki, at: 2026-11-05T00:00:00Z }
sources:
  - id: chef-371-trace
    resource: https://github.com/GenvidTechnologies/construct3-chef/issues/371#issuecomment-6673426024
    title: construct3-chef#371 comment — the r495-2 boolean/combo parameter trace (#182)
  - id: chef-371-caveat
    resource: https://github.com/GenvidTechnologies/construct3-chef/issues/371#issuecomment-6673629072
    title: construct3-chef#371 comment — the combo-slot caveat found in review
  - id: c3source-123
    resource: https://github.com/GenvidTechnologies/c3source/issues/123
    title: c3source#123 — item-name facts traced in r495-2, with the bundle hashes (#181)
---

# Tracing a C3 editor fact in the editor bundle

Some C3 facts are about what the **editor** does: a check it runs while loading
a project, how it coerces a stored value, what it rewrites on save. No
editor-validated project shows such a fact, because a load-time check leaves
nothing on disk. `construct3-sample` cannot confirm or contradict it (see
[Verifying docs/c3 against construct3-sample](/verifying-against-construct3-sample.md)).
An issue that states one usually rests on a single observation in a consuming
project and an inference from the UI.

The editor is a web app, so its JavaScript is published per release and can be
**read**. Twice this has settled a premise that the trackers had left open:

- #181's item-name scoping (one object-class namespace, a layout's identity is its
  JSON `name`), traced for c3source#123.[^c3source-123]
- #182's boolean slots, which construct3-chef#371's triage had called unverified.
  The trace also corrected the issue: the `set-boolean-*` `value` is a dropdown,
  not a checkbox.[^chef-371-trace]

## The method

1. **Name the release and fetch the files** into a new, empty directory outside
   the repo:
   - `https://editor.construct.net/<release>/main.js`
   - `https://editor.construct.net/<release>/projectResources.js`
   - `https://editor.construct.net/<release>/plugins/allAces.json`
2. **Hash them** (`sha256sum`) and compare with any hashes already recorded. r495-2's
   are on c3source#123: `main.js` `18c7a7ce…94d10c`, `projectResources.js`
   `e0180c2a…b7b43`, `allAces.json` `5ad10636…ae7b`.[^c3source-123] Matching hashes
   make two traces comparable.
3. **Read only.** Search the files with a script kept in a *different* directory
   that takes the file path as an argument. Never run, import or `require` the
   bundle. It is untrusted downloaded code.
4. **Record what you found** with the release, the hashes, and the code excerpt
   that settles each claim, on the issue that owns the question. Then delete the
   download: the hashes make it reproducible.

## Leads that worked at r495-2

The code is minified, so identifiers are short and **change between releases**.
Treat every name below as an r495-2 landmark, not a stable API. String literals
and ACE ids are what carry across releases.

| Question | Where it was found |
|---|---|
| An ACE's parameters, their types, items and `initialValue` | `allAces.json` for plugin and System ACEs. The common object ACEs (instance variables, `set-boolean-instvar`) are in `main.js`, as `Jcs({id:"…"` / `Qcs({id:"…"` calls |
| Which class holds a parameter of a given type | a type → class map in `projectResources.js` (`["boolean",self.K5],["combo",self.t7],…`) |
| How a stored parameter value is loaded and saved | each parameter class's `BO(value)` (load) and `zO()` (save). An action's `Ofn(parameters)` calls `BO` per parameter |
| A function-call argument's type | a function parameter's ACE definition, built as `{id:"-funcparam-…", type:this.Cbt(), …}` |
| A load-time name check | the error string itself, e.g. ``object class name '…' already used`` and ``layout name '…' already used`` |

Grep for a quoted error string or an ACE id first. Both are stable, unminified
anchors into the surrounding code.[^chef-371-trace][^c3source-123]

## What a trace does not show

Each of these was over-claimed in a draft and caught in review:

- **It shows what a function does, not when it is called.** A throw found in a
  constructor or setter proves the check exists. It does not prove the project
  loader reaches it unless the caller is read too. At #181 the layout path was
  read end to end (loader → setter → throw). The object-class path was not, so the
  doc says that path is inferred.
- **A comparison not found is inference, not proof of absence.** "The layout
  loader never compares the name with the file name" rested on one needle with 0
  hits. Say "no comparison was found".
- **The editor UI is out of scope.** The load code throwing nothing says nothing
  about what the editor shows the user. Write "the load code raises no error",
  not "reports nothing".
- **Truthiness has more falsy values than you list.** A `!!value` coercion makes
  `false`, `0`, `""` and `null` false, and everything else true, the strings
  `"false"` and `"0"` included.
- **An untraced helper bounds the claim.** The combo loader calls a string
  assertion (`Wf.bp`) whose body was not read. So a native boolean in a combo slot
  "is not an accepted item". It is not proved to be ignored silently.[^chef-371-caveat]
- **Name every file a fact came from.** Parameter types and initial values come
  from `allAces.json`, not only from the two JS files.

## Where the result goes

An editor fact is field knowledge. It belongs in `construct3-guide.md` §5 or §7,
whose provenance note carves those sections out ([ADR 0011](/decisions/0011-a-docs-provenance-note-is-part-of-the-move-cost.md)).
It takes **no** ADR 0008 marker. State its provenance in prose instead: the
release, "read, not run", the issue that records the trace, and what was not
checked (other releases, the UI, any path not followed).

When the fact also changes what a tool should do, post the trace on that tool's
issue. A fix designed on the issue's premise can be wrong where the trace splits
cases. construct3-chef#371's proposed "accept only a native `true`/`false`" is
wrong for the `set-boolean-*` dropdown, which needs the item string.[^chef-371-caveat]

[^chef-371-trace]: The #182 trace of boolean and combo parameter loading at r495-2, posted on construct3-chef#371.

[^chef-371-caveat]: The follow-up caveat on construct3-chef#371: the combo slot takes item strings, and its string assertion was not traced.

[^c3source-123]: c3source#123, the item-name facts traced at r495-2, with the three bundle hashes.

## Related

- [Verifying docs/c3 against construct3-sample](/verifying-against-construct3-sample.md) — the ground truth for structural facts, and trap 6 on where an editor fact may live.
- [The knowledge boundaries](/knowledge-boundaries.md) — platform facts belong in `plugin/docs/c3`, tool facts in chef.
