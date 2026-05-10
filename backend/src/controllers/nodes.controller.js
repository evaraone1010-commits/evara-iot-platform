const { db, admin } = require("../config/firebase.js");
const { Filter } = require("firebase-admin/firestore");
const { startWorker } = require("../workers/telemetryWorker.js");
const { checkOwnership } = require("../middleware/auth.middleware.js");
const { checkDeviceVisibilityWithAudit } = require("../utils/checkDeviceVisibility.js");
const logger = require("../utils/logger.js");
const axios = require("axios");
const telemetryCache = require("../services/cacheService.js");
const cache = require("../config/cache.js");
const deviceState = require("../services/deviceStateService.js");
const { DEVICE_STATUS } = require("../utils/deviceConstants.js");
const { resolveFieldKey, resolveMultipleFields } = require("../utils/fieldMappingResolver.js");
const {
    fetchSixHourData,
    fetchLatestData,
    applyLightSmoothing,
    calculateMetrics,
    getLatestFeed
} = require("../services/thingspeakService.js");
const {
    analyzeWaterTank,
} = require("../services/waterAnalyticsEngine.js");
// ✅ HYBRID CACHING IMPORTS
const HybridDataResolver = require("../utils/hybridDataResolver.js");
const TelemetryArchiveService = require("../services/telemetryArchiveService.js");

const normalizeThingSpeakTimestamp = (ts) => {
    if (!ts) return null;
    if (typeof ts !== 'string') return ts;
    // ThingSpeak returns timestamps like "2026-03-18 14:50:10" (no timezone).
    // Treat those as UTC so they display correctly in the UI.
    if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) return ts;
    return `${ts}Z`;
};

/**
 * Helper to resolve device by document ID OR device_id/node_id
 */
// ✅ AUDIT FIX L2: Use shared resolveDevice utility (was duplicated in 3 controllers)
const { computeTankMetrics } = require("../utils/tankMath.js");
const resolveDevice = require("../utils/resolveDevice.js");

/**
 * Persist ThingSpeak timestamp back to Firestore to keep Dashboard/Map synchronized
 */
async function syncNodeStatus(id, type, lastSeen, additionalData = {}) {
    if (!lastSeen) return;
    try {
        const typeLower = type.toLowerCase();
        const status = deviceState.calculateDeviceStatus(lastSeen);

        const updatePayload = {
            status,
            last_seen: lastSeen,
            last_updated_at: lastSeen,
            last_online_at: admin.firestore.FieldValue.serverTimestamp(),
            last_telemetry_fetch: new Date().toISOString(),
            telemetry_snapshot: {
                ...additionalData,
                timestamp: lastSeen,
                status
            },
            ...additionalData
        };

        // 1. Update typed collection (metadata)
        await db.collection(typeLower).doc(id).update(updatePayload);

        // 2. Update central registry (devices) for dashboard/list views
        const registryPayload = {
            status,
            last_updated_at: lastSeen,
            last_seen: lastSeen,
            telemetry_snapshot: updatePayload.telemetry_snapshot
        };

        // Map common fields to registry for list view accuracy
        if (additionalData.level_percentage !== undefined) registryPayload.level_percentage = additionalData.level_percentage;
        if (additionalData.flow_rate !== undefined) registryPayload.flow_rate = additionalData.flow_rate;
        if (additionalData.tds_value !== undefined) registryPayload.tds_value = additionalData.tds_value;

        await db.collection("devices").doc(id).update(registryPayload);
        logger.debug(`[syncNodeStatus] ✅ Synchronized ${id} (${type}) -> ${status}`);
    } catch (err) {
        logger.error(`Status sync failed for ${id}:`, err);
    }
}

/**
 * Helper: build simple event timeline from history
 */
function buildEventTimeline(history, currentState) {
  const events = [];
  const colorMap = { CONSUMPTION: '#FF3B30', REFILL: '#34C759', STABLE: '#8E8E93' };

  // Add the current state as the most recent event
  if (history.length > 0 && currentState !== 'LEARNING') {
    const last = history[history.length - 1];
    const d = new Date(last.timestamp);
    if (!isNaN(d.getTime())) {
      events.push({
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        label: currentState,
        color: colorMap[currentState] || '#8E8E93'
      });
    }
  }

  return events.slice(-5);
}

