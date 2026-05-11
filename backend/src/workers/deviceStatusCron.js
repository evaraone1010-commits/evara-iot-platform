const { db, admin } = require("../config/firebase.js");
const logger = require("../utils/logger.js"); // ✅ AUDIT FIX M10
const deviceState = require("../services/deviceStateService.js");
const cache = require("../config/cache.js");

const CHUNK_SIZE = 200;

/**
 * deviceStatusCron.js
 * 
 * CRITICAL COMPONENT: Runs every 1 minute to recalculate ALL device statuses
 * This ensures status accuracy even when no new data arrives
 * 
 * Architecture:
 * - Independent from telemetry polling
 * - Sweeps all devices in database
 * - Updates status based on timestamp freshness
 * - Uses centralized deviceState.calculateDeviceStatus()
 */

// ✅ AUDIT FIX M1: Increased from 60s to 5 min — status checks don't need to be real-time
const STATUS_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes (was 60s)
const FIRESTORE_BATCH_LIMIT = 400;
const CRON_LOCK_KEY = "cron:device-status-sweep";
let statusCronTimer = null;
let sweepInProgress = false;

/**
 * Async generator — yields CHUNK_SIZE devices at a time from registry
 * Uses cursor-based pagination for stable sweeps
 */
async function* getActiveDevicesInChunks() {
  let lastDoc = null;
  while (true) {
    try {
      let query = db.collection('devices')
        .where('status', 'not-in', ['OFFLINE_STOPPED', 'DECOMMISSIONED'])
        .orderBy('status', 'asc')
        .orderBy('device_id', 'asc')
        .limit(CHUNK_SIZE);

      if (lastDoc) query = query.startAfter(lastDoc);

      const snap = await query.get();
      if (snap.empty) break;

      yield snap.docs;

      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < CHUNK_SIZE) break; // last page
    } catch (err) {
      logger.error('[DeviceStatusCron] Generator fetch failed', { error: err.message });
      break;
    }
  }
}

async function tryAcquireCronLock() {
  if (!cache?.isRedisReady || !cache?.redis) return true;

  try {
    const lockTtlSec = Math.max(60, Math.floor(STATUS_CHECK_INTERVAL / 1000) - 10);
    const lockValue = `${process.pid}-${Date.now()}`;
    const acquired = await cache.redis.set(CRON_LOCK_KEY, lockValue, "EX", lockTtlSec, "NX");
    return acquired === "OK";
  } catch (err) {
    logger.error("[DeviceStatusCron] Failed to acquire distributed lock; failing closed to prevent duplicate sweeps", {
      category: "cron",
      error: err.message
    });
    return false;
  }
}

