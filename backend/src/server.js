// Load environment variables based on NODE_ENV
const path = require('path');
if (process.env.NODE_ENV === 'production') {
  // In production (Railway), load a dedicated, non-ignored .env file.
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'production.env'), override: true });
} else {
  // In development, load the standard, ignored .env file.
  require('dotenv').config();
}

const http = require("http");
const schedule = require("node-schedule");
const Sentry = require("@sentry/node");

const { app, allowedOrigins } = require("./app.js");
const { initSocket } = require("./socket.js");
const validateEnv = require("./utils/validateEnv.js");
const { logger } = require("./config/pino.js");
const { hasExplicitFirebaseCredentials, getFirebaseCredentialSource } = require("./config/firebase.js");
const cache = require("./config/cache.js");
const { initializeCacheVersions } = require("./utils/cacheVersioning.js");
const TelemetryArchiveService = require("./services/telemetryArchiveService.js");
const { startWorker } = require("./workers/telemetryWorker.js");

function hasFirestoreConfig() {
  return hasExplicitFirebaseCredentials();
}

// ============================================================================
// Global State
// ============================================================================
const TELEMETRY_CLEANUP_LOCK_KEY = "cron:telemetry-cleanup";
let telemetryCleanupJob = null;
let telemetryCleanupRunning = false;
let mqttRuntime = null;

// ============================================================================
// Pre-flight validation
// ============================================================================
validateEnv();

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [Sentry.expressIntegration()],
  });
}

// ============================================================================
// Server Initialization
// ============================================================================
const server = http.createServer(app);
const io = initSocket(server, allowedOrigins);

async function tryAcquireDistributedLock(key, ttlSeconds) {
  if (!cache?.isRedisReady || !cache?.redis) return false;
  try {
    const lockValue = `${process.pid}-${Date.now()}`;
    const acquired = await cache.redis.set(key, lockValue, "EX", ttlSeconds, "NX");
    return acquired === "OK";
  } catch (err) {
    logger.error({ key, error: err.message }, "[Lock] Redis lock acquisition failed");
    return false;
  }
}

function initializeMqttIngestion() {
  const shouldEnable = process.env.ENABLE_MQTT !== "false";
  const hasConfig = !!(process.env.MQTT_BROKER_URL && process.env.MQTT_USERNAME && process.env.MQTT_PASSWORD);
  if (!shouldEnable || !hasConfig) return;

  try {
    mqttRuntime = require("./services/mqttClient.js");
    logger.info("[MQTT] Ingestion service initialized");
  } catch (err) {
    logger.error("[MQTT] Failed to initialize ingestion service:", err.message);
    if (process.env.NODE_ENV === "production") process.exit(1);
  }
}

// ============================================================================
// Lifecycle Management
// ============================================================================
let PORT = process.env.PORT || 8000;

