// Pure helper for joining manual-PDF ACE descriptions onto CDN-sourced builtin
// ACE records produced by cdn-aces.mjs.
//
// The CDN `allAces.json` provides the authoritative ACE *shape* — objectClass,
// kind, id, scriptName, params — but carries no human-readable descriptions.
// The manual PDF (or equivalent extraction) provides prose descriptions indexed
// by an approximate display name (e.g. "Is playing", "Compare frame").
//
// This module bridges the two by normalizing and matching names, then merging
// `description` (and `canonicalUrl` if present) onto the CDN record. Unmatched
// ACEs are emitted unchanged — the CDN shape is authoritative for 100% of ACEs;
// descriptions are best-effort coverage.
//
// No fs, no process — all pure functions. The CLI entry owns I/O.

// ---- normalisation & tokenisation ------------------------------------------

/**
 * Normalize a name for exact matching:
 * lowercase + strip ALL non-alphanumeric characters.
 *
 * Examples:
 *   "Compare frame" → "compareframe"
 *   "CompareFrame"  → "compareframe"
 *   "Is playing"    → "isplaying"
 *   "IsAnimPlaying" → "isanimplaying"
 *
 * @param {string} name
 * @returns {string}
 */
export function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Tokenize a name into lowercase alphanumeric tokens by splitting on:
 *   1. Non-alphanumeric character boundaries (spaces, hyphens, underscores, …)
 *   2. camelCase / PascalCase transitions (uppercase letter following a
 *      lowercase letter, or an uppercase letter followed by a lowercase letter
 *      when preceded by an uppercase letter — i.e. "ABCDef" → ["ABC", "Def"]).
 *
 * The resulting tokens are lowercased and deduplicated in order
 * (duplicates removed while preserving first-occurrence order).
 *
 * Examples:
 *   "IsAnimPlaying"  → ["is", "anim", "playing"]
 *   "Compare frame"  → ["compare", "frame"]
 *   "CompareFrame"   → ["compare", "frame"]
 *   "Is playing"     → ["is", "playing"]
 *   "set-animation"  → ["set", "animation"]
 *
 * @param {string} name
 * @returns {string[]}
 */
export function tokenize(name) {
  // Insert a word boundary marker before each uppercase letter that follows a
  // lowercase letter, and before each uppercase letter followed by a lowercase
  // letter that is itself preceded by an uppercase letter.
  // This splits "IsAnimPlaying" → "Is Anim Playing" and "ABCDef" → "ABC Def".
  const spaced = name
    // UC preceded by LC: "AnimPlaying" → "Anim Playing"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // UC followed by LC, preceded by UC: "ABCDef" → "ABC Def"
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

  // Split on any run of non-alphanumeric characters, lowercase, and filter empties
  const tokens = spaced
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0);

  // Deduplicate while preserving order (rare but defensive)
  const seen = new Set();
  const unique = [];
  for (const tok of tokens) {
    if (!seen.has(tok)) {
      seen.add(tok);
      unique.push(tok);
    }
  }
  return unique;
}

// ---- index building ---------------------------------------------------------

/**
 * Build a lookup index from the descriptions array for O(1) access per
 * (objectClass, kind, normalizedName) triple.
 *
 * Keys are formed as `${normalizedObjectClass}:${kind}:${normalizedName}`.
 * An entry may appear under TWO keys when the caller provides an aliasMap
 * (both the CDN key and the manual slug are indexed so either lookup hits).
 *
 * @param {object[]} descriptions
 * @param {Record<string,string>} aliasMap - { cdnKey: manualSlug }
 * @returns {Map<string, object>}
 */