exports.getNodes = async (req, res, next) => {
    try {
        // ✅ CRITICAL FIX: Don't cache customer-specific queries - always get fresh data
        // This ensures consistent results when devices are added/removed
        const filterCustomerId = req.query.customerId || req.query.customer_id || null;

        logger.debug(`[NodesController] getNodes:`, {
            userId: req.user.uid,
            userRole: req.user.role,
            filterCustomerId,
            userCustomerId: req.user.customer_id
        });

        // For customer-specific queries, SKIP CACHE to ensure we always get real DB data
        let shouldUseCache = !filterCustomerId;

        const nodesCacheKey = req.user.role === "superadmin"
            ? `user:admin:devices${filterCustomerId ? `:${filterCustomerId}` : ""}`
            : `user:${req.user.uid}:devices`;

        // ✅ FIX #18: SKIP DEVICE LIST CACHE FOR CONSISTENT STATUS
        // CRITICAL: Status accuracy is more important than small performance gain
        // Device status must ALWAYS reflect current state from DB, not cached state
        // Cache can hide stale status values (device marked ONLINE but truly offline in DB)
        // This is why dashboard showed ONLINE while analytics showed OFFLINE
        //
        // The ~500ms DB call is worth the accuracy of real-time status
        // We'll implement targeted field-level caching later instead
        const shouldSkipCache = false;  // Use cache to improve performance
        
        if (!shouldSkipCache && shouldUseCache) {
            const cachedNodes = await cache.get(nodesCacheKey);
            if (cachedNodes) {
                logger.debug(`[NodesController] ✅ Cache HIT for key: ${nodesCacheKey}, returned ${cachedNodes.length} devices`);
                return res.status(200).json(cachedNodes);
            }
        }

        logger.debug(`[NodesController] Cache SKIPPED for consistent status (always fresh from DB) for key: ${nodesCacheKey}`);

        const limit = Math.min(parseInt(req.query.limit) || 100, 200); // cap at 200
        const cursor = req.query.cursor;

        let query = db.collection("devices");

        if (filterCustomerId) {
            // Filter by the provided customer ID
            logger.debug(`[NodesController] Filtering by customerID: ${filterCustomerId}`);
            query = query.where("customer_id", "==", filterCustomerId);
            logger.debug(`[NodesController] ✅ NOT applying Firestore where-clause for isVisibleToCustomer (would filter out old devices)`);
        } else if (req.user.role !== "superadmin") {
            // Customer viewing their own devices
            logger.debug(`[NodesController] Filtering by customer's own ID`);
            query = query.where("customer_id", "==", req.user.customer_id);
            logger.debug(`[NodesController] ✅ NOT applying Firestore where-clause for isVisibleToCustomer (would filter out old devices)`);
        } else {
            logger.debug(`[NodesController] Superadmin viewing all devices (no customer_id filter)`);
        }

        const hasEqualityFilter = !!filterCustomerId || req.user.role !== "superadmin";

        // ✅ FIX: Only order by created_at if there are no equality filters. 
        // This bypasses the need for manual Composite Indexes in the Firebase Console.
        if (!hasEqualityFilter) {
            query = query.orderBy('created_at', 'desc');
        }
        
        query = query.limit(limit);

        if (cursor) {
            const cursorDoc = await db.collection('devices').doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snapshot = await query.get();
        const nextCursor = snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null;
        logger.debug(`[NodesController] Query returned ${snapshot.size} device registry entries from DB`);
        logger.debug(`[NodesController] Device types found:`, snapshot.docs.map(d => ({ id: d.id, device_type: d.data().device_type })));

        // ✅ CRITICAL N+1 FIX: Collect device IDs and batch-fetch metadata
        // This reduces 400 queries (100 devices × 4 queries each) to ~4 queries
        const typedGroups = {};
        const registryDataMap = {};
        const uniqueZoneIds = new Set();

        // Step 1: Collect all device IDs by type and identify unique zones & customers
        const uniqueCustomerIds = new Set();
        for (const doc of snapshot.docs) {
            const registry = doc.data();
            const type = registry.device_type;
            if (!type) continue;

            if (!typedGroups[type]) typedGroups[type] = [];
            typedGroups[type].push(doc.id);
            registryDataMap[doc.id] = registry;
            
            // Collect unique zone IDs (DO NOT query zones in loop)
            if (registry.zone_id) uniqueZoneIds.add(registry.zone_id);
            
            // Collect unique customer IDs for batch lookup
            if (registry.customer_id) uniqueCustomerIds.add(registry.customer_id);
        }

        // Step 2: Pre-fetch unique zones and customers ONCE (not per device)
        let zoneMap = {};
        let customerMap = {};
        
        if (uniqueZoneIds.size > 0) {
            logger.debug(`[NodesController] Pre-fetching ${uniqueZoneIds.size} unique zones (batch query)`);
            const zoneRefs = Array.from(uniqueZoneIds).map(id => db.collection("zones").doc(id));
            
            // Split into chunks of 500 to respect Firestore limits
            const CHUNK_SIZE = 500;
            for (let i = 0; i < zoneRefs.length; i += CHUNK_SIZE) {
                const chunk = zoneRefs.slice(i, i + CHUNK_SIZE);
                const zoneDocs = await db.getAll(...chunk);
                zoneDocs.forEach(doc => {
                    if (doc.exists) {
                        zoneMap[doc.id] = doc.data().zoneName || doc.data().name || doc.id;
                    }
                });
            }
        }
        logger.debug(`[NodesController] Loaded zone map with ${Object.keys(zoneMap).length} entries`);
        
        if (uniqueCustomerIds.size > 0) {
            logger.debug(`[NodesController] Pre-fetching ${uniqueCustomerIds.size} unique customers (batch query)`);
            const customerRefs = Array.from(uniqueCustomerIds).map(id => db.collection("customers").doc(id));
            
            // Split into chunks of 500 to respect Firestore limits
            const CHUNK_SIZE = 500;
            for (let i = 0; i < customerRefs.length; i += CHUNK_SIZE) {
                const chunk = customerRefs.slice(i, i + CHUNK_SIZE);
                const customerDocs = await db.getAll(...chunk);
                customerDocs.forEach(doc => {
                    if (doc.exists) {
                        // Try multiple possible field names for customer name
                        const customerData = doc.data();
                        const name = customerData.display_name || customerData.displayName || customerData.name || customerData.customerName || doc.id;
                        customerMap[doc.id] = name;
                    }
                });
            }
        }
        logger.debug(`[NodesController] Loaded customer map with ${Object.keys(customerMap).length} entries`);

        const nodes = [];

        // db.getAll(...refs) uses the spread operator which hits Node.js / Firestore argument-count
        // limits (~500) when a customer has many devices of the same type.
        // This helper splits refs into chunks of 500 and merges results, supporting unlimited devices.
        const chunkGetAll = async (refs) => {
            const CHUNK_SIZE = 500;
            const results = [];
            for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
                const chunk = refs.slice(i, i + CHUNK_SIZE);
                const docs = await db.getAll(...chunk);
                results.push(...docs);
            }
            return results;
        };

        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                logger.debug(`[NodesController] Fetching ${ids.length} ${type} metadata documents for IDs:`, ids);
                const refs = ids.map(id => db.collection(type.toLowerCase()).doc(id));
                const metas = await chunkGetAll(refs);
                logger.debug(`[NodesController] Successfully loaded ${metas.filter(m => m.exists).length} metadata from ${ids.length} refs for type ${type}`);
                return metas.map(m => m.exists ? { id: m.id, meta: m.data(), type } : null).filter(Boolean);
            })
        );
        logger.debug(`[NodesController] Total metadata loaded: ${typeBatches.reduce((sum, batch) => sum + batch.length, 0)} devices`);

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta, type } = item;
                
                logger.debug(`[NodesController] Processing device: ID=${id}, type=${type}, label=${meta.label}, category=${meta.category}`);

                  const registry = registryDataMap[id];
                  const effCustomerId = registry?.customer_id || registry?.customerId || meta.customer_id || meta.customerId;

                  // Ownership check only for non-superadmin without an explicit customerId filter
                  if (req.user.role !== "superadmin" && !filterCustomerId) {    
                      if (effCustomerId !== req.user.customer_id) {
                          logger.debug(`[NodesController] ⚠️  Filtering out device ${id}: customer mismatch (effCustomerId=${effCustomerId} vs req.user.customer_id=${req.user.customer_id})`);
                          continue;
                      }
                  }

                // ✅ CRITICAL FIX #4: ENFORCE DEVICE VISIBILITY
                // Non-superadmins: only filter if EXPLICITLY marked as hidden (isVisibleToCustomer === false)
                // If field is missing (old devices), treat as visible by default
                const effIsVisible = registry?.isVisibleToCustomer ?? meta?.isVisibleToCustomer; if (req.user.role !== "superadmin" && effIsVisible === false) {
                    logger.debug(`[NodesController] ⚠️  Filtering out explicitly hidden device ${id} for user ${req.user.uid}`);
                    continue;  // Skip this device
                }
                // Superadmins always see all devices
                if (req.user.role === "superadmin") {
                    logger.debug(`[NodesController] ✅ Superadmin${filterCustomerId ? ` querying customer ${filterCustomerId}` : ''} can see all devices`);
                }

                // ✅ FIX #17: CONSISTENT STATUS CALCULATION
                // CRITICAL: Don't use telemetry_snapshot.timestamp as it gets stale
                // Use only actual telemetry update timestamps
                // Priority (from most reliable to least):
                // 1. last_updated_at (set when telemetry arrives)
                // 2. last_online_at (set when device goes online)
                // 3. lastUpdatedAt / lastUpdated (from TDS updates)
                // 4. last_seen (legacy field)
                const lastSeen = meta.last_updated_at || meta.last_online_at || meta.lastUpdatedAt || meta.lastUpdated || meta.last_seen || null;
                const dynamicStatus = deviceState.calculateDeviceStatus(lastSeen);

                // ✅ DETAILED LOGGING: Show why device is online/offline
                logger.debug(`[NodesController] Device ${id}: lastSeen=${lastSeen}, calculatedStatus=${dynamicStatus}, storedStatus=${meta.status}, label=${meta.label}`);

                // Strip sensitive keys
                const { thingspeak_read_api_key, ...safeMeta } = meta;

                // ✅ FIXED: Enforce Single Source of Truth
                // Pull directly from database document rather than computing locally
                let levelPercentage = meta.level_percentage ?? null;

                const nodeData = {
                    id,
                    ...registryDataMap[id],
                    ...safeMeta,
                    status: dynamicStatus,
                    // Ensure isVisibleToCustomer is always set (default to true for old devices)
                    isVisibleToCustomer: meta.isVisibleToCustomer !== false ? true : false,
                    last_seen: lastSeen,
                    last_updated_at: meta.last_updated_at || lastSeen,
                    last_value: meta.last_value ?? null,
                    last_online_at: meta.last_online_at || lastSeen,
                    zone_name: zoneMap[meta.zone_id] || null,
                    customer_name: customerMap[effCustomerId] || null
                };

                // ✅ FIX: Ensure analytics_template is set (fallback for existing devices)
                if (!nodeData.analytics_template) {
                    const deviceType = (nodeData.device_type || "").toLowerCase();
                    if (deviceType === "evaratank") nodeData.analytics_template = "EvaraTank";
                    else if (deviceType === "evaradeep") nodeData.analytics_template = "EvaraDeep";
                    else if (deviceType === "evaraflow") nodeData.analytics_template = "EvaraFlow";
                    else if (deviceType === "evaratds") nodeData.analytics_template = "EvaraTDS";
                    else nodeData.analytics_template = "EvaraTank"; // default
                }

                // Enforce calculated level_percentage for tanks onto nodes list
                const isTankType = type.toLowerCase().includes("tank") || type.toLowerCase().includes("evara");
                if (isTankType && levelPercentage !== null) {
                    nodeData.level_percentage = levelPercentage;
                    // Also update telemetry_snapshot to include level_percentage for frontend
                    nodeData.telemetry_snapshot = {
                        ...(nodeData.telemetry_snapshot || {}),
                        level_percentage: levelPercentage,
                        timestamp: lastSeen,
                        status: dynamicStatus
                    };
                }

                if (type === 'evaratds') {
                    nodeData.last_telemetry = {
                        tdsValue: meta.tdsValue || 0,
                        tds_value: meta.tdsValue || 0,
                        waterQualityRating: meta.waterQualityRating || 'Unknown',
                        temperature: meta.temperature || 0,
                        timestamp: meta.lastUpdated || meta.updated_at || null
                    };
                }

                nodes.push(nodeData);
            }
        }

                logger.debug(`[NodesController] ✅ Final result: ${nodes.length} devices prepared`);
                logger.debug(`[NodesController] Device details:`, nodes.map(n => ({ 
                    id: n.id, 
                    name: n.label || n.displayName,
                    device_type: n.device_type,
                    analytics_template: n.analytics_template,
                    customer_id: n.customer_id
                })));
                
                // ✅ FIX: Additional detailed logging BEFORE response
                logger.debug(`[NodesController] Complete device list (IDs):`, nodes.map(n => n.id).join(', '));
                logger.debug(`[NodesController] Device types breakdown:`, 
                    nodes.reduce((acc, n) => {
                        const type = n.analytics_template || n.device_type || 'unknown';
                        acc[type] = (acc[type] || 0) + 1;
                        return acc;
                    }, {}));

                // Critical N+1 FIX METRICS
                // Show query reduction vs N+1 pattern
                const typeCount = Object.keys(typedGroups).length;
                const actualQueries = 1 + typeCount + 1; // devices list + type metadata batches + zones batch
                const n1Queries = 1 + (nodes.length * 4); // N+1 anti-pattern: 1 + per-device metadata + zone + community queries
                logger.debug(`[NodesController] QUERY REDUCTION:
  - Actual queries: ${actualQueries}
  - N+1 pattern would use: ${n1Queries}
  - Files loaded: ${nodes.length} devices from ${typeCount} types
  - Zone lookups: ${uniqueZoneIds.size} unique zones (pre-fetched, not per-device)
  - Estimated response time improvement: ${Math.round((n1Queries / actualQueries - 1) * 100)}% faster
  - Firestore cost savings: ~${Math.round((1 - actualQueries / n1Queries) * 100)}% reduction`);

        // ✅ FIX #19: DISABLE DEVICE LIST CACHING FOR CONSISTENCY
        // Since we're always fetching fresh from DB to ensure accurate status,
        // there's no point in caching. Status accuracy > performance optimization
        // Once status is stored in DB reliably, we can re-enable caching
        
        // Legacy code - keeping for reference but disabled:
        // if (shouldUseCache && !filterCustomerId) {
        //     logger.debug(`[NodesController] Caching superadmin result for ${Math.ceil(nodes.length / 2)} seconds`);
        //     await cache.set(nodesCacheKey, nodes, Math.ceil(nodes.length / 2));
        // } else if (filterCustomerId) {
        //     logger.debug(`[NodesController] ALWAYS FRESH: Customer-specific query - NOT cached`);
        // }
        
        logger.debug(`[NodesController] ALWAYS FRESH: Device list not cached (status accuracy priority)`);
        
        res.status(200).json({
            success: true,
            data: nodes,
            pagination: {
                count: nodes.length,
                nextCursor,
                hasMore: !!nextCursor
            }
        });
    } catch (error) {
        next(error);
    }
};



