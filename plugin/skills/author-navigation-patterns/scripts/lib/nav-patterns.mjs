// Pure helper functions for previewing navigation-convention patterns.
// Mirrors construct3-chef's own matching semantics (navConvention.js) so the
// local preview agrees with the authoritative `navigation-graph` CLI output.
//
// No fs, no process — all pure functions on strings/arrays.

// ---- compilePattern ---------------------------------------------------------

/**
 * Compile a regex source string, capturing whether it succeeded and how many
 * capture groups the resulting pattern has.
 *
 * @param {string} src  Raw regex source (no surrounding slashes or flags).
 * @returns {{ source: string, regex: RegExp|null, error: string|null, groupCount: number }}
 */
export function compilePattern(src) {
  let regex = null;
  let error = null;
  let groupCount = 0;

  try {
    regex = new RegExp(src);
    // Count capture groups via the "append |" trick:
    // new RegExp(src + '|').exec('') returns an array whose length - 1 equals
    // the number of capture groups (each group is undefined in the empty branch).
    groupCount = new RegExp(src + '|').exec('').length - 1;
  } catch (err) {
    error = err.message;
  }

  return { source: src, regex, error, groupCount };
}

// ---- classifyLines ----------------------------------------------------------

/**
 * Classify each line of DSL text against the candidate convention.
 *
 * Chef's algorithm (mirrored exactly):
 *  - definitionMarkers: substring match (not regex) → skip those lines
 *  - targetPatterns: compiled to RegExp; bad patterns are dropped (never throw)
 *  - capture group 1 of the first matching valid pattern = the target name
 *
 * Additional heuristics added by this helper (not in chef but useful for preview):
 *  - definitionFalseMatches: lines that look like function definitions of the
 *    wrapper AND match a pattern, but are NOT covered by any definitionMarker.
 *  - uncapturedCalls: lines that call the wrapper but are not captured by any
 *    valid pattern and are not definition lines (likely dynamic/non-literal arg).
 *
 * @param {string} dslText  The raw DSL content (may contain multiple lines).
 * @param {{
 *   targetPatterns: string[],
 *   definitionMarkers?: string[],
 *   wrapperName?: string,
 * }} options
 * @returns {{
 *   patterns: Array<{ source: string, valid: boolean, groupCount: number, error: string|null }>,
 *   captures: Array<{ lineNo: number, line: string, target: string, patternSource: string }>,
 *   skipped: Array<{ lineNo: number, line: string, marker: string, patternSource: string }>,
 *   definitionFalseMatches: Array<{ lineNo: number, line: string, patternSource: string }>,
 *   uncapturedCalls: Array<{ lineNo: number, line: string }>,
 * }}
 */
export function classifyLines(dslText, { targetPatterns, definitionMarkers = [], wrapperName } = {}) {
  // 1. Compile patterns — bad patterns are dropped per chef's contract.
  const compiled = (targetPatterns ?? []).map((src) => {
    const { source, regex, error, groupCount } = compilePattern(src);
    const valid = regex !== null && groupCount === 1;
    return { source, regex, error, groupCount, valid };
  });

  // Public per-pattern info (without the internal regex reference).
  const patterns = compiled.map(({ source, valid, groupCount, error }) => ({
    source,
    valid,
    groupCount,
    error,
  }));

  // Only valid (exactly one capture group) patterns are used for matching.
  const activePatterns = compiled.filter((p) => p.valid);

  const captures = [];
  const skipped = [];
  const definitionFalseMatches = [];
  const uncapturedCalls = [];

  const lines = dslText === '' ? [] : dslText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    // Find which valid patterns match this line.
    const matchingPatterns = activePatterns.filter((p) => p.regex.test(line));

    if (matchingPatterns.length === 0) {
      // No pattern matched. Check for uncaptured wrapper calls.
      if (wrapperName && isWrapperCall(line, wrapperName) && !isDefinitionLine(line, definitionMarkers)) {
        uncapturedCalls.push({ lineNo, line });
      }
      continue;
    }

    // At least one pattern matched. Apply chef's skip semantics first:
    // if any definitionMarker substring is present → the line is skipped.
    const hitMarker = definitionMarkers.find((m) => line.includes(m));
    if (hitMarker) {
      // Record the first matching pattern's source for context.
      skipped.push({
        lineNo,
        line,
        marker: hitMarker,
        patternSource: matchingPatterns[0].source,
      });
      continue;
    }

    // Not a definition (by marker). Check if it looks like a function definition
    // of the wrapper that is NOT covered by any marker — if so, it will pollute
    // the navigation graph and should be flagged.
    if (looksLikeWrapperDefinition(line, wrapperName)) {
      definitionFalseMatches.push({
        lineNo,
        line,
        patternSource: matchingPatterns[0].source,
      });
      continue;
    }

    // Regular call line — use capture group 1 of the first matching pattern.
    const firstPattern = matchingPatterns[0];
    const m = firstPattern.regex.exec(line);
    const target = m ? m[1] : null;

    if (target !== null) {
      captures.push({
        lineNo,
        line,
        target,
        patternSource: firstPattern.source,
      });
    }
  }

  return { patterns, captures, skipped, definitionFalseMatches, uncapturedCalls };
}

// ---- private helpers --------------------------------------------------------

/**
 * Returns true when the line contains a definition-marker substring.
 * An empty markers array always returns false.
 */
