const logger = require('../utils/logger.js');

const redisUrl = process.env.REDIS_URL || null;
let client = null;

if (!redisUrl) {
  logger.info('[Cache] REDIS_URL not set in production');
  module.exports = null;
} else {
  try {
    const Redis = require('ioredis');
    // Railway provides the full URL, so we don't need to construct options manually.
    client = new Redis(redisUrl, {
      // Basic options for Railway
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    client.on('error', (err) => {
      logger.error('Redis Client Error', err);
    });

    client.on('connect', () => {
      logger.debug('Redis client connected');
    });
  } catch (err) {
    logger.error('Failed to initialize Redis client:', err && err.message ? err.message : err);
    client = null;
  }
}

module.exports = client;