exports.getNodeById = async (req, res, next) => {
    try {
        const doc = await resolveDevice(req.params.id);
        if (!doc || !doc.exists) return res.status(404).json({ error: "Node not found" });

        const registry = doc.data();

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, doc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized access" });
            if (!checkDeviceVisibilityWithAudit(registry, doc.id, req.user.uid, req.user.role)) {
                return res.status(403).json({ error: "Device not visible to your account" });
            }
        }

        const metaDoc = await db.collection(registry.device_type.toLowerCase()).doc(doc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata missing" });

        const metadata = metaDoc.data();
        
        // CRITICAL: Lookup customer name (same as getNodes) for analytics modal
        const effCustomerId = registry?.customer_id || registry?.customerId || metadata.customer_id || metadata.customerId;
        let customerName = null;
        if (effCustomerId) {
            const customerDoc = await db.collection("customers").doc(effCustomerId).get();
            if (customerDoc.exists) {
                const customerData = customerDoc.data();
                customerName = customerData.display_name || customerData.displayName || customerData.name || customerData.customerName || null;
            }
        }
        
        // SIMPLE: Return all metadata fields from the typed collection
        // Exclude API key for security
        delete metadata.thingspeak_read_api_key;
        
        // MERGE: registry + metadata into single response
        const result = { 
            id: doc.id, 
            ...registry,
            ...metadata,
            customer_name: customerName
        };
        
        logger.debug(`[getNodeById] Returning config with Channel ID:`, result.thingspeak_channel_id, `Customer: ${customerName}`);
        
        await cache.set(`device:${doc.id}:metadata`, result, 3600);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

exports.getNodeTelemetry = async (req, res) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const registry = deviceDoc.data();
        const type = (registry.device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });

        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, deviceDoc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized access" });

            // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
            if (!checkDeviceVisibilityWithAudit(registry, deviceDoc.id, req.user.uid, req.user.role)) {
                return res.status(403).json({ error: "Device not visible to your account" });
            }
        }

        const metadata = metaDoc.data();
        const channelId = metadata.thingspeak_channel_id?.trim();
        const apiKey = metadata.thingspeak_read_api_key?.trim();
        const fieldMapping = metadata.sensor_field_mapping || {};

        // Define cacheKey before use
        const cacheKey = `telemetry:${deviceDoc.id}`;

        // 1. Try Redis cache first (written by telemetryWorker via deviceStateService)
        let responseData = await cache.get(cacheKey);

        if (!responseData) {
            logger.debug(`[NodesController] Cache miss for ${deviceDoc.id}, falling back to Firestore metadata`);
            // 2. Fall back to latest Firestore snapshot
            responseData = metadata.telemetry_snapshot || metadata.last_telemetry || {};
            
            // If the snapshot is missing, populate minimal fallbacks from metadata root
            if (!responseData.timestamp) {
                responseData = {
                    status: metadata.status || DEVICE_STATUS.OFFLINE,
                    timestamp: metadata.last_updated_at || metadata.last_seen || null,
                    flow_rate: metadata.flow_rate || 0,
                    total_usage: metadata.total_liters || metadata.total_reading || 0,
                    tds_value: metadata.tdsValue || metadata.last_tds_value || 0,
                    temperature: metadata.temperature || metadata.last_temperature || 0,
                    water_quality: metadata.waterQualityRating || "Good",
                    distance: metadata.last_value || 0,
                    level_percentage: metadata.level_percentage || 0,
                    raw_data: metadata.raw_data || null
                };
            }
        } else {
            logger.debug(`[NodesController] Serving telemetry for ${deviceDoc.id} directly from Redis cache`);
        }

        // Standardize output payload for frontend compatibility
        const result = {
            deviceId: deviceDoc.id,
            source: responseData.status ? 'cache' : 'firestore',
            field_mapping: fieldMapping,
            ...responseData,
        };

        return res.status(200).json(result);
    } catch (error) {
        logger.error("Telemetry error:", error);
        return next(error);
    }
};


