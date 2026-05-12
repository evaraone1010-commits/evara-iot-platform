/**
 * Environment Variable Validator
 * Ensures all required secrets are present before the application starts.
 * 
 * ✅ CRITICAL FIX: Validate production-critical env vars
 */

const { logger } = require("../config/pino.js"); // ✅ AUDIT FIX M10: Import logger for structured logging
const fs = require("fs");
const path = require("path");

const REQUIRED_VARS = [
    "ALLOWED_ORIGINS",
    "NODE_ENV"
];

const FIREBASE_VARS = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY"
];

const PRODUCTION_ONLY = [
    // No required production-only vars for Railway deployment
];

const SECRETS_MANAGER_VARS = [
    // AWS Secrets Manager is optional
];

function validateEnv() {
    const isProd = process.env.NODE_ENV === 'production';
    const localServiceAccountPath = path.join(__dirname, "..", "..", "service-account.json");
    const hasLocalServiceAccount = fs.existsSync(localServiceAccountPath);
    const hasGoogleAppCredsPath = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    // Always required
    const missing = REQUIRED_VARS.filter(v => !process.env[v]);

    if (isProd) {
        missing.push(...FIREBASE_VARS.filter(v => !process.env[v]));
    } else {
        const missingFirebase = FIREBASE_VARS.filter(v => !process.env[v]);
        if (missingFirebase.length > 0) {
            if (hasLocalServiceAccount || hasGoogleAppCredsPath) {
                logger.info("[Env] Firebase env vars are missing, but explicit dev credentials are available (local service-account or GOOGLE_APPLICATION_CREDENTIALS).");
            } else {
                logger.warn(
                    "⚠️  Firebase service-account env vars are not configured; dev will rely on ADC or emulator if available.",
                    { missingFirebase }
                );
            }
        }
    }
    
    if (missing.length > 0) {
        logger.error("❌ MISSING REQUIRED ENVIRONMENT VARIABLES:");
        missing.forEach(v => logger.error(`   - ${v}`));
        logger.error("\nPlease check your .env file or deployment configuration.");
        process.exit(1);
    }

    // Validate Firebase private key format
    if (process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY.includes("BEGIN PRIVATE KEY")) {
        logger.warn("⚠️  WARNING: FIREBASE_PRIVATE_KEY does not look like a valid PEM key.");
        if (isProd) {
            logger.error("❌ PRODUCTION: Invalid Firebase private key. Exiting.");
            process.exit(1);
        }
    }

    // Production-only validation
    if (isProd) {
        // AWS Secrets Manager is optional - skip validation if not configured
        const missingProd = PRODUCTION_ONLY.filter(v => !process.env[v]);
        if (missingProd.length > 0) {
            logger.warn("⚠️  PRODUCTION: Optional production env vars not set:", missingProd.join(', '));
        }

        // Enforce TLS for Redis in production (only if Redis is configured)
        if (process.env.REDIS_URL && !(process.env.REDIS_URL.startsWith('rediss://') || process.env.REDIS_TLS === 'true')) {
            logger.warn("⚠️  PRODUCTION: Redis configured without TLS. Consider using rediss:// for security.");
        }

        // Enforce TLS for MQTT in production when enabled
        if (process.env.ENABLE_MQTT !== 'false' && process.env.MQTT_BROKER_URL && !(process.env.MQTT_BROKER_URL.startsWith('mqtts://') || process.env.MQTT_TLS === 'true')) {
            logger.error("❌ PRODUCTION: MQTT must use TLS (mqtts://) or set MQTT_TLS=true in production.");
            process.exit(1);
        }

        // CRITICAL: Catch localhost sneaking into production
        if (process.env.ALLOWED_ORIGINS?.includes('localhost') || process.env.ALLOWED_ORIGINS?.includes('127.0.0.1')) {
            logger.error("❌ SECURITY: ALLOWED_ORIGINS contains localhost/127.0.0.1 in production!");
            logger.error("   This is a security risk. Set proper production domains only.");
            process.exit(1);
        }
    }

    // Redis is optional for single-instance deployments but required if clustering is enabled.
    const wantsClusterRedis = process.env.RAILWAY_REPLICA_COUNT
        ? parseInt(process.env.RAILWAY_REPLICA_COUNT, 10) > 1
        : process.env.MULTIPLE_REPLICAS === 'true';

    if (isProd && !process.env.REDIS_URL) {
        if (wantsClusterRedis) {
            logger.error("❌ PRODUCTION: REDIS_URL required for clustered deployments.");
            process.exit(1);
        }

        logger.warn("⚠️  PRODUCTION: REDIS_URL not configured; using in-memory cache for a single instance.");
    }

    // MQTT ingestion is optional unless explicitly enabled and fully configured.
    if (isProd && process.env.ENABLE_MQTT !== 'false') {
        const mqttConfigured = !!(process.env.MQTT_BROKER_URL && process.env.MQTT_USERNAME && process.env.MQTT_PASSWORD);
        if (!mqttConfigured) {
            logger.warn("⚠️  PRODUCTION: MQTT ingestion is not fully configured; telemetry ingestion will stay disabled.");
        }
    }

    if (isProd && !process.env.SENTRY_DSN) {
        logger.warn("⚠️  PRODUCTION: SENTRY_DSN not configured; error monitoring will be disabled.");
    }

    logger.debug("✅ Environment Variables Validated");
    
    // Log security-relevant info in dev
    if (!isProd) {
        logger.debug(`[ENV] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
        logger.debug(`[ENV] Redis configured: ${process.env.REDIS_URL ? 'Yes' : 'No (in-memory only)'}`);
        logger.debug(`[ENV] MQTT configured: ${process.env.MQTT_BROKER_URL ? 'Yes' : 'No'}`);
        logger.debug(`[ENV] Sentry configured: ${process.env.SENTRY_DSN ? 'Yes' : 'No'}`);
    }
}

function buildRedisOptions() {
    return {
        ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
        ...(process.env.REDIS_USERNAME ? { username: process.env.REDIS_USERNAME } : {}),
        ...(process.env.REDIS_TLS === "true" ? { tls: { rejectUnauthorized: true } } : {}),
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: () => null,
    };
}

async function testRedisConnection(timeoutMs = 5000) {
    if (!process.env.REDIS_URL) {
        logger.warn("⚠️  REDIS_URL not configured; skipping Redis connectivity check.");
        return false;
    }

    const Redis = require("ioredis");
    const redis = new Redis(process.env.REDIS_URL, buildRedisOptions());
    const timeout = new Promise((_, reject) => {
        const timer = setTimeout(() => {
            clearTimeout(timer);
            reject(new Error(`Redis ping timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        await Promise.race([redis.ping(), timeout]);
        logger.debug("✅ Redis connectivity verified");
    } catch (error) {
        logger.error("❌ Redis connectivity check failed:", error.message);
        process.exit(1);
    } finally {
        try {
            await redis.quit();
        } catch (quitError) {
            redis.disconnect();
        }
    }
}

async function testMqttConnection(timeoutMs = 5000) {
    const { MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD } = process.env;
    if (!MQTT_BROKER_URL) {
        logger.warn("⚠️  MQTT_BROKER_URL not configured; telemetry ingestion disabled");
        return false;
    }

    return new Promise((resolve) => {
        const mqtt = require("mqtt");
        // Enforce TLS options when using secure MQTT transport
        const tlsRequired = MQTT_BROKER_URL.startsWith('mqtts://') || process.env.MQTT_TLS === 'true';
        const opts = {
            username: MQTT_USERNAME,
            password: MQTT_PASSWORD,
            connectTimeout: 5000,
            reconnectPeriod: 0
        };

        if (tlsRequired) {
            opts.rejectUnauthorized = process.env.MQTT_TLS_REJECT_UNAUTHORIZED !== 'false';
            const fs = require('fs');
            if (process.env.MQTT_CA_PATH) {
                try { opts.ca = fs.readFileSync(process.env.MQTT_CA_PATH); } catch (e) { logger.warn('Could not read MQTT_CA_PATH:', e.message); }
            }
            if (process.env.MQTT_CERT_PATH) {
                try { opts.cert = fs.readFileSync(process.env.MQTT_CERT_PATH); } catch (e) { logger.warn('Could not read MQTT_CERT_PATH:', e.message); }
            }
            if (process.env.MQTT_KEY_PATH) {
                try { opts.key = fs.readFileSync(process.env.MQTT_KEY_PATH); } catch (e) { logger.warn('Could not read MQTT_KEY_PATH:', e.message); }
            }
        }

        const client = mqtt.connect(MQTT_BROKER_URL, opts);

        const timer = setTimeout(() => {
            client.end(true);
            logger.error("❌ MQTT connection timed out after " + timeoutMs + "ms");
            resolve(false);
        }, timeoutMs);

        client.on("connect", () => {
            clearTimeout(timer);
            logger.debug("✅ MQTT connection verified");
            client.end();
            resolve(true);
        });

        client.on("error", (err) => {
            clearTimeout(timer);
            logger.error("❌ MQTT connection failed:", err.message);
            client.end(true);
            if (process.env.NODE_ENV === "production") {
                process.exit(1);
            }
            resolve(false);
        });
    });
}

module.exports = validateEnv;
module.exports.testRedisConnection = testRedisConnection;
module.exports.testMqttConnection = testMqttConnection;

