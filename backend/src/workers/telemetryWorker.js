const { db } = require("../config/firebase.js");
const logger = require("../utils/logger.js"); // ✅ AUDIT FIX M10
const cacheService = require("../services/cacheService.js");
const cache = require("../config/cache.js");
const { fetchSixHourData } = require("../services/thingspeakService.js");
const deviceState = require("../services/deviceStateService.js");
const { startStatusCron, stopStatusCron } = require("./deviceStatusCron.js");

// ─── #17 FIX: MQTT Message Deduplication ──────────────────────────────────
// ORIGINAL BUG: If an MQTT message arrived twice (network retry), Firestore
// was updated twice with the same data. No cache key = no deduplication.
// Also created duplicate entries in audit logs and inflated analytics counts.
//
// FIX: Store a "seen message ID" cache with 5-minute TTL. Skip processing
// if we've already handled this message recently.
const MQTT_DEDUP_TTL = 300; // 5 minutes

// SaaS Architecture: Redis Pub/Sub Support
const pubSub = cache.getPubSub();
const pub = pubSub ? pubSub.pub : null;

// Local fallback for dev/single-instance
const EventEmitter = require('events');
const telemetryEvents = new EventEmitter();
telemetryEvents.setMaxListeners(0);

// ✅ CRITICAL FIX #4: Store Firestore listeners for cleanup on shutdown
const firestoreListeners = [];

const POLL_INTERVAL = 60 * 1000; // 1 minute
const BATCH_SIZE = 5; // How many concurrent requests to ThingSpeak to avoid ban
const STATUS_CHECK_INTERVAL = 60 * 1000; // 1 minute cron job
let telemetryPollTimer = null;
let pollInProgress = false;

const CHUNK_SIZE = 200;

async function* getActiveDevicesInChunks() {
    // 1. Try to get from Cache to save 144M Firestore reads/day
    try {
        const cachedList = await cache.get("nodes:polling:list");
        if (cachedList && Array.isArray(cachedList)) {
            logger.info(`Cache hit: Using cached active device list (${cachedList.length} devices)`, { category: "telemetry" });
            for (let i = 0; i < cachedList.length; i += CHUNK_SIZE) {
                yield cachedList.slice(i, i + CHUNK_SIZE);
            }
            return;
        }
    } catch (err) {
        logger.warn("Failed to read from cache, falling back to Firestore", { error: err.message, category: "telemetry" });
    }

    logger.info("Cache miss: Loading active device list from Firestore in chunks...", { category: "telemetry" });
    const allDevicesToCache = [];
    let lastDoc = null;
    
    while (true) {
        let query = db.collection("devices")
            .where("status", "not-in", ["OFFLINE_STOPPED", "DECOMMISSIONED"])
            .limit(CHUNK_SIZE);
        
        if (lastDoc) query = query.startAfter(lastDoc);

        const snapshot = await query.get();
        if (snapshot.empty) break;

        const typedGroups = {};
        const registryDataMap = {};

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const type = data.device_type;
            if (!type) continue;
            
            if (!typedGroups[type]) typedGroups[type] = [];
            typedGroups[type].push(doc.id);
            registryDataMap[doc.id] = data;
        }

        const devices = [];
        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                const typeLower = type.toLowerCase();
                
                const primaryRefs = ids.map(id => db.collection(typeLower).doc(id));
                const primaryMetas = await db.getAll(...primaryRefs);
                
                const results = [];
                const missingIds = [];
                
                primaryMetas.forEach((m, idx) => {
                    if (m.exists) {
                        results.push({ id: ids[idx], meta: m.data() });
                    } else {
                        missingIds.push(ids[idx]);
                    }
                });
                
                if (missingIds.length > 0) {
                    const secondaryRefs = [];
                    const secondaryIdMap = [];
                    
                    missingIds.forEach(id => {
                        const registry = registryDataMap[id];
                        const hId = registry.hardware_id || registry.node_id || registry.device_id;
                        if (hId && hId !== id) {
                            secondaryRefs.push(db.collection(typeLower).doc(hId));
                            secondaryIdMap.push(id);
                        }
                    });
                    
                    if (secondaryRefs.length > 0) {
                        const secondaryMetas = await db.getAll(...secondaryRefs);
                        secondaryMetas.forEach((m, idx) => {
                            if (m.exists) {
                                results.push({ id: secondaryIdMap[idx], meta: m.data() });
                            }
                        });
                    }
                }
                
                return results;
            })
        );

        for (const batch of typeBatches) {
            for (const item of batch) {
                const { id, meta } = item;
                if (meta.thingspeak_channel_id && meta.thingspeak_read_api_key) {
                    const mappedDevice = {
                        ...registryDataMap[id],
                        ...meta,
                        id: id,
                        type: registryDataMap[id].device_type,
                        channel: meta.thingspeak_channel_id.trim(),
                        key: meta.thingspeak_read_api_key.trim(),
                        mapping: meta.sensor_field_mapping || {},
                        depth: meta.configuration?.depth || meta.configuration?.total_depth || meta.tank_size || 1.2,
                        capacity: meta.tank_size || 0,
                        lastUpdatedAt: meta.lastUpdatedAt || meta.last_updated_at || meta.last_seen || null,
                        status: meta.status || "OFFLINE"
                    };
                    devices.push(mappedDevice);
                    allDevicesToCache.push(mappedDevice);
                }
            }
        }
        
        yield devices;
        
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.docs.length < CHUNK_SIZE) break;
    }
    
    // Cache the fully built list for 1 hour to prevent massive Firestore reads
    try {
        await cache.set("nodes:polling:list", allDevicesToCache, 3600);
    } catch (err) {
        logger.warn("Failed to save active devices to cache", { error: err.message, category: "telemetry" });
    }
}