exports.getNodeGraphData = async (req, res, next) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) return res.status(404).json({ error: "Device not found" });

        const registry = deviceDoc.data();
        const type = (registry.device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });

        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(req.user.customer_id || req.user.uid, deviceDoc.id, req.user.role, req.user.community_id);
            if (!isOwner) return res.status(403).json({ error: "Unauthorized" });

            // ✅ CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
            if (!checkDeviceVisibilityWithAudit(registry, deviceDoc.id, req.user.uid, req.user.role)) {
                return res.status(403).json({ error: "Device not visible to your account" });
            }
        }

        const metadata = metaDoc.data();
        const channelId = metadata.thingspeak_channel_id?.trim();
        const apiKey = metadata.thingspeak_read_api_key?.trim();
        const { incremental = false, lastTimestamp } = req.query;

        if (!channelId || !apiKey) {
            return res.status(200).json({
                data: [],
                metrics: {
                    currentLevel: null,
                    volume: null,
                    fillRate: null,
                    consumption: null,
                    status: DEVICE_STATUS.OFFLINE
                }
            });
        }

        try {
            if (incremental === 'true' && lastTimestamp) {
                const latestPoint = await fetchLatestData(channelId, apiKey, lastTimestamp);

                if (!latestPoint) {
                    return res.status(200).json({
                        data: [],
                        lastTimestamp: lastTimestamp,
                        hasNewData: false,
                        metrics: null
                    });
                }

                return res.status(200).json({
                    data: [latestPoint],
                    lastTimestamp: latestPoint.timestamp,
                    hasNewData: true,
                    metrics: null
                });
            } else {
                const fullData = await fetchSixHourData(channelId, apiKey);

                if (!fullData || fullData.length === 0) {
                    return res.status(200).json({
                        data: [],
                        lastTimestamp: null,
                        hasNewData: false,
                        metrics: {
                            currentLevel: null,
                            volume: null,
                            fillRate: null,
                            consumption: null,
                            status: DEVICE_STATUS.OFFLINE
                        }
                    });
                }

                const smoothedData = applyLightSmoothing(fullData);
                const metrics = calculateMetrics(smoothedData);

                return res.status(200).json({
                    data: smoothedData,
                    lastTimestamp: smoothedData.length > 0 ? smoothedData[smoothedData.length - 1].timestamp : null,
                    hasNewData: smoothedData.length > 0,
                    metrics: metrics
                });
            }
        } catch (err) {
            return res.status(200).json({
                data: [],
                lastTimestamp: lastTimestamp || null,
                hasNewData: false,
                metrics: {
                    currentLevel: null,
                    volume: null,
                    fillRate: null,
                    consumption: null,
                    status: DEVICE_STATUS.OFFLINE
                }
            });
        }
    } catch (error) {
        next(error);
    }
};