function buildDescriptionIndex(descriptions, aliasMap) {
  // Invert the aliasMap to go from manualSlug → cdnKey (for reverse lookup)
  // We actually want: given a manualSlug, also store under the CDN key.
  // The aliasMap is { cdnKey: manualSlug }, so iterate that directly.
  const cdnKeyForSlug = new Map();
  for (const [cdnKey, manualSlug] of Object.entries(aliasMap)) {
    cdnKeyForSlug.set(manualSlug.toLowerCase(), cdnKey.toLowerCase());
  }

  const index = new Map();

  for (const desc of descriptions) {
    const kind = desc.kind;
    const normName = normalize(desc.name);
    const descObjClass = desc.objectClass.toLowerCase();

    // Index under the raw objectClass key from the manual
    const primaryKey = `${descObjClass}:${kind}:${normName}`;
    if (!index.has(primaryKey)) {
      index.set(primaryKey, desc);
    }

    // Also index under the CDN key if the manual slug has a CDN alias
    const cdnKeyLower = cdnKeyForSlug.get(descObjClass);
    if (cdnKeyLower !== undefined) {
      const aliasKey = `${cdnKeyLower}:${kind}:${normName}`;
      if (!index.has(aliasKey)) {
        index.set(aliasKey, desc);
      }
    }
  }

  return index;
}

/**
 * Build a secondary lookup for tier-2 token-subset matching.
 * Groups descriptions by (normalizedObjectClass, kind) → array of desc with
 * precomputed token sets.
 *
 * @param {object[]} descriptions
 * @param {Record<string,string>} aliasMap
 * @returns {Map<string, Array<{desc: object, tokens: string[]}>>}
 */
function buildTokenIndex(descriptions, aliasMap) {
  const cdnKeyForSlug = new Map();
  for (const [cdnKey, manualSlug] of Object.entries(aliasMap)) {
    cdnKeyForSlug.set(manualSlug.toLowerCase(), cdnKey.toLowerCase());
  }

  const index = new Map();

  function addToIndex(groupKey, desc, tokens) {
    if (!index.has(groupKey)) {
      index.set(groupKey, []);
    }
    index.get(groupKey).push({ desc, tokens });
  }

  for (const desc of descriptions) {
    const kind = desc.kind;
    const tokens = tokenize(desc.name);
    const descObjClass = desc.objectClass.toLowerCase();

    // Index under the manual's objectClass
    addToIndex(`${descObjClass}:${kind}`, desc, tokens);

    // Also index under the CDN key alias
    const cdnKeyLower = cdnKeyForSlug.get(descObjClass);
    if (cdnKeyLower !== undefined) {
      addToIndex(`${cdnKeyLower}:${kind}`, desc, tokens);
    }
  }

  return index;
}

// ---- tier-2 tie-breaking ----------------------------------------------------

/**
 * Among multiple tier-2 candidate descriptions, pick the best one
 * deterministically.
 *
 * Tie-break rule (heuristic — documented here for clarity):
 *   1. Prefer the candidate whose `name` has the MOST tokens (more specific
 *      match is less likely to be a false positive).
 *   2. On equal token count, prefer the candidate whose `name` sorts FIRST
 *      lexically (stable, deterministic).
 *
 * @param {Array<{desc: object, tokens: string[]}>} candidates
 * @returns {object} the winning desc
 */
function pickTier2Winner(candidates) {
  return candidates.reduce((best, current) => {
    const bestLen = best.tokens.length;
    const currLen = current.tokens.length;
    if (currLen > bestLen) return current;
    if (currLen < bestLen) return best;
    // equal token count — lexical order on name
    return current.desc.name < best.desc.name ? current : best;
  }).desc;
}

// ---- main join function -----------------------------------------------------

