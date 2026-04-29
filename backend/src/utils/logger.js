const winston = require('winston');
const Sentry = require('@sentry/node');

const isProduction = process.env.NODE_ENV === 'production';

const transports = [
  new winston.transports.Console({
    format: isProduction
      ? winston.format.json()           // structured JSON for CloudWatch
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()       // human-readable locally
        )
  })
];

// ONLY add file transports in local dev
if (!isProduction) {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'evara-backend' },
  transports
});

// Structured logging methods
const structuredLogger = {
  info: (message, meta = {}) => {
    logger.info(message, meta);
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
    logger.error(message, errorMeta);
    
    // Send to Sentry in production
    if (process.env.NODE_ENV === 'production' && error) {
      Sentry.captureException(error);
    }
  },
  
  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },
  
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  },
  
  // Specialized logging methods
  auth: (action, userId, meta = {}) => {
    logger.info(`Auth: ${action}`, {
      category: 'auth',
      userId,
      ...meta
    });
  },
  
  api: (method, endpoint, statusCode, duration, meta = {}) => {
    logger.info(`API: ${method} ${endpoint}`, {
      category: 'api',
      method,
      endpoint,
      statusCode,
      duration,
      ...meta
    });
  },
  
  database: (operation, collection, meta = {}) => {
    logger.info(`DB: ${operation} on ${collection}`, {
      category: 'database',
      operation,
      collection,
      ...meta
    });
  },
  
  telemetry: (nodeId, action, meta = {}) => {
    logger.info(`Telemetry: ${action} for node ${nodeId}`, {
      category: 'telemetry',
      nodeId,
      action,
      ...meta
    });
  },
  
  mqtt: (topic, action, meta = {}) => {
    logger.info(`MQTT: ${action} on ${topic}`, {
      category: 'mqtt',
      topic,
      action,
      ...meta
    });
  }
};

module.exports = structuredLogger;
