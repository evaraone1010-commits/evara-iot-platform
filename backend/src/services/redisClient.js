const Redis = require('ioredis');
const logger = require('../utils/logger.js');

const redisUrl = process.env.REDIS_URL || null;

if (!redisUrl) {
  logger.warn('Redis URL not set; Redis features will remain disabled');
  module.exports = null;
  return;
}

let client = null;
try {
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

module.exports = client;