async function processDevice(device) {
    try {
        // ─── Deduplication: Skip if we recently processed this exact device ────
        const dedupKey = `mqtt_dedup_${device.id}`;
        const lastProcessed = await cache.get(dedupKey);
        
        const feeds = await fetchSixHourData(device.channel, device.key);
        if (!feeds.length) return;

        // Create a fingerprint of this data update to detect duplicates
        const feedFingerprint = JSON.stringify(feeds.map(f => f.created_at));
        
        // If we processed the exact same timestamp sequence recently, skip it
        if (lastProcessed === feedFingerprint) {
            logger.info(`Skipping duplicate update for ${device.id}`, { category: "telemetry", deviceId: device.id });
            return;
        }

        // CRITICAL FIX: Use centralized processing logic
        const telemetryData = await deviceState.processThingSpeakData(device, feeds);
        if (!telemetryData) return;

        // CRITICAL FIX: Update Firestore with standardized payload
        await deviceState.updateFirestoreTelemetry(device.type, device.id, telemetryData, feeds, device);

        // ✅ CRITICAL: Also update registry with latest last_seen so status is consistent everywhere
        const dataTs = telemetryData.lastUpdatedAt || new Date().toISOString();
        await db.collection("devices").doc(device.id).update({
            last_seen: dataTs,
            last_updated_at: dataTs,
            status: telemetryData.status,
            updated_at: dataTs
        }).catch(err => {
            if (err.code === 'not-found') {
                logger.warn(`[TelemetryWorker] Registry doc not found for ${device.id}, skipping registry update`);
            } else {
                throw err;
            }
        });

        // Record that we processed this device's data with this fingerprint
        await cache.set(dedupKey, feedFingerprint, MQTT_DEDUP_TTL);

        // CRITICAL FIX: Emit real-time update via Socket.IO
        const payload = {
            deviceId: device.id,
            percentage: telemetryData.percentage,
            level_percentage: telemetryData.percentage, // Include for consistency
            volume: telemetryData.volume,
            flow_rate: telemetryData.flow_rate,
            total_liters: telemetryData.total_liters,
            tds_value: telemetryData.tds_value,
            temperature: telemetryData.temperature,
            water_quality: telemetryData.water_quality,
            lastUpdatedAt: telemetryData.lastUpdatedAt,
            timestamp: telemetryData.lastUpdatedAt,
            status: telemetryData.status,
            raw_data: telemetryData.raw_data
        };

        if (pub) {
            pub.publish(`device:update:${device.id}`, JSON.stringify(payload));
        } else {
            telemetryEvents.emit("device:update", payload);
        }
        
        const percentage = telemetryData.percentage ?? telemetryData.level_percentage ?? null;
        logger.telemetry(device.id, "updated", { percentage, status: telemetryData.status, tds_value: telemetryData.tds_value, temperature: telemetryData.temperature });
        const detail = telemetryData.tds_value !== undefined 
            ? `TDS: ${telemetryData.tds_value}ppm, Temp: ${telemetryData.temperature}Â°C`
            : percentage !== null
                ? `${Number(percentage).toFixed(1)}%`
                : "telemetry updated";
            
        logger.debug(`[TelemetryWorker] Updated ${device.id}: ${detail} (${telemetryData.status})`);

        // ✅ AFTER UPDATE: Invalidate graph cache
        // So the next request gets fresh data from Firestore aggregated view
        await cache.del(`graph:${device.id}:6H`);
        await cache.del(`graph:${device.id}:24H`);
    } catch (err) {
        logger.error(`Error processing device ${device.id}`, err, { category: "telemetry", deviceId: device.id });
    }
}

const POLL_LOCK_KEY = 'telemetry:poll:lock';
const POLL_LOCK_TTL = 55; // 55 seconds, slightly less than the 60s interval

