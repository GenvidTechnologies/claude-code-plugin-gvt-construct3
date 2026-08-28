// Pure, disk-free helpers for reducing a gvt-dev audit run to a stable digest.
//
// Why this exists: since docs/ was retired into wiki/ (ADR 0012), this repo's
// audit permanently reports a nonzero set of findings caused by upstream
// defects, not by this repo. Raw audit output cannot be eyeballed for
// regression because the expected state is not "silent". The digest makes the
// comparison mechanical: the counts are known cost, and a *change* in them is
// the signal.
//
// The load-bearing design decision here is that a count which cannot be
// determined must NEVER render as 0. Reporting "no findings" when the truth is
// "the parse broke" is the silent-zero failure this repo has a written rule
// about, and it would defeat the script's entire purpose — a drifted audit
// format would read as a perfectly clean repo.

// A well-formed audit report always ends with a Summary section carrying this
// line. It is the structural anchor that separates "the report is intact and
// this kind genuinely has zero findings" from "this output is not an audit
// report at all". Without an anchor of this sort the two are indistinguishable.
export const SUMMARY_ANCHOR = /^- required: \d+ of \d+ satisfied\./m;

// Substring matched against each output line, per finding kind.
//
// CAVEAT worth keeping: `orphanedDoc`'s pattern has never been exercised
// against a real finding in this repo. The orphan count has been 0 at every
// measurement, and post-migration `scanOrphanedDocs` is inert entirely (it
// resolves a hard-coded `TOC.md` inside the docs root, which an OKF bundle
// named `index.md` never has). So this pattern is inferred from the scanner's
// documented purpose, not confirmed from output. If an orphan finding ever
// does appear and this digest still says 0, suspect this line first.
export const FINDING_PATTERNS = {
  brokenLink: 'broken link',
  retiredToken: 'contains retired token',
  orphanedDoc: 'orphan',
};

export const PARSE_FAILED = null;

/**
 * Reduce raw audit stdout + its exit code to a digest object.
 * Any count that cannot be trusted comes back as PARSE_FAILED (null),
 * never as 0.
 */
export function parseAuditOutput(stdout, exitCode) {
  const text = typeof stdout === 'string' ? stdout : '';
  const intact = SUMMARY_ANCHOR.test(text);

  if (!intact) {
    return {
      intact: false,
      brokenLink: PARSE_FAILED,
      retiredToken: PARSE_FAILED,
      orphanedDoc: PARSE_FAILED,
      exit: Number.isInteger(exitCode) ? exitCode : PARSE_FAILED,
    };
  }

  const lines = text.split('\n');
  const countOf = (needle) => lines.filter((l) => l.includes(needle)).length;

  return {
    intact: true,
    brokenLink: countOf(FINDING_PATTERNS.brokenLink),
    retiredToken: countOf(FINDING_PATTERNS.retiredToken),
    orphanedDoc: countOf(FINDING_PATTERNS.orphanedDoc),
    exit: Number.isInteger(exitCode) ? exitCode : PARSE_FAILED,
  };
}

/** Render a digest as the four canonical lines, in fixed order. */
export function formatDigest(digest) {
  const cell = (v) => (v === PARSE_FAILED ? 'PARSE-FAILED' : String(v));
  return [
    `broken-link: ${cell(digest.brokenLink)}`,
    `retired-token: ${cell(digest.retiredToken)}`,
    `orphaned-doc: ${cell(digest.orphanedDoc)}`,
    `exit: ${cell(digest.exit)}`,
  ].join('\n');
}

/** True when every field parsed cleanly — the CLI's own exit condition. */
export function isClean(digest) {
  return (
    digest.intact === true &&
    digest.brokenLink !== PARSE_FAILED &&
    digest.retiredToken !== PARSE_FAILED &&
    digest.orphanedDoc !== PARSE_FAILED &&
    digest.exit !== PARSE_FAILED
  );
}
