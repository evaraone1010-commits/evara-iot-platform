/**
 * Firestore Helper Functions
 * 
 * ✅ FIX #5: Sanitize objects before batch writes
 * Firestore doesn't handle undefined/null fields well in batch operations.
 * This utility recursively removes undefined and null values before writes.
 */

/**
 * Recursively sanitize an object for Firestore batch operations
 * Removes undefined and null values, preserves empty arrays/strings
 * 
 * @param {*} obj - The object to sanitize (can be any type)
 * @returns {*} The sanitized object (same structure, filtered values)
 */
function sanitizeForFirestore(obj) {
  // Pass through non-objects (strings, numbers, booleans, etc.)
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  // Pass through arrays as-is (Firestore handles arrays)
  if (Array.isArray(obj)) {
    return obj;
  }

  // Filter object: remove undefined/null, recurse on nested objects
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [
        k,
        typeof v === 'object' && v !== null ? sanitizeForFirestore(v) : v
      ])
  );
}

module.exports = { sanitizeForFirestore };
