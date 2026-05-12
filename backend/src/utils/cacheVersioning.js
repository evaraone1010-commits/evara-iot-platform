/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TASK #11: Cache Version Invalidation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PROBLEM: flushPrefix() causes stale-data race conditions
 *   • Client A: requests list (cache miss)
 *   • Client B: updates resource
 *   • flushPrefix() clears "zones_list_*"
 *   • Client A: might still get old version before new write completes
 *   • 100-500ms window of stale data on consistent failures
 * 
 * SOLUTION: Version-based cache keys (atomic versioning)
 *   • Store: keyName_v{VERSION} instead of just keyName
 *   • Increment: VERSION counter when resource changes
 *   • Benefit: No flush needed, old keys auto-expire, no race conditions
 * 
 * ALGORITHM:
 *   1. Store zones list as "zones_list_v{X}" where X = nodes_VERSION
 *   2. When device created → increment nodes_VERSION atomically
 *   3. Old cached key "zones_list_v{old}" auto-expires (TTL)
 *   4. Next request uses new version: "zones_list_v{new}"
 * 
 * USAGE:
 *   const versionKey = getVersionKey('zones_list');
 *   const cached = await cache.get(versionKey);
 *   
 *   // On write:
 *   await incrementCacheVersion('nodes'); // Invalidates all zones_list_v* keys
 */

const { db } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const logger = require("./logger.js");

function hasFirestoreConfig() {
    return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

/**
 * Build versioned cache key
 * Uses Redis as primary authority for speed and consistency, fallbacks to Firestore
 * Returns: "zones_v123"
 */
async function getVersionKey(prefix) {
    const redisKey = `version:${prefix}`;
    
    try {
        // 1. Try Redis first (High speed, strongly consistent for this use case)
        const cachedVersion = await cache.get(redisKey);
        if (cachedVersion !== undefined) {
            return String(cachedVersion);
        }

        // 2. Fallback to Firestore if Redis MISS
        if (hasFirestoreConfig()) {
            const versionDoc = await db.collection('_cache_versions').doc(prefix).get();
            const version = versionDoc.exists ? versionDoc.data().version : 1;
            
            // Populate Redis for next time (long TTL: 24h)
            await cache.set(redisKey, version, 86400);
            return String(version);
        }
    } catch (err) {
        logger.error(`[CacheVersioning] Failed to get version for ${prefix}:`, err.message);
    }
    
    return "1";
}

/**
 * Increment version counter (atomically invalidates all related cache keys)
 * Increments both Redis and Firestore to maintain sync.
 */
async function incrementCacheVersion(resourceType) {
    const redisKey = `version:${resourceType}`;
    
    try {
        // 1. Atomic Increment in Redis (Instant)
        if (cache.isRedisReady) {
            await cache.redis.incr(redisKey);
            // Ensure TTL is set (24h)
            await cache.redis.expire(redisKey, 86400);
        } else {
            // Memory fallback
            const current = (await cache.get(redisKey)) || 1;
            await cache.set(redisKey, current + 1, 86400);
        }

        // 2. Persistent Update in Firestore (Background/Backup)
        if (hasFirestoreConfig()) {
            const versionRef = db.collection('_cache_versions').doc(resourceType);
            await versionRef.set(
                { version: require("firebase-admin/firestore").FieldValue.increment(1) },
                { merge: true }
            );
        }
        
        logger.debug(`[CacheVersioning] Incremented ${resourceType} version`);
    } catch (err) {
        logger.warn(`[CacheVersioning] Failed to increment ${resourceType}:`, err.message);
    }
}

/**
 * Initialize cache versions for all resource types
 */
async function initializeCacheVersions() {
    const resourceTypes = [
        'zones',
        'devices', 
        'nodes',
        'customers',
        'audit_logs',
        'telemetry',
        'default'
    ];

    for (const type of resourceTypes) {
        const redisKey = `version:${type}`;
        try {
            // Check Redis first
            const existsInRedis = await cache.get(redisKey);
            if (existsInRedis === undefined && hasFirestoreConfig()) {
                const versionDoc = await db.collection('_cache_versions').doc(type).get();
                const version = versionDoc.exists ? versionDoc.data().version : 1;
                await cache.set(redisKey, version, 86400);
            }
        } catch (err) {
            logger.warn(`[CacheVersioning] Failed to initialize ${type}:`, err.message);
        }
    }
}

module.exports = {
    getVersionKey,
    incrementCacheVersion,
    initializeCacheVersions
};
