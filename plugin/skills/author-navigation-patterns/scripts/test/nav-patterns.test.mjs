// node --test nav-patterns.test.mjs
// Unit tests for the nav-patterns helper lib used by the
// author-navigation-patterns skill.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compilePattern,
  classifyLines,
  renderReport,
} from '../lib/nav-patterns.mjs';

// ---- compilePattern tests ---------------------------------------------------

test('compilePattern: valid one-group pattern → regex set, no error, groupCount 1', () => {
  const result = compilePattern('GoToLayout\\("([^"]+)"');
  assert.ok(result.regex instanceof RegExp, 'regex should be a RegExp');
  assert.equal(result.error, null);
  assert.equal(result.groupCount, 1);
  assert.equal(result.source, 'GoToLayout\\("([^"]+)"');
});

test('compilePattern: bad regex → regex null, error message set', () => {
  const result = compilePattern('GoToLayout(');
  assert.equal(result.regex, null);
  assert.ok(typeof result.error === 'string' && result.error.length > 0, 'error should be a non-empty string');
  assert.equal(result.groupCount, 0);
});

test('compilePattern: zero-group pattern → valid regex, groupCount 0', () => {
  const result = compilePattern('GoToLayout\\("[^"]+"');
  assert.ok(result.regex instanceof RegExp);
  assert.equal(result.error, null);
  assert.equal(result.groupCount, 0);
});

test('compilePattern: two-group pattern → valid regex, groupCount 2', () => {
  const result = compilePattern('GoToLayout\\("([^"]+)",\\s*"([^"]+)"');
  assert.ok(result.regex instanceof RegExp);
  assert.equal(result.error, null);
  assert.equal(result.groupCount, 2);
});

// ---- classifyLines: basic capture -------------------------------------------

test('capture: call line matches pattern → appears in captures with correct target', () => {
  const dsl = 'do: call GoToLayout("Title")';
  const result = classifyLines(dsl, {
    targetPatterns: ['GoToLayout\\("([^"]+)"'],
  });

  assert.equal(result.patterns.length, 1);
  assert.equal(result.patterns[0].valid, true);
  assert.equal(result.captures.length, 1);
  assert.equal(result.captures[0].target, 'Title');
  assert.equal(result.captures[0].lineNo, 1);
  assert.equal(result.captures[0].line, 'do: call GoToLayout("Title")');
  assert.equal(result.skipped.length, 0);
});

// ---- classifyLines: definition-marker skip ----------------------------------

test('skip: definition line with marker → lands in skipped, not captures', () => {
  // The definition line must also match the pattern for skip semantics to apply
  // (chef only tests markers on lines that already matched a pattern).
  // Use a JSDoc/comment-style definition that contains a literal string arg:
  //   * @example function GoToLayout("SomeName")
  const dsl = [
    '// function GoToLayout("SomeName") - wrapper definition example',
    '  do: call GoToLayout("Title")',
  ].join('\n');

  const result = classifyLines(dsl, {
    targetPatterns: ['GoToLayout\\("([^"]+)"'],
    definitionMarkers: ['function GoToLayout'],
  });

  // line 1 matches the pattern AND contains the marker → skipped
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].lineNo, 1);
  assert.equal(result.skipped[0].marker, 'function GoToLayout');

  // line 2 is a real call → captured
  assert.equal(result.captures.length, 1);
  assert.equal(result.captures[0].target, 'Title');
});

// ---- classifyLines: definition false-match ----------------------------------

test('definitionFalseMatch: definition line matched by pattern but NO covering marker → flagged', () => {
  const dsl = 'function GoToLayout(layoutName) {}';

  // Pattern would match this line if it happened to call GoToLayout("something")
  // but we need a line that BOTH looks like a function definition AND matches the pattern.
  // Use a pattern broad enough to match the function definition line.
  const result = classifyLines(dsl, {
    targetPatterns: ['(GoToLayout)'],
    // No definitionMarkers — so this definition line is NOT covered
    wrapperName: 'GoToLayout',
  });

  assert.equal(result.definitionFalseMatches.length, 1);
  assert.equal(result.definitionFalseMatches[0].lineNo, 1);
  // This line must NOT appear in captures (false-match takes priority)
  assert.equal(result.captures.length, 0);
});

test('definitionFalseMatch: definition line covered by marker → in skipped, NOT in definitionFalseMatches', () => {
  const dsl = 'function GoToLayout(layoutName) {}';

  const result = classifyLines(dsl, {
    targetPatterns: ['(GoToLayout)'],
    definitionMarkers: ['function GoToLayout'],
    wrapperName: 'GoToLayout',
  });

  assert.equal(result.skipped.length, 1);
  assert.equal(result.definitionFalseMatches.length, 0);
});

// ---- classifyLines: uncaptured calls ----------------------------------------

test('uncapturedCalls: dynamic target (no quotes) with wrapperName → lands in uncapturedCalls', () => {
  const dsl = 'do: call GoToLayout(nextLevel)';

  const result = classifyLines(dsl, {
    targetPatterns: ['GoToLayout\\("([^"]+)"'],
    wrapperName: 'GoToLayout',
  });

  // The literal-string pattern does not match the variable-arg call
  assert.equal(result.captures.length, 0);
  assert.equal(result.uncapturedCalls.length, 1);
  assert.equal(result.uncapturedCalls[0].lineNo, 1);
  assert.equal(result.uncapturedCalls[0].line, 'do: call GoToLayout(nextLevel)');
});

