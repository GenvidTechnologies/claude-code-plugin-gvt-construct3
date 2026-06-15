---
name: create-c3-op
description: Authors and dry-run-validates a construct3-chef user-defined op (a parameterized recipe template) — the op wrapper only; recipe body content is deferred to chef's recipe docs and c3-implementer.
metadata:
  expects:
    tools:
      - command: npx
        reason: Runs construct3-chef list-ops and apply-op --dry-run — the authoritative validators for a user-defined op.
    files:
      - path: construct3-chef.config.json
        required: false
        reason: Optional — only read to resolve a non-default ops.dir (defaults to "ops"). A missing ops block means defaults; its absence is informational, not an error.
    mcp:
      - server: construct3-chef
        package: "@genvid/construct3-chef"
        minVersion: "0.10.0"
        reason: User-defined ops (the ops/ directory, list-ops and apply-op CLI/MCP surfaces, OpTemplate substitution) landed in 0.10.0 (construct3-chef #89). The skill is inert below this version.
---

# Create C3 Op

Help a user **author and dry-run-validate** a construct3-chef **user-defined op** — a parameterized recipe template stored as a single JSON file in the project's ops directory. The filename (sans `.json`) is the op name; a valid op registers as an MCP `op-<name>` tool and as a CLI `apply-op <name>` subcommand.

**This skill covers the op wrapper only:** `description`, `params`, and `{{PARAM}}` placement within the recipe skeleton. The recipe body's content and syntax are the domain of chef's recipe reference (`construct3-chef://docs`, `recipe-reference.md`) and the `genvid-c3:c3-implementer` agent — this skill places the substitution tokens, not the recipe ops themselves. **This skill is the intelligence; chef is the validator.** `list-ops` and `apply-op --dry-run` are the sole authoritative checks — no `validate-op` command exists.

The skill **never runs a writing `apply-op`**. It stops at a green dry-run and hands real application to the user or `genvid-c3:c3-implementer`.

## When to run

- Authoring a new user-defined op (a recipe you want to reuse with different param values across layouts, object classes, or other axes).
- Validating or fixing an existing op file that fails `list-ops` or `apply-op --dry-run`.

**Decline and stop** if the ask is a one-off recipe with no reuse intent and no params — that is a plain recipe, not an op. Direct the user to chef's recipe reference and hand execution to `genvid-c3:c3-implementer` instead.

## Scope & boundaries

This skill does NOT:

- Author the recipe body inside the op (the `recipe` array's content/syntax — defer to `construct3-chef://docs` → `recipe-reference.md` and `genvid-c3:c3-implementer`).
- Run a writing `apply-op` (dry-run only — never `apply-op <name>` without `--dry-run`).
- Add a bundled helper script — `list-ops` and `apply-op --dry-run` are the entire validation surface.

## Background

The following contract points are the ones this skill's logic branches on. The **full field-level schema** for op files, param shapes, and recipe ops lives in `construct3-chef://docs` (`ops.md`, `recipe-reference.md`) — read it there; do not expect this skill to transcribe it.

**Op file structure.** One JSON file in the ops dir. Required fields: `description` (one-line string), `recipe` (a standard chef recipe). Optional: `params` (array, default `[]`).

**Op name.** The filename sans `.json`. Must match `/^[a-z0-9][a-z0-9-]*$/i`; a name that violates this is skipped at load and surfaces as an error in `list-ops` output.

**Param fields.** Each param: `name` (required), `type` (required — `string | number | boolean`), `description` (optional), `required` (optional, **defaults true**), `default` (optional, must match the declared `type`).

**Substitution model.** `{{PARAM}}` tokens in the recipe:

- A string whose **entire value** is exactly `"{{PARAM}}"` → replaced with the typed value (a `number` param becomes a real JSON number, not a string).
- `{{PARAM}}` **embedded** inside a larger string (e.g. `"Screen_{{P}}"`) → text-interpolated; result is always a string.
- `{{PARAM}}` in an **object key** → always text-interpolated.

**Four pre-write guards** (aggregated into one error by chef): missing required param, unknown argument, unresolved leftover `{{token}}`, recipe-validation failure. All four run on `--dry-run` — none require a write.

**Ops dir.** Configured via the `ops.dir` key in `construct3-chef.config.json`'s `ops` block (default `"ops"`). The path is contained to the project root; a path that escapes the root falls back to `<root>/ops` with a chef warning — resolve the effective directory, not the configured string.

**Authoritative validators.** `npx construct3-chef list-ops` confirms the op loaded and shows its params; `npx construct3-chef apply-op <name> --dry-run` runs all four guards with no writes. (`--preview` implies `--dry-run` and additionally shows a diff.)

## Workflow

### 1. Resolve the effective ops dir

Read the `ops.dir` value from `construct3-chef.config.json` if the file exists and has an `ops` block; otherwise default to `ops/`. Resolve the path relative to the project root — the path-containment rule means a configured path that tries to escape (e.g. `../../somewhere`) falls back to `<root>/ops`. Use the resolved path for all subsequent file operations; create the directory when writing if it does not yet exist.

### 2. Elicit typed params

Before authoring anything, establish the op's param list with the user. Three pitfalls to surface explicitly during elicitation:

**(a) `required: false` without a `default` causes an unresolved-token failure at `apply-op`** — chef will report the `{{PARAM}}` as an unresolved leftover when no value is supplied. Either set `required: true` (the default — callers must always supply a value) or supply a `default`. Make this explicit; do not leave an optional param without a default.

**(b) The `default` value's type must match the declared `type`.** A `default: 1` on a `type: string` param is rejected at op load (the op won't appear in `list-ops`). Confirm types and defaults agree before writing.

**(c) Choose the substitution mode deliberately for each placement:**
- Whole-value exact `"{{P}}"` → typed (good for number/boolean params and for string params where you want a clean JSON string, not an interpolated one).
- Embedded `"prefix_{{P}}"` → always string (good for building identifiers like object-class names from a param).
- Object-key `"{{P}}"` → always string (even if the param is typed `number`).

Confirm which placement each param needs before finalizing the skeleton.

### 3. Author the op file — on confirmation only

Propose the complete op JSON (with a recipe skeleton noting where the recipe body should go). **Write the file only when the user explicitly agrees.**

Placement of the recipe body: co-author it with `genvid-c3:c3-implementer` or chef's `recipe-reference.md`. This skill places the `{{PARAM}}` tokens at the agreed positions — it does not design the recipe ops. The recipe is valid only after substitution, so placeholder content is fine at this stage; the dry-run in step 4 validates the post-substitution recipe.

If the ops directory does not exist, create it when writing the file.

### 4. Validate authoritatively

Run both validators in order:

**Step A — `list-ops`:**
```bash
npx construct3-chef list-ops
```
Confirm the new op appears by name and its params are listed correctly. A missing op or a load error means a bad name, invalid JSON, or a type/default mismatch — fix in the file and re-run. A bad op name (regex violation) is silently skipped; a shape error produces a labeled load error.

**Step B — `apply-op --dry-run`:**
```bash
npx construct3-chef apply-op <name> --dry-run \
  --param KEY=VALUE \
  --param KEY2=VALUE2
```
Supply representative values for all required params (and any optional params worth testing). CLI coercion rule: number params use `Number()`; boolean params accept **only** `"true"` or `"false"` — not `"yes"`, `"1"`, `"on"`. For values that are awkward to quote on the CLI (multiline strings, JSON objects), use `--params-file <path>` with a JSON object.

Read chef's aggregated guard error carefully — it names the offending param or token. Map each guard failure back to its cause:
- **Missing required param** → the `--param` call is missing a required param, or the param was declared optional without a default.
- **Unknown argument** → a `--param` key doesn't match any declared param name.
- **Unresolved leftover `{{token}}`** → a token in the recipe has no matching param name (typo in the token or the param name).
- **Recipe-validation failure** → the post-substitution recipe is invalid (wrong op name, bad field, extraction-state issue — see Caveats).

Iterate (edit file → `list-ops` → `apply-op --dry-run`) until `list-ops` shows the op cleanly and a representative dry-run completes without errors.

### 5. Stop at green dry-run

Once the dry-run passes, the op file is valid and ready. Hand real application to the user or `genvid-c3:c3-implementer`:

- **MCP:** the `op-<name>` tool (receives already-typed values; the CLI boolean-coercion gotcha does not apply here).
- **CLI:** `npx construct3-chef apply-op <name> --param KEY=VALUE …`

This skill does not run either form with writes.

## Caveats

**Chef version below 0.10.0.** `list-ops` and `apply-op` are absent; the skill cannot validate anything. The `minVersion: "0.10.0"` expects entry surfaces this to the audit. If the installed version is below 0.10.0, say so and stop.

**Recipe-validation failure unrelated to the wrapper.** Chef validates the recipe post-substitution against the project's extracted state. If the project has never been extracted (or the extraction is stale), recipe ops that reference layout names, object classes, or other project entities will fail the recipe-validation guard — not because the op wrapper is wrong, but because the referenced entity doesn't appear in the extracted data. Confirm the project's extracted data is present and current before attributing a recipe-validation failure to the op file (chef produces the `extractedDir` when its server runs; see `construct3-chef://docs` for the extraction/sync model).

**Op name is the filename.** Renaming the file changes the op name; the old name is gone from `list-ops` immediately (no stale registration). If an op disappears after a rename, `list-ops` shows the live set — reconcile by matching filenames to expected names.

**`ops.dir` path-containment fallback.** A configured `ops.dir` that escapes the project root is silently redirected to `<root>/ops` with a chef warning. If the effective ops dir doesn't match the configured value, check for path-escape; the fallback path is where chef actually reads and writes.

**`required: false` without a `default` is a load-time pass, apply-time fail.** The op loads and appears in `list-ops` cleanly, but `apply-op` without that param fails the unresolved-token guard. Always pair optional params with a default.
