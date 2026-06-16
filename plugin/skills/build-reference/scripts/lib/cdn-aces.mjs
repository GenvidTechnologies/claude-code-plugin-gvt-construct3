// Pure helper for flattening the C3 editor CDN `allAces.json` document into an
// array of builtin ACE records ready for the construct3-chef `c3-reference` cache.
//
// The CDN document shape (fetched from the C3 editor CDN, e.g.
// `https://editor.construct.net/<rev>/plugins/allAces.json` and
// `https://editor.construct.net/<rev>/behaviors/allAces.json`):
//
//   {
//     "<PluginKey>": {
//       "<categoryName>": {
//         "conditions": [ { id, scriptName, params, isTrigger, ... }, ... ],
//         "actions":    [ { id, scriptName, params, ... }, ... ],
//         "expressions":[ { id, expressionName, returnType, params, ... }, ... ]
//       },
//       ...more categories...
//     },
//     ...more plugins...
//   }
//
// Both plugin and behavior `allAces.json` documents have the same outer shape and
// flatten identically, so a single `flattenAllAces` call works for both.
//
// Output records match the `AceEntrySchema` owned by construct3-chef
// (src/c3/c3Reference.ts). Only the fields the schema defines are produced here;
// `description` and `canonicalUrl` are intentionally absent — those are added by a
// later merge step.
//
// No fs, no process — pure function only.

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const BUCKET_TO_KIND = {
  conditions: 'condition',
  actions: 'action',
  expressions: 'expression',
};

/**
 * Map one CDN entry from the `conditions`/`actions` buckets to an ACE record.
 *
 * @param {string} objectClass - the top-level plugin key (e.g. "Sprite")
 * @param {"condition"|"action"} kind
 * @param {object} entry - CDN entry ({ id, scriptName?, params?, isTrigger?, ... })
 * @returns {object} ACE record
 */
function flattenConditionOrAction(objectClass, kind, entry) {
  const record = {
    source: 'builtin',
    objectClass,
    kind,
    id: entry.id,
  };
  // scriptName is optional in the schema; omit if absent
  if (typeof entry.scriptName === 'string') {
    record.scriptName = entry.scriptName;
  }
  record.params = Array.isArray(entry.params)
    ? entry.params.map((p) => ({ name: p.id, type: p.type }))
    : [];
  return record;
}

/**
 * Map one CDN entry from the `expressions` bucket to an ACE record.
 * For expressions the display name lives in `expressionName`, not `scriptName`.
 *
 * @param {string} objectClass
 * @param {object} entry - CDN entry ({ id, expressionName?, returnType?, params?, ... })
 * @returns {object} ACE record
 */
function flattenExpression(objectClass, entry) {
  const record = {
    source: 'builtin',
    objectClass,
    kind: 'expression',
    id: entry.id,
  };
  // scriptName is optional; for expressions it maps from expressionName
  if (typeof entry.expressionName === 'string') {
    record.scriptName = entry.expressionName;
  }
  record.params = Array.isArray(entry.params)
    ? entry.params.map((p) => ({ name: p.id, type: p.type }))
    : [];
  return record;
}

/**
 * Flatten the C3 editor CDN `allAces.json` document into an array of builtin
 * ACE records ready for the `c3-reference` cache.
 *
 * The same CDN shape is used for both plugin ACEs and behavior ACEs, so this
 * function works for both — just call it once per document.
 *
 * Only the fields defined by `AceEntrySchema` (construct3-chef) are written to
 * each record: `source`, `objectClass`, `kind`, `id`, `scriptName?`, `params`.
 * Fields like `isTrigger`, `returnType`, `displayText`, etc. are deliberately
 * dropped to keep the cache clean.
 *
 * Defensive behaviour:
 * - If the top-level input is not a plain object, throws a clear Error.
 * - If a plugin's category value is not a plain object, it is skipped silently.
 * - If an ACE bucket (conditions/actions/expressions) is missing or not an array,
 *   it is skipped silently (the other buckets in that category still process).
 *
 * @param {object} allAcesJson - parsed `allAces.json` document from the C3 CDN
 * @returns {object[]} flat array of ACE records ({ source, objectClass, kind, id, scriptName?, params })
 */
export function flattenAllAces(allAcesJson) {
  if (!isPlainObject(allAcesJson)) {
    throw new Error(
      'flattenAllAces: expected a plain object (parsed allAces.json), ' +
        `got ${Array.isArray(allAcesJson) ? 'array' : typeof allAcesJson}`,
    );
  }

  const records = [];

  for (const [objectClass, categories] of Object.entries(allAcesJson)) {
    if (!isPlainObject(categories)) {
      // malformed plugin entry — skip
      continue;
    }

    for (const categoryValue of Object.values(categories)) {
      if (!isPlainObject(categoryValue)) {
        // malformed category entry — skip
        continue;
      }

      for (const [bucket, entries] of Object.entries(categoryValue)) {
        const kind = BUCKET_TO_KIND[bucket];
        if (!kind) {
          // unknown bucket key — skip
          continue;
        }
        if (!Array.isArray(entries)) {
          // missing or malformed bucket — skip gracefully
          continue;
        }

        for (const entry of entries) {
          if (!isPlainObject(entry)) {
            continue;
          }
          if (kind === 'expression') {
            records.push(flattenExpression(objectClass, entry));
          } else {
            records.push(flattenConditionOrAction(objectClass, kind, entry));
          }
        }
      }
    }
  }

  return records;
}