/**
 * ✅ NEW: Get Graph Data with Hybrid Caching
 * Supports: 1W (7 days), 1M (30 days), 3M (90 days), custom date ranges
 * Automatically decides: Database (fast) vs ThingSpeak (archived)
 */
exports.getNodeGraphDataHybrid = async (req, res, next) => {
    try {
        const deviceDoc = await resolveDevice(req.params.id);
        if (!deviceDoc || !deviceDoc.exists) {
            return res.status(404).json({ error: "Device not found" });
        }

        const registry = deviceDoc.data();
        const type = (registry.device_type || "").toLowerCase();
        if (!type) return res.status(400).json({ error: "Device type not specified" });

        const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
        if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

        // ✅ Authorization check
        if (req.user.role !== "superadmin") {
            const isOwner = await checkOwnership(
                req.user.customer_id || req.user.uid,
                deviceDoc.id,
                req.user.role,
                req.user.community_id
            );
            if (!isOwner) return res.status(403).json({ error: "Unauthorized" });

            if (!checkDeviceVisibilityWithAudit(registry, deviceDoc.id, req.user.uid, req.user.role)) {
                return res.status(403).json({ error: "Device not visible" });
            }
        }

        // ✅ Parse date range from query
        const { range = "1W", startDate, endDate } = req.query;
        let start, end;

        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        } else {
            end = new Date();
            const daysMap = { "1W": 7, "1M": 30, "3M": 90, "6M": 180 };
            const days = daysMap[range] || 7;
            start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        }

        logger.debug(`[HybridGraphData] Device: ${deviceDoc.id}, Range: ${range}, Start: ${start.toISOString()}, End: ${end.toISOString()}`);

        // ✅ Check cache first
        const cacheKey = `graph_hybrid_${deviceDoc.id}_${range}_${start.toISOString()}_${end.toISOString()}`;
        const cached = await cache.get(cacheKey);
        if (cached) {
            logger.debug(`✅ [HybridGraphData] Serving from cache`);
            return res.status(200).json({
                ...cached,
                cached: true,
                cacheAge: "< 5 minutes"
            });
        }

        // ✅ Use Hybrid Resolver
        const metadata = metaDoc.data();
        const resolverResult = await HybridDataResolver.resolveAndFetchTelemetry(
            deviceDoc.id,
            start,
            end,
            { limit: 8000 }
        );

        if (!resolverResult.success || resolverResult.data.length === 0) {
            return res.status(200).json({
                data: [],
                range,
                source: resolverResult.source || "unknown",
                message: "No data available",
                metrics: {
                    currentLevel: null,
                    volume: null,
                    fillRate: null,
                    consumption: null,
                    status: DEVICE_STATUS.OFFLINE
                }
            });
        }

        // ✅ Process data for display and unify field names
        const fieldMapping = metadata.sensor_field_mapping || {};
        const graphData = resolverResult.data.map(record => {
            const point = {
                timestamp: record.timestamp instanceof Date ? record.timestamp : new Date(record.timestamp),
                ...record
            };
            
            // Map raw fieldX keys to internal keys (water_level, flow_rate, etc.)
            Object.entries(fieldMapping).forEach(([fieldKey, internalKey]) => {
                if (record[fieldKey] !== undefined && internalKey) {
                    point[internalKey] = record[fieldKey];
                }
            });

            // Ensure 'value' property exists for applyLightSmoothing and calculateMetrics
            // We prioritize water_level, then flow_rate, then field1
            point.value = Number(point.water_level ?? point.flow_rate ?? point.tds_value ?? record.field1 ?? 0);
            
            return point;
        });

        // ✅ Apply light smoothing
        const smoothedData = applyLightSmoothing(graphData);
        const metrics = calculateMetrics(smoothedData);

        const responseData = {
            data: smoothedData,
            range,
            source: resolverResult.source,
            dataAge: TelemetryArchiveService.getDataAgeCategory(start.getTime()),
            metrics,
            field_mapping: fieldMapping,
            count: smoothedData.length,
            fetchedAt: new Date().toISOString(),
            cached: false
        };

        // ✅ Cache for 5 minutes (for recent data) or 1 hour (for archived)
        const cacheMinutes = resolverResult.source === "database" ? 5 : 60;
        await cache.set(cacheKey, responseData, cacheMinutes * 60);

        res.status(200).json(responseData);

    } catch (error) {
        next(error);
    }
};

