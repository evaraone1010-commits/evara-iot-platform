const logger = require('../utils/logger.js');

const redisUrl = process.env.REDIS_URL;
let client = null;

// Only attempt to connect if REDIS_URL is provided.
if (redisUrl) {
  try {
    const Redis = require('ioredis');
    client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 2000); // More aggressive retry
        logger.warn(`[Cache] Redis connection failed. Retrying in ${delay}ms...`);
        return delay;
      },
      reconnectOnError(err) {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY"
          return true;
        }
        return false;
      },
    });

    client.on('error', (err) => {
      // Avoid logging every retry attempt as a full error
      if (err.code !== 'ECONNRESET') {
        logger.error('[Cache] Redis Client Error:', err.message);
      }
    });

    client.on('connect', () => {
      logger.info('[Cache] ✅ Redis client connected successfully.');
    });
  } catch (err) {
    logger.error('[Cache] Failed to initialize Redis client:', err.message);
    client = null;
  }
} else {
  logger.warn('[Cache] REDIS_URL is not defined. Redis features will be disabled.');
}

module.exports = client;
