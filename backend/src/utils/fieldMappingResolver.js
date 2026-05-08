/**
 * Field Mapping Resolver
 * 
 * TWO-LEVEL RESOLUTION (Stable Anchor Architecture):
 * - Level 1: Channel Metadata (fieldX → field_name)
 * - Level 2: Sensor Field Mapping (field_name → internal_key)
 * 
 * This ensures data routes correctly even if ThingSpeak field positions change.
 */

const logger = require('./logger.js');

const INTERNAL_KEY_ALIASES = {
  water_level: ["water_level", "water_level_raw_sensor_reading", "level", "level_percentage"],
  flow_rate: ["flow_rate", "flow", "flowrate"],
  total_reading: ["total_reading", "current_reading", "meter_reading", "totalizer", "total_liters"],
  tds_value: ["tds_value", "tds", "tds_reading"],
  temperature: ["temperature", "temp", "temperature_field"],
};

function normalize(v) {
  return String(v || "").trim().toLowerCase();
}

function matchesInternalKey(value, internalKey) {
  const target = normalize(value);
  const aliases = INTERNAL_KEY_ALIASES[internalKey] || [internalKey];
  return aliases.some((k) => normalize(k) === target);
}

module.exports = {
  /**
   * STABLE ANCHOR: Resolve field position using channel metadata
   * 
   * This is the NEW primary method for field resolution.
   * 
   * @param {Object} channelMetadata - Channel metadata { field1: "Meter Reading_7", field2: "Flow Rate", ... }
   * @param {Object} fieldMapping - Sensor field mapping { flow_rate: "Flow Rate", ... }
   * @param {string} internalKey - Internal key to resolve (e.g., "flow_rate", "tds_value")
   * @returns {string|null} The fieldX key (e.g., "field1") or null if not found
   */
  resolveFieldByName(channelMetadata, fieldMapping, internalKey) {
    if (!channelMetadata || !fieldMapping || !internalKey) {
      logger.warn(`[FieldMappingResolver] Missing params for resolveFieldByName:`, {
        hasMetadata: !!channelMetadata,
        hasMapping: !!fieldMapping,
        internalKey
      });
      return null;
    }

    // Step 1: Resolve field name from mapping.
    // Supports two shapes:
    // A) internal -> channel label  (new)
    // B) fieldX -> internal key     (legacy/reverse)
    let fieldName = fieldMapping[internalKey];

    if (!fieldName) {
      // Reverse shape: find fieldX where value matches internal key (with aliases)
      const reverseMatch = Object.entries(fieldMapping).find(([fieldKey, mappedValue]) => {
        if (typeof fieldKey !== "string" || !fieldKey.startsWith("field")) return false;
        return matchesInternalKey(mappedValue, internalKey);
      });

      if (reverseMatch) {
        const [resolvedFieldKey] = reverseMatch;
        logger.debug(`[FieldMappingResolver] ✅ Resolved ${internalKey} directly from reverse mapping → ${resolvedFieldKey}`);
        return resolvedFieldKey;
      }

      logger.warn(`[FieldMappingResolver] Internal key not in mapping: ${internalKey}`, { fieldMapping });
      return null;
    }

    // Step 2: Find which fieldX contains this name in channel metadata
    // e.g., fieldName="Flow Rate" → find field2="Flow Rate" → return "field2"
    for (const [fieldKey, metadataName] of Object.entries(channelMetadata)) {
      // Skip non-field entries
      if (!fieldKey.startsWith("field") || typeof metadataName !== "string") continue;
      
      // Match (case-insensitive)
      if (metadataName.trim().toLowerCase() === fieldName.trim().toLowerCase()) {
        logger.debug(`[FieldMappingResolver] ✅ Resolved ${internalKey} → "${fieldName}" → ${fieldKey}`);
        return fieldKey;
      }
    }

    logger.warn(`[FieldMappingResolver] Field name not in metadata: ${fieldName}`, { 
      internalKey,
      channelMetadata 
    });
    return null;
  },

  /**
   * Resolve a field key from fieldMapping object by searching through target names
   * Handles both direct lookups and reverse lookups
   * 
   * ⚠️ DEPRECATED: Use resolveFieldByName with channel metadata instead
   * This is kept for backward compatibility only.
   * 
   * @param {Object} fieldMapping - The field mapping object (e.g., { field1: "water_level_raw_sensor_reading", ... })
   * @param {Array<string>} targetNames - Names to search for (in order of preference)
   * @param {string} fallback - Default field to return if no match found (default: "field1")
   * @returns {string} The resolved field key
   */
  resolveFieldKey(fieldMapping, targetNames = [], fallback = "field1") {
    if (!fieldMapping || typeof fieldMapping !== "object") {
      return fallback;
    }

    const names = Array.isArray(targetNames) ? targetNames : [targetNames];

    // 1. Direct lookup: try each name in fieldMapping as a key
    for (const name of names) {
      if (fieldMapping[name]) {
        return fieldMapping[name];
      }
    }

    // 2. Reverse lookup: find field that maps to any target name
    for (const [field, value] of Object.entries(fieldMapping)) {
      if (names.includes(value)) {
        return field;
      }
    }

    // 3. Fallback
    return fallback;
  },

  /**
   * Resolve a value from field mapping
   * Gets the value that a field maps to
   * 
   * @param {Object} fieldMapping - The field mapping object
   * @param {string} fieldKey - The field key to look up
   * @param {*} fallback - Default value if not found
   * @returns {*} The mapped value
   */
  resolveFieldValue(fieldMapping, fieldKey, fallback = null) {
    if (!fieldMapping || typeof fieldMapping !== "object") {
      return fallback;
    }

    return fieldMapping[fieldKey] ?? fallback;
  },

  /**
   * Get multiple field keys from mapping
   * Useful when device has multiple sensor types
   * 
   * @param {Object} fieldMapping - The field mapping object
   * @param {Object} targetMap - Map of { fieldName: [possible_values] }
   * @returns {Object} Map of resolved fields
   */
  resolveMultipleFields(fieldMapping, targetMap = {}) {
    const result = {};

    for (const [key, targets] of Object.entries(targetMap)) {
      result[key] = this.resolveFieldKey(fieldMapping, targets);
    }

    return result;
  }
};
