const { logger } = require('../config/pino.js');
const Sentry = require('@sentry/node');

/**
 * Structured logging wrapper that uses Pino under the hood
 * Maintains compatibility with the existing Winston-based interface
 */
const structuredLogger = {
  info: (message, meta = {}) => {
    logger.info(meta, message);
  },
  
  error: (message, error = null, meta = {}) => {
    const errorMeta = {
      ...meta,
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
      })
    };
    logger.error(errorMeta, message);
    
    // Send to Sentry in production
    if (process.env.NODE_ENV === 'production' && error) {
      Sentry.captureException(error);
    }
  },
  
  warn: (message, meta = {}) => {
    logger.warn(meta, message);
  },
  
  debug: (message, meta = {}) => {
    logger.debug(meta, message);
  },
  
  // Specialized logging methods
  auth: (action, userId, meta = {}) => {
    logger.info({
      category: 'auth',
      userId,
      ...meta
    }, `Auth: ${action}`);
  },
  
  api: (method, endpoint, statusCode, duration, meta = {}) => {
    logger.info({
      category: 'api',
      method,
      endpoint,
      statusCode,
      duration,
      ...meta
    }, `API: ${method} ${endpoint}`);
  },
  
  database: (operation, collection, meta = {}) => {
    logger.info({
      category: 'database',
      operation,
      collection,
      ...meta
    }, `DB: ${operation} on ${collection}`);
  },
  
  telemetry: (nodeId, action, meta = {}) => {
    logger.info({
      category: 'telemetry',
      nodeId,
      action,
      ...meta
    }, `Telemetry: ${action} for node ${nodeId}`);
  },
  
  mqtt: (topic, action, meta = {}) => {
    logger.info({
      category: 'mqtt',
      topic,
      action,
      ...meta
    }, `MQTT: ${action} on ${topic}`);
  }
};

module.exports = structuredLogger;
