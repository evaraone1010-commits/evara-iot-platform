// CRITICAL: Initialize Firebase before any other module is loaded.
require('./config/firebase-secure');
// END OF FIREBASE INITIALIZATION

const http = require("http");
const schedule = require("node-schedule");
const Sentry = require("@sentry/node");

const { initializeFirebase, hasExplicitFirebaseCredentials } = require('./config/firebase-secure');
const { logger } = require("./config/pino.js");

// ============================================================================
// Pre-flight validation
// ============================================================================
const validateEnv = require("./utils/validateEnv.js");
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
let app, allowedOrigins, initSocket, cache, TelemetryArchiveService, startWorker;
let server;
let io;

async function startServer() {
  try {
    // Step 1: Ensure Firebase is initialized before loading any other modules
    await initializeFirebase();
    logger.info("[Server] Firebase initialization complete.");

    // Step 2: Now that Firebase is ready, load all other modules
    const appModule = require("./app.js");
    app = appModule.app;
    allowedOrigins = appModule.allowedOrigins;
    initSocket = require("./socket.js").initSocket;
    cache = require("./config/cache.js");
    TelemetryArchiveService = require("./services/telemetryArchiveService.js");
    startWorker = require("./workers/telemetryWorker.js").startWorker;
    
    // Step 3: Create server and initialize sockets
    server = http.createServer(app);
    io = initSocket(server, allowedOrigins);

    // Step 4: Run production health checks
    if (process.env.NODE_ENV === 'production') {
      if (process.env.REDIS_URL) await validateEnv.testRedisConnection(5000);
      if (process.env.MQTT_BROKER_URL) await validateEnv.testMqttConnection(5000);
    }

    // Step 5: Start listening for connections
    const PORT = process.env.PORT || 8000;
    server.listen(PORT, '0.0.0.0', async () => {
        logger.info(`[Server] ✅ Backend running on port ${PORT}`);
        
        // Step 6: Initialize post-start services
        if (process.env.NODE_ENV !== 'test' && hasExplicitFirebaseCredentials()) {
          try { 
            const { initializeCacheVersions } = require("./utils/cacheVersioning.js");
            await initializeCacheVersions(); 
          } catch (err) { 
            logger.warn({ error: err.message }, '[Server] Cache versioning failed'); 
          }
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
        
        if (process.env.NODE_ENV !== "test" && hasExplicitFirebaseCredentials()) {
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
