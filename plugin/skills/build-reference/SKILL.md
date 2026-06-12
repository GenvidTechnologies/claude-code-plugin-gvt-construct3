---
name: build-reference
description: Produces construct3-chef's c3-reference cache (`<extractedDir>/c3-reference/index.json`) so its `search-docs` tool can look up built-in plugin ACEs, layout/scripting docs, and the Expression language — coverage that needs the cache (custom-addon ACEs already work live). Reads the version-pinned C3 manual PDF (the only machine-reachable source for built-ins), extracts built-in ACE tables + concept prose, and writes a schema-valid cache via a bundled assembler. A deliberate, human-run step.
metadata:
  expects:
    tools:
      - command: node
        reason: Runs the bundled index assembler/validator (scripts/build-index.mjs)
      - command: npx
        reason: Runs construct3-chef search-docs to validate the produced cache against the real tool
    files:
      - path: construct3-chef.config.json
        required: false
        reason: Optional — only needed to read a non-default `extractedDir`; the cache path derives from it (defaults to `extracted/`).
    mcp:
      - server: construct3-chef
        package: "@genvid/construct3-chef"
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
counterpart: a **deliberate, human-run** step that pulls in temporary
PDF-reading tooling, reads the manual, and writes the cache chef then reads
offline. Run it rarely (e.g. when the manual version bumps), not per query.

## When to run

- A project's `search-docs` returns built-in/layout/scripting/expression results
  that say *"no c3-reference cache"* (only custom-addon ACEs are available) and you
  want full coverage.
- The C3 manual version has moved and the cache should be regenerated.
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

- **Built-in ACEs** — `source: "builtin"`, parsed from the manual's per-plugin ACE
  reference.
- **Concept chunks** — prose for `category` ∈ `layout` / `scripting` / `expression`
  / `plugin`.

> **Do NOT cache custom-addon ACEs.** chef's `lookup()` merges **live** addon ACEs
> (read from `addons/*/aces.json` every query) **with** `cache.aces`. Writing addon
> ACEs into the cache would make every one appear **twice**. The cache is built-ins
> + chunks only. For the `aces.json` structure itself (and why built-ins have none),
> see [`../../docs/c3/ace-reference.md`](../../docs/c3/ace-reference.md).

## Sourcing (the hard part)

Built-in ACEs and the conceptual docs exist in only two places, and one is closed:

- **The C3 manual PDF is the only machine-reachable source.** It is version-pinned
  (e.g. `v1769`) and served from a CDN, not behind a challenge — reachable for an
  automated read. This is where built-in ACE tables and concept prose come from.
  Pull in temporary PDF text-extraction tooling on demand to read it; do not add a
  standing dependency.
- **construct.net is Cloudflare-challenge-walled** (`HTTP 403`, `Cf-Mitigated:
  challenge`) — **not** machine-fetchable. Its per-page *"View online"* URLs are
  still valuable as the **`canonicalUrl` anchor** strings on entries.

Treat built-in ACE extraction as **best-effort**: PDF table parsing is heuristic.
**Report what was and was not extracted** — never imply complete coverage. The
concept chunks plus whatever built-in ACEs parse cleanly already light up chef;
partial built-in coverage is fine and honest.

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
3. **Pin the manual version.** Read it from the PDF URL (e.g. `v1769`); this becomes
   `manualVersion`, used by chef for staleness reporting.
4. **Extract concept chunks** from the manual prose (layout, scripting, expression,
   plugin), each with its `canonicalUrl` *View online* anchor. Write them to a
   temporary `chunks.json` (a JSON array of chunk objects).
5. **Extract built-in ACE tables** → built-in ACE records (`source: "builtin"`,
   `objectClass` = plugin name, `kind`, `id`, `params:[{name,type}]`, optional
   `scriptName`/`description`/`canonicalUrl`). Field semantics:
   [`../../docs/c3/ace-reference.md`](../../docs/c3/ace-reference.md). Write them to a
   temporary `builtin-aces.json` (a JSON array). Best-effort — log gaps.
6. **Assemble + validate + write** with the bundled deterministic seam:
   ```bash
   node scripts/build-index.mjs \
     --manual-version v1769 \
     --out <extractedDir>/c3-reference/index.json \
     --aces builtin-aces.json \
     --chunks chunks.json
   ```
   It validates against chef's schema shape and refuses to write an invalid cache.
7. **Validate against the real tool.** The bundled validator is only a *preview*;
   the authoritative check is chef itself. Run, e.g.:
   ```bash
   npx construct3-chef search-docs --object Sprite --query position
   npx construct3-chef search-docs --query "expression"
   ```
   Confirm the *"no c3-reference cache"* note is gone and built-in + concept lookups
   now resolve. If chef rejects the cache, its `loadReferenceCache` silently returns
   `null` (the note reappears) — re-check the schema with the assembler's errors.
8. **Clean up** the temporary record files and any PDF tooling pulled in. Leave only
   the gitignored cache.

## Guardrails

- **Copyright:** write only to the gitignored cache path; never commit manual text,
  and never write manual prose anywhere tracked.
- **No addon ACEs in the cache** (double-count — see above). chef merges live addon
  ACEs with `cache.aces` without dedup; a self-enforcing guard upstream is tracked in
  construct3-chef#91.
- **No network at query time:** all fetching happens here, in this human-run step,
  by design — chef stays offline when answering.
- **Honesty over coverage:** report built-in ACE extraction gaps explicitly rather
  than implying the manual was fully parsed.