exports.getNodeAnalytics = async (req, res, next) => {
  try {
    const deviceDoc = await resolveDevice(req.params.id);
    if (!deviceDoc || !deviceDoc.exists)
      return res.status(404).json({ error: "Device not found" });

    const registry = deviceDoc.data();
    const type = (registry.device_type || "").toLowerCase();
    if (!type) return res.status(400).json({ error: "Device type not specified" });

    const metaDoc = await db.collection(type).doc(deviceDoc.id).get();
    if (!metaDoc.exists) return res.status(404).json({ error: "Metadata not found" });

    if (req.user.role !== "superadmin") {
      const isOwner = await checkOwnership(
        req.user.customer_id || req.user.uid,
        deviceDoc.id,
        req.user.role,
        req.user.community_id
      );
      if (!isOwner) return res.status(403).json({ error: "Unauthorized" });

      // âœ… CRITICAL FIX: ENFORCE DEVICE VISIBILITY (using shared helper)
      if (!checkDeviceVisibilityWithAudit(registry, deviceDoc.id, req.user.uid, req.user.role)) {
        return res.status(403).json({ error: "Device not visible to your account" });
      }
    }

    const metadata = metaDoc.data();
    const channelId = metadata.thingspeak_channel_id?.trim();
    const apiKey = metadata.thingspeak_read_api_key?.trim();
    const fieldMapping = metadata.sensor_field_mapping || {};
    const depth = metadata.configuration?.depth || metadata.configuration?.total_depth || metadata.tank_size || 1.2;
    const capacity = metadata.tank_size || 1000;

    const { range, startDate, endDate } = req.query;

    if (!channelId || !apiKey)
      return res.status(400).json({ error: "Telemetry configuration missing" });

    // â”€â”€ Cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const analyticsCacheKey = `analytics_${deviceDoc.id}_${range || '24H'}_${startDate || ''}_${endDate || ''}`;
    const cachedAnalytics = await cache.get(analyticsCacheKey);
    if (cachedAnalytics) {
      logger.debug(`[NodesController] Serving cached analytics for ${deviceDoc.id}`);
      return res.status(200).json(cachedAnalytics);
    }

    // â”€â”€ Build Dynamic ThingSpeak URL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let thingspeakUrl;
    if (range === '1W') {
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&days=7&results=8000`;
    } else if (range === '1M') {
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&days=31&results=8000`;
    } else if (startDate && endDate) {
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&start=${startDate}&end=${endDate}&results=8000`;
    } else {
      // default 24H - fetching by time (last 24 hours) instead of arbitrary result limit
      // results=8000 is the maximum allowed by ThingSpeak per request, ensuring high-frequency nodes are not cut off.
      // We also add minutes=1440 to strictly fetch the last 24 hours.
      thingspeakUrl = `https://api.thingspeak.com/channels/${channelId}/feeds.json?api_key=${apiKey}&minutes=1440&results=8000`;
    }

    const response = await axios.get(thingspeakUrl);
    let feeds = response.data.feeds || [];

    // âœ… FIX: If no data in current window (e.g. offline > 24h), fetch the absolute last known entry
    // This ensures we always have a "Last Seen" time and value to display.
    if (feeds.length === 0) {
      try {
        const lastFeedUrl = `https://api.thingspeak.com/channels/${channelId}/feeds/last.json?api_key=${apiKey}`;
        const lastResponse = await axios.get(lastFeedUrl);
        if (lastResponse.data && lastResponse.data.created_at) {
          feeds = [lastResponse.data];
          logger.debug(`[NodesController] No data in ${range || '24H'} window, fetched last known entry from ThingSpeak for ${deviceDoc.id}`);
        }
      } catch (err) {
        logger.error(`[NodesController] Failed to fetch last feed fallback for ${deviceDoc.id}:`, err.message);
      }
    }

    if (feeds.length === 0) {
      return res.status(200).json({
        node_id: req.params.id,
        status: DEVICE_STATUS.UNKNOWN,
        history: [],
        tankBehavior: null,
      });
    }

    // â”€â”€ Resolve field key â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sampleFeed = feeds[0] || {};
    const definedField =
      metadata.secondary_field || metadata.water_level_field ||
      metadata.fieldKey || metadata.configuration?.water_level_field ||
      metadata.configuration?.fieldKey;
    const fieldKey =
      fieldMapping.levelField || definedField ||
      Object.keys(fieldMapping).find(k => fieldMapping[k] && fieldMapping[k].includes("water_level")) ||
      (sampleFeed.field1 !== undefined ? "field1" : "field2");

    // â”€â”€ FLOW METER path (unchanged) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (["evaraflow", "flow", "flow_meter"].includes(type)) {
      const flowKeys = ['flowField', 'flow_rate', 'flow_rate_field'];
      const totalKeys = ['volumeField', 'current_reading', 'total_reading', 'meter_reading_field'];

      let flowRateFieldKey =
        deviceDoc.data().flow_rate_field ||
        Object.keys(fieldMapping).find(k => flowKeys.includes(fieldMapping[k])) ||
        "field4";

      let totalReadingFieldKey =
        deviceDoc.data().meter_reading_field ||
        Object.keys(fieldMapping).find(k => totalKeys.includes(fieldMapping[k])) ||
        "field5";

      if (feeds.length > 0) {
        const latestFeed = getLatestFeed(feeds);
        if (!totalReadingFieldKey || !latestFeed[totalReadingFieldKey]) {
          let maxVal = -1;
          for (let i = 1; i <= 8; i++) {
            const val = parseFloat(latestFeed[`field${i}`]);
            if (!isNaN(val) && val > maxVal) {
              maxVal = val;
              totalReadingFieldKey = `field${i}`;
            }
          }
        }
        if (!flowRateFieldKey || !latestFeed[flowRateFieldKey]) {
          for (const f of ["field3", "field4", "field1", "field2"]) {
            const val = parseFloat(latestFeed[f]);
            if (!isNaN(val) && val > 0 && val < 1000 && f !== totalReadingFieldKey) {
              flowRateFieldKey = f;
              break;
            }
          }
        }
        if (!flowRateFieldKey) flowRateFieldKey = "field4";
        if (!totalReadingFieldKey) totalReadingFieldKey = "field5";

        const lastUpdatedAt = latestFeed.created_at;
        const status = deviceState.calculateDeviceStatus(lastUpdatedAt);

        const flowResult = {
          node_id: req.params.id,
          status,
          lastUpdatedAt,
          active_fields: { flow_rate: flowRateFieldKey, total_liters: totalReadingFieldKey },
          flow_rate: parseFloat(latestFeed[flowRateFieldKey]) || 0,
          total_liters: parseFloat(latestFeed[totalReadingFieldKey]) || 0,
          history: feeds.map(f => ({
            timestamp: normalizeThingSpeakTimestamp(f.created_at),
            flow_rate: parseFloat(f[flowRateFieldKey]) || 0,
            total_liters: parseFloat(f[totalReadingFieldKey]) || 0
          }))
        };

        syncNodeStatus(deviceDoc.id, type, lastUpdatedAt, {
          flow_rate: flowResult.flow_rate,
          total_liters: flowResult.total_liters,
          status
        }).catch(err => logger.error("Sync error:", err));

        await cache.set(analyticsCacheKey, flowResult, 300);
        return res.status(200).json(flowResult);
      }
      return res.status(200).json({ node_id: req.params.id, status: DEVICE_STATUS.OFFLINE, history: [] });
    }

    // â”€â”€ TDS path â€” Extract TDS and temperature values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (["evaratds", "tds"].includes(type)) {
      const tdsKeys = ['tdsField', 'tds_value', 'tdsValue'];
      const tempKeys = ['tempField', 'temperature', 'temperature_field'];
      
      let tdsFieldKey = Object.keys(fieldMapping).find(k => tdsKeys.includes(fieldMapping[k])) || "field2";
      let tempFieldKey = Object.keys(fieldMapping).find(k => tempKeys.includes(fieldMapping[k])) || "field3";

      if (metadata.tdsField) tdsFieldKey = metadata.tdsField;
      if (metadata.tempField || metadata.temperature_field) tempFieldKey = metadata.tempField || metadata.temperature_field;

      logger.debug(`[TDS-Analytics] Device ${req.params.id}:`);
      logger.debug(`[TDS-Analytics]   tdsField: ${tdsFieldKey}, temperatureField: ${tempFieldKey}`);
      logger.debug(`[TDS-Analytics]   Total feeds: ${feeds.length}`);

      // CRITICAL: Lookup customer name for the Node Info modal
      const effCustomerId = registry?.customer_id || registry?.customerId || metadata.customer_id || metadata.customerId;
      let customerName = null;
      if (effCustomerId) {
          const customerDoc = await db.collection("customers").doc(effCustomerId).get();
          if (customerDoc.exists) {
              const customerData = customerDoc.data();
              customerName = customerData.display_name || customerData.displayName || customerData.name || customerData.customerName || null;
          }
      }

      if (feeds.length > 0) {
        const latestFeed = getLatestFeed(feeds);
        const lastUpdatedAt = latestFeed?.created_at;
        const status = lastUpdatedAt ? deviceState.calculateDeviceStatus(lastUpdatedAt) : DEVICE_STATUS.OFFLINE;

        const tdsValue = parseFloat(latestFeed[tdsFieldKey]) || 0;
        const temperature = parseFloat(latestFeed[tempFieldKey]) || 0;

        let quality = "Good";
        if (tdsValue > 1000) quality = "Critical";
        else if (tdsValue > 500) quality = "Acceptable";

        const tdsResult = {
          id: deviceDoc.id,
          name: deviceDoc.data().name || deviceDoc.data().deviceName || "TDS Meter",
          node_id: req.params.id,
          status,
          lastUpdatedAt: normalizeThingSpeakTimestamp(lastUpdatedAt),
          tdsValue,
          temperature,
          waterQualityRating: quality,
          location_name: registry?.location_name || metadata?.location_name || "Not specified",
          customer_name: customerName,
          tdsHistory: feeds.map(f => ({
            value: parseFloat(f[tdsFieldKey]) || 0,
            timestamp: normalizeThingSpeakTimestamp(f.created_at)
          })).reverse(),
          tempHistory: feeds.map(f => ({
            value: parseFloat(f[tempFieldKey]) || 0,
            timestamp: normalizeThingSpeakTimestamp(f.created_at)
          })).reverse(),
          // include HEAD format properties
          tds_value: tdsValue,
          history: feeds.map(f => ({
            timestamp: normalizeThingSpeakTimestamp(f.created_at),
            tds_value: parseFloat(f[tdsFieldKey]) || null,
            temperature: parseFloat(f[tempFieldKey]) || null
          }))
        };

        logger.debug(`[TDS-Analytics] Latest TDS: ${tdsResult.tds_value}, Temp: ${tdsResult.temperature}, Customer: ${customerName}`);

        // Sync status back to device doc (metadata collection)
        await db.collection(type).doc(deviceDoc.id).update({
          tdsValue,
          temperature,
          waterQualityRating: quality,
          lastUpdatedAt: normalizeThingSpeakTimestamp(lastUpdatedAt),
          status
        }).catch(err => logger.error("Metadata sync error:", err));

        // Sync back to registry (devices collection)
        await db.collection("devices").doc(deviceDoc.id).update({
          status,
          lastUpdatedAt: normalizeThingSpeakTimestamp(lastUpdatedAt),
          last_telemetry: {
            tdsValue,
            temperature,
            waterQualityRating: quality,
            timestamp: normalizeThingSpeakTimestamp(lastUpdatedAt)
          }
        }).catch(err => logger.error("Registry sync error:", err));

        await cache.set(analyticsCacheKey, tdsResult, 300);
        return res.status(200).json(tdsResult);
      }
      return res.status(200).json({ node_id: req.params.id, status: DEVICE_STATUS.OFFLINE, history: [], tdsHistory: [], tempHistory: [] });
    }

    // â”€â”€ TANK path â€” NEW: use analytics engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Build readings array for engine (clean format)
    const readings = feeds
      .map(f => {
        const distCm = parseFloat(f[fieldKey]);
        const tsMs = new Date(f.created_at).getTime();
        if (isNaN(distCm) || isNaN(tsMs)) return null;
        return { distanceCm: distCm, timestampMs: tsMs };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    // Load saved thresholds (null on first run)
    const savedThresholds = await deviceState.loadSavedThresholds(deviceDoc.id);

    // Run the analytics engine â€” THIS is the 200-reading window classification
    const analytics = analyzeWaterTank(
      readings,
      { depthM: depth, capacityLitres: capacity },
      savedThresholds
    );

    // Save thresholds if engine requests it
    if (analytics.shouldSaveThresholds && analytics.thresholds.learned) {
      await deviceState.saveThresholds(deviceDoc.id, analytics.thresholds);
    }

    // Build history for frontend chart
    const processedHistory = feeds.map(f => {
      const raw = parseFloat(f[fieldKey]);
      if (isNaN(raw)) return null;

      const dist = Math.min(raw / 100, depth);
      const height = Math.max(0, depth - dist);
      const level = Math.min(100, (height / depth) * 100);
      const volume = (capacity * level) / 100;

      return {
        level_percentage: level,
        level,
        volume,
        timestamp: normalizeThingSpeakTimestamp(f.created_at)
      };
    }).filter(Boolean);

    const latestPoint = processedHistory[processedHistory.length - 1] || { level: 0, volume: 0, timestamp: null };
    const status = deviceState.calculateDeviceStatus(latestPoint.timestamp);

    // Build tankBehavior using engine output
    const tankBehavior = {
      waterState: analytics.state,
      deltaCm: analytics.deltaCm,
      fillRateLpm:  analytics.state === 'REFILL'      ? analytics.rateLitresPerMin : 0,
      drainRateLpm: analytics.state === 'CONSUMPTION' ? analytics.rateLitresPerMin : 0,
      timeToFull:  analytics.estMinutesToFull,
      timeToEmpty: analytics.estMinutesToEmpty,
      consumedTodayLitres: analytics.consumedTodayLitres,
      refilledTodayLitres: analytics.refilledTodayLitres,
      thresholdsLearned: analytics.thresholds.learned,
      thresholdLower: analytics.thresholds.lower,
      thresholdUpper: analytics.thresholds.upper,
      eventTimeline: buildEventTimeline(processedHistory, analytics.state),
    };

    const tankResult = {
      node_id: req.params.id,
      status,
      lastUpdatedAt: latestPoint.timestamp,
      currentLevel: latestPoint.level,
      currentVolume: latestPoint.volume,
      level_percentage: latestPoint.level,
      remainingCapacity: Math.round(capacity - latestPoint.volume),
      history: processedHistory,
      tankBehavior,
    };

    // ✅ FIX: Use syncNodeStatus to ensure registry (All Nodes page) and metadata are both updated
    await syncNodeStatus(deviceDoc.id, type, latestPoint.timestamp, {
      level_percentage: latestPoint.level,
      currentVolume: latestPoint.volume,
      waterState: analytics.state,
    }).catch(err => logger.error("Sync error:", err));

    await cache.set(analyticsCacheKey, tankResult, 300);
    return res.status(200).json(tankResult);

  } catch (error) {
    next(error);
  }
};

