const logger = require('../utils/logger.js');

const redisUrl = process.env.REDIS_URL || null;
let client = null;

if (!redisUrl) {
  logger.info('Redis URL not set; Redis features will remain disabled in development');
  module.exports = null;
} else {
  try {
    const Redis = require('ioredis');
    const useTls = redisUrl.startsWith('rediss:') || process.env.REDIS_TLS === 'true';
    const redisOptions = {
      ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
      ...(process.env.REDIS_USERNAME ? { username: process.env.REDIS_USERNAME } : {}),
      ...(useTls
        ? {
            tls: {
              rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false'
            }
          }
        : {}),
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      retryStrategy: () => null
    };

    client = new Redis(redisUrl, redisOptions);

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
