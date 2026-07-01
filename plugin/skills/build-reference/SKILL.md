---
name: build-reference
description: Produces construct3-chef's c3-reference cache (`<extractedDir>/c3-reference/index.json`) so its `search-docs` tool can look up built-in plugin ACEs, layout/scripting docs, and the Expression language — coverage that needs the cache (custom-addon ACEs already work live). Built-in ACE shape comes deterministically from the C3 editor CDN's `allAces.json`; descriptions and concept chunks come from the C3 manual PDF, joined onto the CDN shape. A deliberate, human-run step.
metadata:
  expects:
    tools:
      - command: node
        reason: Runs the bundled index assembler/validator (scripts/build-index.mjs)
      - command: npx
        reason: Runs construct3-chef search-docs to validate the produced cache against the real tool
    files:
      - path: construct3-chef.config.json
        base: project
        required: false
        reason: Optional — only needed to read a non-default `extractedDir`; the cache path derives from it (defaults to `extracted/`).
    mcp:
      - server: construct3-chef
        package: "@genvidtech/construct3-chef"
        minVersion: "0.9.0"
        reason: The `search-docs` tool and the `c3-reference` cache contract (ReferenceIndexSchema, loadReferenceCache) landed in 0.9.0 (construct3-chef#87).
---

# Build Reference

Produce the **`c3-reference` cache** that construct3-chef's `search-docs` reads:
`<extractedDir>/c3-reference/index.json`. With a valid cache present, `search-docs`
can answer lookups for **built-in plugin ACEs** (Sprite/System/Text…), **layout**
and **scripting** docs, and the **Expression language** — none of which work
without it. (Custom-addon ACEs always work: chef reads `addons/*/aces.json` live.)

**This skill is the producer; chef is the consumer.** chef deliberately ships no
PDF/network dependency and does no fetching at query time. This skill is the
counterpart: a **deliberate, human-run** step that fetches the CDN ACE data,
reads the manual for descriptions and concept prose, and writes the cache chef
then reads offline. Run it rarely (e.g. when the C3 editor revision advances),
not per query.

## When to run

- A project's `search-docs` returns built-in/layout/scripting/expression results
  that say *"no c3-reference cache"* (only custom-addon ACEs are available) and you
  want full coverage.
- The C3 editor revision has advanced and the cache should be regenerated.
- First-time setup of the reference cache for a project.

If `search-docs` already resolves built-in ACEs and concept lookups, the cache is
present and current — say so and stop.

## What it produces (and what it must NOT)

The cache schema (`ReferenceIndexSchema`) is **owned by construct3-chef** — see
`construct3-chef://docs` and chef's `src/c3/c3Reference.ts`. In brief, `index.json`
is `{ schemaVersion, manualVersion, generatedAt, aces?, chunks? }` where each ACE is
`{ source, objectClass, kind, id, scriptName?, params:[{name,type}], description?,
canonicalUrl? }` and each chunk is `{ title, text, canonicalUrl, category }`
(`canonicalUrl` is **required** on chunks).

This skill writes exactly two kinds of entry:

- **Built-in ACEs** — `source: "builtin"`, shape from the CDN, descriptions joined
  from the manual.
- **Concept chunks** — prose for `category` ∈ `layout` / `scripting` / `expression`
  / `plugin`.

> **Do NOT cache custom-addon ACEs.** chef's `lookup()` merges **live** addon ACEs
> (read from `addons/*/aces.json` every query) **with** `cache.aces`. Writing addon
> ACEs into the cache would make every one appear **twice**. The cache is built-ins
> + chunks only. For the `aces.json` structure itself (and why built-ins have none),
> see [`../../docs/c3/ace-reference.md`](../../docs/c3/ace-reference.md).

## Sourcing (the hard part)

### ACE shape — editor CDN `allAces.json` (authoritative)

Built-in ACE **shape** comes from the C3 editor CDN — plain JSON, fetchable with
Node global `fetch` or `curl`, **not** Cloudflare-walled:

```
https://editor.construct.net/<rev>/plugins/allAces.json
https://editor.construct.net/<rev>/behaviors/allAces.json
```

`<rev>` is the editor revision string (e.g. `r476-4`), readable from the editor's
network tab. The JSON shape is:

```json
{ "PluginKey": { "category": { "conditions|actions|expressions": [ entries ] } } }
```

Each entry carries a real kebab `id`, `scriptName`/`expressionName`, **params with
real types** (`cmp`, `combo`, `object`, `layer`, `number`, `string`, `any`, …),
`returnType`, and `isTrigger`. This gives built-in ACE shape **deterministically,
with full coverage** — no heuristic table parsing.

`fetch-aces.mjs` wraps the fetch: it downloads both `plugins/allAces.json` and
`behaviors/allAces.json`, flattens each via the CDN lib, and writes a unified
`cdn-aces.json` record array. A 404 on fetch means `<rev>` is stale or wrong —
re-read it from the editor's network tab.

> **`effects/allEffects.json` is also present on the CDN** (shader effects, not ACEs)
> — fetched-but-out-of-scope for this skill.

### Descriptions + concept chunks — C3 manual PDF

The CDN `allAces.json` carries **no human text** (no display names, no descriptions).
Descriptions and all concept prose come from the C3 manual PDF, which is
version-pinned and served from a CDN — reachable for an automated read. Pull in
temporary PDF text-extraction tooling on demand; do not add a standing dependency.

> **Dead end — editor `blob:` descriptions.** The editor loads its own ACE
> descriptions via ephemeral `blob:` URLs (in-memory objects, dynamically generated
> per session). These are **not** statically fetchable. They are also less complete
> than the manual. Do **not** attempt to use them.

> **construct.net is Cloudflare-challenge-walled** (`HTTP 403`, `Cf-Mitigated:
> challenge`) — **not** machine-fetchable. Its per-page *"View online"* URLs are
> still valuable as the **`canonicalUrl` anchor** strings on entries.

### The description join (`merge.mjs`)

`merge.mjs` joins manual descriptions onto CDN records. The join is two-tier:

1. **Tier 1 — exact name match:** normalize both sides (strip non-alphanumerics,
   lowercase) and compare.
2. **Tier 2 — token-subset fallback:** manual display-name tokens ⊆ `scriptName`
   tokens (handles cases like `IsAnimPlaying` ↔ "Is playing").

Unmatched CDN records pass through unchanged — **CDN shape is always authoritative.**
Description-join coverage is **best-effort** (~80% typical; higher for plugins a
project actually uses; shortfall is deprecated/platform plugins the manual barely
documents). The script prints a per-objectClass coverage report — read it and report
gaps honestly.

**Plugin-name alias note:** CDN objectClass keys differ from manual slugs in a few
known cases (`system`→`System`, `TiledBg`↔`tiled-background`, `NinePatch`↔`9-patch`).
chef matches objectClass case-insensitively for lookups, so *queries* are unaffected,
but the *description join* needs these aliases. `merge.mjs` ships a default alias map
covering the known cases; override with `--alias-map <file>` if your manual uses
different slugs (the override **replaces**, not merges over, the default — supply all
necessary aliases explicitly).

### Chunk-extraction heuristics (chunks only, not ACE shape)

These heuristics apply only when extracting **concept chunks** from the manual PDF.
ACE shape is now deterministic from the CDN; these no longer touch ACE extraction:

- **System-object pagination:** `system-reference/system-{conditions,actions,expressions}`
  are separate PDF pages — derive `kind` from the URL, force `objectClass` to `System`.
- **System category-divider denylist:** headings like Display / General / Layers /
  … are group labels inside the system-reference pages, not ACE names — skip them.
- **Wrapped "View online:" URLs:** PDF line-breaks can split URLs; rejoin lines ending
  in `-` or `/` before parsing `canonicalUrl`.
- **Trailing ALL-CAPS title bleed:** the next section's heading sometimes leaks into
  the prior section's body text — trim it from chunk prose.

## Procedure

1. **Resolve the cache path.** `extractedDir` defaults to `extracted/`; if the
   project's `construct3-chef.config.json` sets `extractedDir`, use that. The cache
   path is `<extractedDir>/c3-reference/index.json`. (See
   [`../../docs/c3/toolchain-config.md`](../../docs/c3/toolchain-config.md) for the
   cwd/config model.)

2. **Confirm the `.gitignore` covers it.** chef's shipped `.gitignore` ignores
   `extracted/c3-reference/`. If `extractedDir` is customized (e.g. `c3-extracted`),
   make sure `c3-extracted/c3-reference/` is ignored before writing — the cache is
   large and **copyright-bearing**; it must never be committed.

3. **Identify the editor revision.** Read `<rev>` from the editor's network tab
   (e.g. `r476-4`). This becomes the version component of `--manual-version`; it also
   selects the exact CDN snapshot to fetch.

4. **Fetch CDN ACE shape:**
   ```bash
   node scripts/fetch-aces.mjs --rev r476-4 --out cdn-aces.json
   ```
   This downloads `plugins/allAces.json` + `behaviors/allAces.json` for that revision,
   flattens them, and writes `cdn-aces.json`. For offline/testing use
   `--input <local-allAces.json>` instead of `--rev`.

5. **Extract concept chunks + manual descriptions from the PDF**, applying the chunk
   heuristics above. Produce two temporary files:
   - `chunks.json` — a JSON array of concept chunk objects (layout/scripting/expression/
     plugin prose), each with its `canonicalUrl` *View online* anchor.
   - `manual-descriptions.json` — a JSON array of
     `{ objectClass, kind, name, description, canonicalUrl? }` records extracted from
     the ACE reference tables.

   Use temporary PDF text-extraction tooling on demand. Log what was and was not
   extracted; partial coverage is expected and fine.

6. **Join descriptions onto CDN shape:**
   ```bash
   node scripts/merge.mjs \
     --aces cdn-aces.json \
     --descriptions manual-descriptions.json \
     --out builtin-aces.json
   ```
   Read the coverage report it prints. If description coverage is lower than expected,
   check whether `--alias-map` is needed for this manual's slugs. Unmatched ACEs still
   pass through (CDN shape intact) — coverage shortfall is not a blocking error.

7. **Assemble + validate + write** with the bundled deterministic seam:
   ```bash
   node scripts/build-index.mjs \
     --manual-version r476-4+manual-2026-06-11 \
     --out <extractedDir>/c3-reference/index.json \
     --aces builtin-aces.json \
     --chunks chunks.json
   ```
   `--manual-version` encodes the editor revision + the date you pulled the manual
   (e.g. `r476-4+manual-2026-06-11`) — the revision is machine-readable from the CDN
   URL; the date records description-data provenance. `build-index.mjs` validates
   against chef's schema shape and refuses to write an invalid cache.

8. **Validate against the real tool.** The bundled validator is only a *preview*;
   the authoritative check is chef itself. Run, e.g.:
   ```bash
   npx construct3-chef search-docs --object Sprite --query position
   npx construct3-chef search-docs --query "expression"
   ```
   Confirm the *"no c3-reference cache"* note is gone and built-in + concept lookups
   now resolve. If chef rejects the cache, its `loadReferenceCache` silently returns
   `null` (the note reappears) — re-check the schema with the assembler's errors.

9. **Clean up** the temporary files (`cdn-aces.json`, `manual-descriptions.json`,
   `builtin-aces.json`, `chunks.json`) and any PDF tooling pulled in. Leave only the
   gitignored cache.

## Guardrails

- **Copyright:** write only to the gitignored cache path; never commit manual text,
  and never write manual prose anywhere tracked.
- **No addon ACEs in the cache** (double-count — see above). chef merges live addon
  ACEs with `cache.aces` without dedup; a self-enforcing guard upstream is tracked in
  construct3-chef#91.
- **No network at query time:** all fetching (CDN + manual) happens here, in this
  human-run step, by design — chef stays offline when answering.
- **Honesty over coverage:** ACE *shape* is authoritative and complete (100% from
  CDN). Description-join *coverage* is best-effort — report gaps from the merge
  coverage report rather than implying descriptions are complete.
