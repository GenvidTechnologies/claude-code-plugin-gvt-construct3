---
name: author-navigation-patterns
description: Authors and validates a construct3-chef navigation.targetPatterns / definitionMarkers convention for a project whose navigation routes through a wrapper function. Inspects the extracted DSL to find the wrapper, proposes a capture-group regex, previews captures/skips locally, then validates against the real navigation-graph.
metadata:
  expects:
    tools:
      - command: node
        reason: Runs the regex-preview helper script
      - command: npx
        reason: Runs construct3-chef navigation-graph for authoritative validation
    files:
      - path: construct3-chef.config.json
        base: project
        required: false
        reason: The navigation convention is written here; the file is optional and this skill helps author it, so its absence is informational, not an error.
    mcp:
      - server: construct3-chef
        package: "@genvid/construct3-chef"
        minVersion: "0.7.0"
        reason: The navigation.targetPatterns / definitionMarkers config surface and the navigation-graph subcommand landed in 0.7.0 (construct3-chef#43).
---

# Author Navigation Patterns

Help a user author and validate a **`navigation.targetPatterns`** convention for
construct3-chef, so `navigation-graph` detects a project that routes layout
changes through a **wrapper function** instead of the built-in System action.

**This skill is the intelligence.** It inspects the project's extracted DSL,
reasons about how the wrapper renders, proposes the regex, and validates it. A
bundled helper script gives fast local preview, but the **authoritative**
validator is always `construct3-chef navigation-graph` run against the project.

## When to run

- A project's navigation graph (`npx construct3-chef navigation-graph`) is
  **empty or incomplete** even though the project clearly navigates between
  layouts — usually because navigation goes through a project wrapper function
  (e.g. `GoToLayout("Title")`) that the built-in detection doesn't recognize.
- The user wants to configure `navigation.targetPatterns` for the first time.
- The user asks to author or fix a navigation detection regex.

If the graph is already complete using the built-in `System.go-to-layout` /
`System.go-to-layout-by-name` actions, **no config is needed** — say so and stop.

## Background

How navigation renders in the extracted DSL — built-in forms vs. wrapper call
sites, and the call-site-vs-definition-line pitfall — is documented in
[`${CLAUDE_PLUGIN_ROOT}/docs/c3/layout-reference.md`](../../docs/c3/layout-reference.md)
("Navigation Between Layouts" → "How navigation renders in the extracted DSL").
Read it first. The **field-level schema** of `navigation.targetPatterns` /
`definitionMarkers` is owned by construct3-chef — see `construct3-chef://docs`
(`cli.md`). Key contract points the skill depends on:

- Each `targetPatterns` entry must have **exactly one capture group**; group 1 is
  the resolved target layout name.
- `definitionMarkers` are matched as plain **substrings**; a line containing one
  is treated as a definition and skipped.
- A `targetPattern` that is not a valid regex is **silently dropped** by chef
  (the preview helper below flags it so you catch it before writing config).

## Workflow

### 1. Inspect (the 95% heuristic)

Most projects navigate either with the built-in System actions or through a
**single wrapper** around them — so locating those calls gets you most of the way.

- Resolve the extracted-DSL location: `extractedDir` from
  `construct3-chef.config.json` if present, else the default `extracted/`. Event
  sheets render to `<extractedDir>/eventSheets/*.dsl.txt`; scripts to the
  extracted scripts.
- Read/scan that DSL (the read-only `c3-explorer` agent or chef's `read-dsl` /
  `read-scripts` / `search` tools, or direct file reads). Look for:
  - built-in `System.go-to-layout(layout=…)` / `System.go-to-layout-by-name(layout="…")`
    — **already auto-detected**, no pattern needed;
  - wrapper call sites `do: call <Fn>("<Layout>", …)` (event actions) and bare
    `<Fn>("<Layout>", …)` (scripts).
- Identify the **wrapper function name** and **which argument carries the layout
  name** (inspect its definition and a few call sites).

### 2. Propose

- A `targetPatterns` entry with one capture group on the layout-name literal,
  e.g. `GoToLayout\("([^"]+)"` (capture group = the quoted layout name).
- A `definitionMarkers` entry that is a substring of the wrapper's own definition
  line, e.g. `function GoToLayout` — so the wrapper's definition isn't mistaken
  for a call site.

### 3. Preview locally (fast iteration)

Run the helper to see exactly what the candidate convention captures and skips —
before touching any config:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/author-navigation-patterns/scripts/preview-patterns.mjs" \
  --pattern 'GoToLayout\("([^"]+)"' \
  --marker  'function GoToLayout' \
  --wrapper GoToLayout \
  --dsl     <extractedDir>
```

Read the report's four buckets:

- **captures** — call site → captured target layout. Confirm these are the real
  navigations.
- **skipped** — lines a pattern matched but a `definitionMarker` correctly
  excluded (the wrapper's own definition). Good.
- **definitionFalseMatches** ⚠ — a definition-looking line a pattern matched that
  **no marker covers**. It will pollute the graph — add or widen a
  `definitionMarker`.
- **uncapturedCalls** ⚠ — lines that call the wrapper but no pattern captured —
  typically a **dynamic / non-literal target** (a variable instead of a string
  literal). The convention cannot resolve these to a layout; **surface them to
  the user** rather than contorting the regex.

The helper also reports any pattern that is an invalid regex or doesn't have
exactly one capture group. Iterate until captures match the project's real
navigations with no false matches.

### 4. Validate authoritatively

The preview only predicts; the real check is the tool. With the user's
agreement, write the proposed block into `construct3-chef.config.json` at the
project root (create the file if absent, or merge the `navigation` key into the
existing JSON — never clobber other keys), then run:

```bash
npx construct3-chef navigation-graph
```

Confirm the printed graph contains exactly the project's real layout-to-layout
edges — nothing missing, no phantom edges from a definition line. If it's wrong,
return to step 3. Only present the convention as done once `navigation-graph`
output matches expectations.

## Caveats

- **Don't write config without confirmation.** Propose the `navigation` block,
  show the preview, and write it only when the user agrees.
- **Multiple wrappers** → multiple `targetPatterns` entries (and matching
  `definitionMarkers`). The helper accepts repeated `--pattern` / `--marker`.
- **Dynamic targets can't be captured** — a wrapper called with a variable has no
  literal to match. Report these; they are a project concern, not a regex bug.
- **A bad regex is silently dropped by chef** — rely on the preview helper's
  validity check to catch malformed patterns before they reach config.
