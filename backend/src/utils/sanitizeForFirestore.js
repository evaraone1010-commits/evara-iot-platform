/**
 * Deep-strip undefined and null values from objects/arrays before writing to Firestore.
 * Keeps falsy but valid values like 0 and empty string.
 */
function sanitizeForFirestore(value) {
  if (value === undefined || value === null) return undefined;

  if (Array.isArray(value)) {
    const arr = value
      .map(sanitizeForFirestore)
      .filter((v) => v !== undefined);
    return arr;
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const sv = sanitizeForFirestore(v);
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  }

  // primitives (string, number, boolean)
  return value;
}

module.exports = sanitizeForFirestore;