/**
 * Join manual-PDF descriptions onto CDN-sourced ACE records.
 *
 * For each CDN ACE, find a matching description within the SAME object class
 * (with optional aliasMap bridging) and SAME kind, by matching `scriptName`
 * against the manual entry's `name`.
 *
 * Matching is two-tiered:
 *   Tier 1 — exact normalized match: normalize(ace.scriptName) === normalize(desc.name).
 *   Tier 2 — token-subset fallback: desc.name tokens ⊆ ace.scriptName tokens.
 *             Example: "Is playing" → {is, playing} ⊆ {is, anim, playing} ← IsAnimPlaying.
 *
 * Object-class matching:
 *   A CDN ace with objectClass K matches manual entries whose objectClass
 *   equals K OR equals aliasMap[K] (compared case-insensitively).
 *   The output objectClass is always the CDN key verbatim (unchanged).
 *
 * ACEs without a `scriptName` cannot be name-joined and are emitted unchanged.
 *
 * @param {object[]} cdnAces - array of CDN records from flattenAllAces()
 * @param {object[]} descriptions - array of manual description records
 *   each `{ objectClass, kind, name, description, canonicalUrl? }`
 * @param {Record<string,string>} [aliasMap] - optional { cdnKey: manualSlug }
 *   e.g. `{ system: "System", TiledBg: "tiled-background", NinePatch: "9-patch" }`
 * @returns {{ aces: object[], coverage: object }}
 */
export function joinDescriptions(cdnAces, descriptions, aliasMap = {}) {
  // Build lookup structures (pure — does not mutate inputs)
  const exactIndex = buildDescriptionIndex(descriptions, aliasMap);
  const tokenIndex = buildTokenIndex(descriptions, aliasMap);

  // Coverage accumulators
  let matched = 0;
  let tier1Count = 0;
  let tier2Count = 0;
  const byObjectClass = {};

  const aces = cdnAces.map((ace) => {
    const oc = ace.objectClass;
    // Initialise per-class counter on first encounter
    if (!byObjectClass[oc]) {
      byObjectClass[oc] = { total: 0, matched: 0 };
    }
    byObjectClass[oc].total += 1;

    // ACEs without scriptName cannot be name-joined
    if (typeof ace.scriptName !== 'string') {
      return { ...ace }; // shallow copy — no mutation of original
    }

    const kindKey = ace.kind;
    const ocLower = oc.toLowerCase();

    // ---- Tier 1: exact normalized match ------------------------------------
    const normScript = normalize(ace.scriptName);
    const tier1Key = `${ocLower}:${kindKey}:${normScript}`;
    const tier1Match = exactIndex.get(tier1Key);

    if (tier1Match !== undefined) {
      matched += 1;
      tier1Count += 1;
      byObjectClass[oc].matched += 1;
      return mergeDesc(ace, tier1Match);
    }

    // ---- Tier 2: token-subset fallback ------------------------------------
    const aceTokens = tokenize(ace.scriptName);
    const aceTokenSet = new Set(aceTokens);
    const groupKey = `${ocLower}:${kindKey}`;
    const candidates = tokenIndex.get(groupKey);

    if (candidates && candidates.length > 0) {
      const subsetMatches = candidates.filter(({ tokens }) =>
        tokens.length > 0 && tokens.every((t) => aceTokenSet.has(t)),
      );

      if (subsetMatches.length > 0) {
        const winner = subsetMatches.length === 1
          ? subsetMatches[0].desc
          : pickTier2Winner(subsetMatches);

        matched += 1;
        tier2Count += 1;
        byObjectClass[oc].matched += 1;
        return mergeDesc(ace, winner);
      }
    }

    // No match — emit unchanged (shallow copy)
    return { ...ace };
  });

  const total = cdnAces.length;
  const coverage = {
    total,
    matched,
    unmatched: total - matched,
    tier1: tier1Count,
    tier2: tier2Count,
    byObjectClass,
  };

  return { aces, coverage };
}

// ---- merge helper -----------------------------------------------------------

/**
 * Produce a new ACE record with description (and canonicalUrl if present)
 * joined from the matching manual entry. Does not mutate the original ace.
 *
 * @param {object} ace - CDN ACE record
 * @param {object} desc - matching manual description record
 * @returns {object}
 */
function mergeDesc(ace, desc) {
  const merged = { ...ace, description: desc.description };
  // Carry canonicalUrl from the manual only if the ACE didn't already have one
  if (typeof desc.canonicalUrl === 'string' && !('canonicalUrl' in ace)) {
    merged.canonicalUrl = desc.canonicalUrl;
  }
  return merged;
}