function isDefinitionLine(line, markers) {
  return markers.some((m) => line.includes(m));
}

/**
 * Heuristic: the line contains `function ` AND (if wrapperName is given) the
 * wrapper's name — so it looks like a JS/TS function declaration for the wrapper.
 */
function looksLikeWrapperDefinition(line, wrapperName) {
  if (!line.includes('function ')) return false;
  if (wrapperName && !line.includes(wrapperName)) return false;
  return true;
}

/**
 * Heuristic: the line calls the wrapper function.
 * Handles two call forms chef recognises:
 *  - Event-sheet action:  "call <wrapperName>("
 *  - Script/TS call:      "<wrapperName>("
 */
function isWrapperCall(line, wrapperName) {
  return (
    line.includes(`call ${wrapperName}(`) ||
    line.includes(`${wrapperName}(`)
  );
}

// ---- renderReport -----------------------------------------------------------

/**
 * Render a Markdown preview report from the result of classifyLines().
 * Style matches audit.mjs: ## heading, bullet lists, ✓/⚠ markers, summary.
 *
 * @param {{
 *   patterns: Array<{ source: string, valid: boolean, groupCount: number, error: string|null }>,
 *   captures: Array<{ lineNo: number, line: string, target: string, patternSource: string }>,
 *   skipped: Array<{ lineNo: number, line: string, marker: string, patternSource: string }>,
 *   definitionFalseMatches: Array<{ lineNo: number, line: string, patternSource: string }>,
 *   uncapturedCalls: Array<{ lineNo: number, line: string }>,
 * }} result
 * @returns {string}
 */
export function renderReport(result) {
  const { patterns, captures, skipped, definitionFalseMatches, uncapturedCalls } = result;
  const lines = [];

  lines.push('## Navigation Pattern Preview');
  lines.push('');

  // --- Patterns section ---
  lines.push('### Patterns');
  if (patterns.length === 0) {
    lines.push('_No patterns provided — chef will use built-in defaults._');
  } else {
    for (const p of patterns) {
      if (p.valid) {
        lines.push(`- ✓ \`${p.source}\` — valid (${p.groupCount} capture group)`);
      } else if (p.error) {
        lines.push(`- ⚠ \`${p.source}\` — **invalid regex**: ${p.error}`);
      } else {
        lines.push(
          `- ⚠ \`${p.source}\` — **wrong group count**: has ${p.groupCount}, need exactly 1`,
        );
      }
    }
  }
  lines.push('');

  // --- Captures section ---
  lines.push('### Captures (navigation targets found)');
  if (captures.length === 0) {
    lines.push('_No lines matched._');
  } else {
    for (const c of captures) {
      lines.push(`- Line ${c.lineNo}: \`${c.target}\` — \`${c.line}\``);
    }
  }
  lines.push('');

  // --- Skipped section ---
  if (skipped.length > 0) {
    lines.push('### Skipped (definition markers matched — correctly excluded)');
    for (const s of skipped) {
      lines.push(`- Line ${s.lineNo}: marker \`${s.marker}\` — \`${s.line}\``);
    }
    lines.push('');
  }

  // --- Definition false-matches ---
  if (definitionFalseMatches.length > 0) {
    lines.push('### ⚠ Definition False-Matches (will pollute navigation graph)');
    lines.push(
      '_These lines look like function definitions matched by a pattern but are NOT covered by any `definitionMarkers` entry. Add a marker to exclude them._',
    );
    for (const d of definitionFalseMatches) {
      lines.push(`- Line ${d.lineNo}: \`${d.line}\``);
    }
    lines.push('');
  }

  // --- Uncaptured calls ---
  if (uncapturedCalls.length > 0) {
    lines.push('### ⚠ Uncaptured Calls (dynamic / non-literal targets)');
    lines.push(
      '_These lines call the wrapper but were not captured by any pattern. The navigation convention will miss them — likely because the argument is a variable, not a string literal._',
    );
    for (const u of uncapturedCalls) {
      lines.push(`- Line ${u.lineNo}: \`${u.line}\``);
    }
    lines.push('');
  }

  // --- Summary ---
  const validPatternCount = patterns.filter((p) => p.valid).length;
  const invalidPatternCount = patterns.length - validPatternCount;

  lines.push('### Summary');
  lines.push(
    `- ${validPatternCount} of ${patterns.length} pattern${patterns.length === 1 ? '' : 's'} valid.`,
  );
  lines.push(`- ${captures.length} capture${captures.length === 1 ? '' : 's'} found.`);
  if (skipped.length > 0) {
    lines.push(`- ${skipped.length} definition line${skipped.length === 1 ? '' : 's'} correctly skipped.`);
  }
  if (definitionFalseMatches.length > 0) {
    lines.push(
      `- ⚠ ${definitionFalseMatches.length} definition false-match${definitionFalseMatches.length === 1 ? '' : 'es'} — add markers to exclude.`,
    );
  }
  if (uncapturedCalls.length > 0) {
    lines.push(
      `- ⚠ ${uncapturedCalls.length} uncaptured call${uncapturedCalls.length === 1 ? '' : 's'} — likely dynamic targets.`,
    );
  }
  if (invalidPatternCount > 0) {
    lines.push(
      `- ⚠ ${invalidPatternCount} invalid pattern${invalidPatternCount === 1 ? '' : 's'} — fix before writing config.`,
    );
  }

  return lines.join('\n');
}