async function startServer() {
  try {
    if (process.env.NODE_ENV === 'production') {
      if (process.env.REDIS_URL) await validateEnv.testRedisConnection(5000);
      if (process.env.MQTT_BROKER_URL) await validateEnv.testMqttConnection(5000);
    }

    server.listen(PORT, '0.0.0.0', async () => {
        logger.info(`[Server] ✅ Backend running on port ${PORT}`);
        
        if (process.env.NODE_ENV !== 'test' && hasFirestoreConfig()) {
          try { await initializeCacheVersions(); } catch (err) { logger.warn({ error: err.message }, '[Server] Cache versioning failed'); }
        } else if (process.env.NODE_ENV !== 'test') {
          logger.info(`[Server] Skipping Firestore cache version initialization; Firebase credential source is '${getFirebaseCredentialSource()}'.`);
        }

        // Schedule daily telemetry cleanup
        try {
            const policy = TelemetryArchiveService.getRetentionPolicy();
            const cleanupTime = `${policy.cleanupHour} ${policy.cleanupMinute} * * *`;
            telemetryCleanupJob = schedule.scheduleJob(cleanupTime, async () => {
                if (telemetryCleanupRunning) return;
                const hasLock = await tryAcquireDistributedLock(TELEMETRY_CLEANUP_LOCK_KEY, 3600);
                if (!hasLock) return;
                telemetryCleanupRunning = true;
                try {
                    const result = await TelemetryArchiveService.cleanupOldTelemetry();
                    if (result.success) await TelemetryArchiveService.logCleanupStats();
                } finally { telemetryCleanupRunning = false; }
            });
        } catch (err) { logger.error({ error: err.message }, '[Server] Cleanup scheduling failed'); }
        
        if (process.env.NODE_ENV !== "test" && hasFirestoreConfig()) {
          initializeMqttIngestion();
          startWorker();
        } else if (process.env.NODE_ENV !== "test") {
          logger.info(`[Server] Skipping telemetry worker startup; Firebase credential source is '${getFirebaseCredentialSource()}'.`);
        }
    });
  } catch (error) {
    logger.error("[Server] Error during startup:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

// ============================================================================
// Graceful Shutdown
// ============================================================================
let isShuttingDown = false;

async function gracefulShutdown(signal, error) {
    if (isShuttingDown) {
        logger.warn("[Server] Shutdown already in progress, ignoring signal.");
        return;
    }
    isShuttingDown = true;
    logger.info(`[Server] 🛑 Received ${signal}, starting graceful shutdown...`);

    if (error) {
        logger.error({
            message: `[Global] Uncaught Exception: ${error.message}`,
            stack: error.stack,
            error: error.toString(),
        });
    }

    // Force exit after a timeout
    const forceExit = setTimeout(() => {
        logger.error('[Server] Forced shutdown after 30s timeout');
        process.exit(1);
    }, 30000);
    forceExit.unref(); // Do not let this timer keep the process alive

    try {
        // 1. Stop accepting new connections
        if (server && server.listening) {
            await new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        logger.error({ error: err.message }, "[Server] Error closing HTTP server");
                        return reject(err);
                    }
                    logger.info("[Server] ✅ HTTP server closed");
                    resolve();
                });
            });
        }

        // 2. Close Socket.IO server
        if (io && io.sockets) {
            io.close(() => {
                logger.info("[Server] ✅ Socket.IO server closed");
            });
        }

        // 3. Disconnect from Redis
        if (cache?.redis && typeof cache.redis.quit === 'function') {
            await cache.redis.quit().catch(err => logger.warn('[Cache] Redis quit failed', err));
            logger.info("[Server] ✅ Redis client disconnected");
        }

        // 4. Cancel scheduled jobs
        if (telemetryCleanupJob) {
            telemetryCleanupJob.cancel();
            logger.info('[Server] ✅ Telemetry cleanup job cancelled');
        }
        
        // 5. Disconnect MQTT
        if (mqttRuntime?.mqttClient) {
            await new Promise(resolve => mqttRuntime.mqttClient.end(true, {}, resolve));
            logger.info('[Server] ✅ MQTT client disconnected');
        }

        logger.info("[Server] ✅ Graceful shutdown complete");

    } catch (shutdownError) {
        logger.error({
            message: "[Server] ❌ Error during graceful shutdown",
            stack: shutdownError.stack,
        });
    } finally {
        // 6. Exit the process
        clearTimeout(forceExit);
        logger.info(`[Server] Exiting process now.`);
        process.exit(error ? 1 : 0);
    }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", async (reason) => {
    logger.error({ error: reason?.message || String(reason), stack: reason?.stack }, "[Global] Unhandled Promise Rejection");
    Sentry.captureException(reason);
    if (process.env.NODE_ENV === "production" && !isShuttingDown) {
        await gracefulShutdown("unhandledRejection");
    }
});

process.on("uncaughtException", async (err) => {
    logger.error({ error: err.message, stack: err.stack }, "[Global] Uncaught Exception");
    Sentry.captureException(err);
    if (!isShuttingDown) {
        await gracefulShutdown("uncaughtException");
    }
});

module.exports = server;
module.exports.startServer = startServer;