test('uncapturedCalls: no wrapperName → uncapturedCalls is empty even for dynamic calls', () => {
  const dsl = 'do: call GoToLayout(nextLevel)';

  const result = classifyLines(dsl, {
    targetPatterns: ['GoToLayout\\("([^"]+)"'],
    // wrapperName deliberately omitted
  });

  assert.equal(result.uncapturedCalls.length, 0);
});

// ---- classifyLines: multiple patterns ---------------------------------------

test('multiple patterns: both contribute captures', () => {
  const dsl = [
    'do: call GoToLayout("Title")',
    'System.go-to-layout(layout=Menu)',
  ].join('\n');

  const result = classifyLines(dsl, {
    targetPatterns: [
      'GoToLayout\\("([^"]+)"',
      'System\\.go-to-layout\\(layout=([^,)]+)',
    ],
  });

  assert.equal(result.patterns.length, 2);
  assert.ok(result.patterns.every((p) => p.valid), 'both patterns should be valid');
  assert.equal(result.captures.length, 2);

  const targets = result.captures.map((c) => c.target);
  assert.ok(targets.includes('Title'), 'should capture Title');
  assert.ok(targets.includes('Menu'), 'should capture Menu');
});

// ---- classifyLines: bad regex dropped ---------------------------------------

test('bad regex dropped: classifyLines marks it invalid and ignores it, does not throw', () => {
  const dsl = 'do: call GoToLayout("Title")';

  let result;
  assert.doesNotThrow(() => {
    result = classifyLines(dsl, {
      targetPatterns: ['GoToLayout('], // invalid regex
    });
  });

  assert.equal(result.patterns.length, 1);
  assert.equal(result.patterns[0].valid, false);
  assert.ok(result.patterns[0].error, 'error message should be set');
  assert.equal(result.captures.length, 0);
});

// ---- classifyLines: group-count enforcement ---------------------------------

test('one-group pattern → valid: true', () => {
  const result = classifyLines('', {
    targetPatterns: ['GoToLayout\\("([^"]+)"'],
  });
  assert.equal(result.patterns[0].valid, true);
  assert.equal(result.patterns[0].groupCount, 1);
});

test('zero-group pattern → valid: false, correct groupCount', () => {
  const result = classifyLines('', {
    targetPatterns: ['GoToLayout\\("[^"]+"'],
  });
  assert.equal(result.patterns[0].valid, false);
  assert.equal(result.patterns[0].groupCount, 0);
});

test('two-group pattern → valid: false, correct groupCount', () => {
  const result = classifyLines('', {
    targetPatterns: ['GoToLayout\\("([^"]+)",\\s*"([^"]+)"'],
  });
  assert.equal(result.patterns[0].valid, false);
  assert.equal(result.patterns[0].groupCount, 2);
});

// ---- built-in System form ---------------------------------------------------

test('built-in System.go-to-layout-by-name form captures correctly', () => {
  const dsl = 'System.go-to-layout-by-name(layout="Menu")';

  const result = classifyLines(dsl, {
    targetPatterns: ['System\\.go-to-layout-by-name\\(layout="([^"]+)"'],
  });

  assert.equal(result.captures.length, 1);
  assert.equal(result.captures[0].target, 'Menu');
  assert.equal(result.captures[0].lineNo, 1);
});

// ---- renderReport smoke test ------------------------------------------------

test('renderReport: returns a non-empty Markdown string with summary line', () => {
  const result = classifyLines(
    [
      'function GoToLayout(layoutName) {}',
      'do: call GoToLayout("Title")',
      'do: call GoToLayout(someVar)',
    ].join('\n'),
    {
      targetPatterns: ['GoToLayout\\("([^"]+)"'],
      definitionMarkers: ['function GoToLayout'],
      wrapperName: 'GoToLayout',
    },
  );

  const report = renderReport(result);
  assert.ok(typeof report === 'string' && report.length > 0, 'report should be a non-empty string');
  assert.ok(report.includes('#'), 'report should have at least one Markdown heading');
  // Must include a summary line
  assert.ok(
    report.match(/\d+ capture/i) || report.match(/Summary/i),
    'report should contain a summary section or capture count',
  );
});

// ---- lineNo 1-based ---------------------------------------------------------

test('lineNo is 1-based: first line is lineNo 1', () => {
  const dsl = 'do: call GoToLayout("First")';
  const result = classifyLines(dsl, {
    targetPatterns: ['GoToLayout\\("([^"]+)"'],
  });
  assert.equal(result.captures[0].lineNo, 1);
});

test('lineNo is 1-based: third line is lineNo 3', () => {
  const dsl = [
    'do: something()',
    'do: other()',
    'do: call GoToLayout("Third")',
  ].join('\n');
  const result = classifyLines(dsl, {
    targetPatterns: ['GoToLayout\\("([^"]+)"'],
  });
  assert.equal(result.captures[0].lineNo, 3);
});

// ---- patternSource attached to captures/skipped/etc. -----------------------

test('patternSource is attached to capture entries', () => {
  const pattern = 'GoToLayout\\("([^"]+)"';
  const result = classifyLines('do: call GoToLayout("Hello")', {
    targetPatterns: [pattern],
  });
  assert.equal(result.captures[0].patternSource, pattern);
});