async function runPoll() {
    if (pollInProgress) {
        logger.warn("[TelemetryWorker] Previous poll still running, skipping overlap", { category: "telemetry" });
        return;
    }
    
    // ✅ CRITICAL FIX: Distributed Lock to prevent AWS ECS multi-instance collisions
    if (cache.isRedisReady && cache.redis) {
        try {
            const acquired = await cache.redis.set(POLL_LOCK_KEY, '1', 'EX', POLL_LOCK_TTL, 'NX');
            if (!acquired) {
                logger.info('[TelemetryWorker] Poll lock held by another instance, skipping.', { category: "telemetry" });
                return;
            }
        } catch (err) {
            logger.error('[TelemetryWorker] Failed acquiring distributed lock; failing closed to prevent duplicate processing', { error: err.message, category: "telemetry" });
            pollInProgress = false;
            return;
        }
    }

    pollInProgress = true;

    try {
        logger.info("Starting distributed telemetry poll...", { category: "telemetry" });
        let totalProcessed = 0;

        for await (const devicesChunk of getActiveDevicesInChunks()) {
            if (devicesChunk.length === 0) continue;
            
            totalProcessed += devicesChunk.length;

            // Process within the chunk in smaller batches so we don't accidentally Ddos Thingspeak
            for (let i = 0; i < devicesChunk.length; i += BATCH_SIZE) {
                const batch = devicesChunk.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(d => processDevice(d)));
                // Tiny 50ms sleep between batches
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        logger.info(`Poll complete. Processed ${totalProcessed} devices`, { category: "telemetry" });
    } catch (err) {
        logger.error("Error during poll", err, { category: "telemetry" });
    } finally {
        if (cache.isRedisReady && cache.redis) {
            try {
                await cache.redis.del(POLL_LOCK_KEY);
            } catch (err) {
                logger.warn('[TelemetryWorker] Failed to release distributed lock', { error: err.message });
            }
        }
        pollInProgress = false;
    }
}

// Start the worker
function startWorker() {
    if (telemetryPollTimer) {
        logger.warn("[TelemetryWorker] startWorker called while already running; skipping duplicate start", { category: "telemetry" });
        return;
    }

    logger.info(`TelemetryWorker initialized, polling every ${POLL_INTERVAL}ms`, { category: "telemetry", interval: POLL_INTERVAL });
    
    // Run immediately once with error handling
    runPoll().catch(err => {
        logger.error('[TelemetryWorker] Initial poll failed', { error: err.message, category: 'telemetry' });
    });
    
    // Then loop with error handling - wrap setInterval callback to catch promise rejections
    telemetryPollTimer = setInterval(async () => {
        try {
            await runPoll();
        } catch (err) {
            logger.error('[TelemetryWorker] Poll cycle failed', { error: err.message, category: 'telemetry' });
        }
    }, POLL_INTERVAL);
    
    // ✅ .unref() lets Node.js exit cleanly during ECS SIGTERM/SIGKILL
    telemetryPollTimer.unref();
    
    // CRITICAL FIX: Start dedicated status cron job (runs every 1 minute)
    startStatusCron();
}

// ✅ CRITICAL FIX #4: Register a Firestore listener for cleanup on shutdown
function registerFirestoreListener(unsubscribeFn) {
    if (unsubscribeFn && typeof unsubscribeFn === 'function') {
        firestoreListeners.push(unsubscribeFn);
        logger.debug('[TelemetryWorker] Firestore listener registered for cleanup', { count: firestoreListeners.length });
    }
}

// ✅ CRITICAL FIX #4: Graceful shutdown handler
// Called on SIGTERM (Railway, Heroku, or manual shutdown)
function setupGracefulShutdown() {
    const shutdownHandler = async (signal) => {
        logger.info(`[TelemetryWorker] Shutdown signal received (${signal})`, { signal });
        
        try {
            if (telemetryPollTimer) {
                clearInterval(telemetryPollTimer);
                telemetryPollTimer = null;
            }
            stopStatusCron();

            // Unsubscribe from all Firestore listeners
            let cleanedCount = 0;
            for (const unsubscribeFn of firestoreListeners) {
                try {
                    unsubscribeFn();
                    cleanedCount++;
                } catch (err) {
                    logger.error('[TelemetryWorker] Listener unsubscribe failed on shutdown', { error: err.message });
                }
            }
            
            if (cleanedCount > 0) {
                logger.debug('[TelemetryWorker] Firestore listeners cleaned up on shutdown', { count: cleanedCount });
            }
            
            firestoreListeners.length = 0; // Clear the array
        } catch (err) {
            logger.error('[TelemetryWorker] Error during graceful shutdown', { error: err.message });
        }
        
        process.exit(0);
    };
    
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
}

// Start graceful shutdown handler when worker starts
if (require.main === module) {
    setupGracefulShutdown();
}

// Standalone execution support (for Render Background Worker)
if (require.main === module) {
    startWorker();
}

module.exports = { startWorker, telemetryEvents, registerFirestoreListener };