async function recalculateAllDevicesStatus() {
  if (sweepInProgress) {
    logger.warn("[DeviceStatusCron] Previous sweep still running, skipping overlap", { category: "cron" });
    return;
  }

  sweepInProgress = true;
  const hasLock = await tryAcquireCronLock();
  if (!hasLock) {
    logger.debug("[DeviceStatusCron] Skip sweep; lock held by another instance", { category: "cron" });
    sweepInProgress = false;
    return;
  }

  try {
    logger.info('Starting distributed status recalculation sweep', { category: 'cron' });
    let totalProcessed = 0;
    let totalChanges = 0;
    const now = new Date();

    for await (const chunkDocs of getActiveDevicesInChunks()) {
        const batch = db.batch();
        const registryMap = {};
        const typedGroups = {};
        
        // 1. Group chunk by device type for metadata fetch
        for (const doc of chunkDocs) {
            const data = doc.data();
            const type = data.device_type;
            if (type) {
                if (!typedGroups[type]) typedGroups[type] = [];
                typedGroups[type].push(doc.id);
                registryMap[doc.id] = data;
            }
        }

        // 2. Fetch metadata for this chunk concurrently
        const allTypeItems = [];
        const typeBatches = await Promise.all(
            Object.keys(typedGroups).map(async (type) => {
                const ids = typedGroups[type];
                const refs = ids.map(id => db.collection(type.toLowerCase()).doc(id));
                const metas = await db.getAll(...refs);
                return metas
                    .filter(m => m.exists)
                    .map(m => ({ id: m.id, type, meta: m.data() }));
            })
        );
        
        typeBatches.forEach(batch => allTypeItems.push(...batch));

        // 3. Recalculate status and queue updates
        let chunkChanges = 0;
        for (const item of allTypeItems) {
            const { id: deviceId, type, meta } = item;
            const registry = registryMap[deviceId];
            
            const lastUpdatedAt = 
              meta.last_updated_at ||
              meta.last_online_at ||
              meta.last_seen ||
              meta.lastUpdatedAt;
            
            const currentStatus = meta.status || "OFFLINE";
            const desiredStatus = !lastUpdatedAt 
              ? 'OFFLINE' 
              : deviceState.calculateDeviceStatus(lastUpdatedAt);
            
            if (currentStatus !== desiredStatus) {
              const statusData = {
                status: desiredStatus,
                statusLastChecked: admin.firestore.FieldValue.serverTimestamp()
              };

              // Update Metadata Doc
              batch.update(db.collection(type.toLowerCase()).doc(deviceId), statusData);
              
              // Update Registry Doc
              if (registry) {
                batch.update(db.collection('devices').doc(deviceId), statusData);
              }
              
              chunkChanges++;
              totalChanges++;

              // Broadcast via Socket.io
              const customerId = registry?.customer_id || registry?.customerId || meta.customer_id || meta.customerId;
              if (customerId && global.io) {
                global.io.to(`customer:${customerId}`).emit('device:status-changed', {
                  deviceId,
                  oldStatus: currentStatus,
                  newStatus: desiredStatus,
                  lastUpdated: lastUpdatedAt,
                  timestamp: now.toISOString()
                });
              }
            }
        }

        if (chunkChanges > 0) {
          await batch.commit();
        }

        totalProcessed += chunkDocs.length;
        logger.debug(`[DeviceStatusCron] Processed chunk of ${chunkDocs.length} devices (${chunkChanges} changes)`);

        // Yield control to event loop
        await new Promise(resolve => setImmediate(resolve));
    }

    logger.info(`Status sweep complete`, { category: 'cron', totalProcessed, totalChanges });
  } catch (err) {
    logger.error('DeviceStatusCron critical error', err, { category: 'cron' });
    throw err;
  } finally {
    sweepInProgress = false;
  }
}

/**
 * Start the cron job
 * Can be run as part of telemetryWorker or standalone
 */
function startStatusCron() {
  if (statusCronTimer) {
    logger.warn("[DeviceStatusCron] startStatusCron called more than once; ignoring duplicate", { category: "cron" });
    return statusCronTimer;
  }

  logger.info(`DeviceStatusCron initialized, running every ${STATUS_CHECK_INTERVAL}ms`, { category: 'cron', interval: STATUS_CHECK_INTERVAL });
  
  // Run immediately on startup
  recalculateAllDevicesStatus().catch(err => logger.error('Initial status sweep failed', err, { category: 'cron' }));
  
  // Then run on interval with error handling - wrap setInterval callback to catch promise rejections
  statusCronTimer = setInterval(async () => {
    try {
      await recalculateAllDevicesStatus();
    } catch (err) {
      logger.error('[DeviceStatusCron] Status sweep cycle failed', { error: err.message, category: 'cron' });
    }
  }, STATUS_CHECK_INTERVAL);

  // ✅ .unref() lets Node.js exit cleanly during AWS ECS task termination
  statusCronTimer.unref();

  return statusCronTimer;
}

function stopStatusCron() {
  if (!statusCronTimer) return;
  clearInterval(statusCronTimer);
  statusCronTimer = null;
}

// Support standalone execution (e.g., Railway background worker)
if (require.main === module) {
  startStatusCron();
}

module.exports = {
  recalculateAllDevicesStatus,
  startStatusCron,
  stopStatusCron,
  STATUS_CHECK_INTERVAL
};
