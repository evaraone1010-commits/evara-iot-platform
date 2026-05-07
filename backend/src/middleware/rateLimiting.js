const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const redis = require('../services/redisClient');
const logger = require('../utils/logger');

let RedisStore = null;
try {
  const redisStoreModule = require('rate-limit-redis');
  RedisStore = redisStoreModule?.RedisStore || redisStoreModule;
} catch (error) {
  logger.warn('rate-limit-redis not available; using in-memory rate limiting store', {
    message: error?.message
  });
}

class RateLimitingService {
  constructor() {
    this.limits = new Map();
  }

  getStore() {
    if (!RedisStore || !redis) {
      return undefined;
    }

    return new RedisStore({
      client: redis,
      prefix: 'rl:'
    });
  }

  // Create rate limiter for specific endpoint
  createLimiter(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      max = 100, // requests per window
      message = 'Too many requests',
      keyGenerator = null,
      skipSuccessfulRequests = false,
      skipFailedRequests = false
    } = options;

    const limiterOptions = {
      windowMs,
      max,
      message: {
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      },
      standardHeaders: true, // Return rate limit info in headers
      legacyHeaders: false,
      store: this.getStore(),
      keyGenerator: keyGenerator || ((req) => {
        // Use tenant + user + IP as key
        const tenantId = req.tenantId || 'default';
        const userId = req.user?.uid || 'anonymous';
        const ip = ipKeyGenerator(req, req.res);
        return `${tenantId}:${userId}:${ip}`;
      }),
      skip: (req) => {
        // Skip rate limiting for health checks
        if (req.path === '/health' || req.path === '/api/health') {
          return true;
        }

        // Skip for internal services
        if (req.get('X-Internal-Service') === 'true') {
          return true;
        }

        return false;
      },
      handler: (req, res) => {
        const retryAfter = Math.ceil(options.windowMs / 1000);
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userId: req.user?.uid,
          tenantId: req.tenantId,
          path: req.path,
          limit: options.max,
          windowMs: options.windowMs
        });
        res.set('Retry-After', retryAfter);
        res.status(429).json({
          error: message,
          retryAfter,
          limit: options.max,
          windowMs: options.windowMs
        });
      }
    };

    return rateLimit(limiterOptions);
  }

  // Predefined limiters for different use cases
  getLimiters() {
    return {
      // Authentication endpoints - stricter limits
      auth: this.createLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // 10 login attempts per 15 minutes
        message: 'Too many authentication attempts'
      }),

      // API endpoints - moderate limits
      api: this.createLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000, // 1000 requests per 15 minutes
        message: 'API rate limit exceeded'
      }),

      // Telemetry endpoints - higher limits for real-time data
      telemetry: this.createLimiter({
        windowMs: 60 * 1000, // 1 minute
        max: 300, // 300 requests per minute
        message: 'Telemetry rate limit exceeded'
      }),

      // Analytics endpoints - moderate limits
      analytics: this.createLimiter({
        windowMs: 60 * 1000, // 1 minute
        max: 100, // 100 requests per minute
        message: 'Analytics rate limit exceeded'
      }),

      // Admin endpoints - stricter limits
      admin: this.createLimiter({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 200, // 200 requests per 15 minutes
        message: 'Admin API rate limit exceeded'
      }),

      // File upload endpoints - very strict limits
      upload: this.createLimiter({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 50, // 50 uploads per hour
        message: 'Upload rate limit exceeded'
      })
    };
  }

  // Tenant-specific rate limiting
  createTenantLimiter(tenantId, limits) {
    const { maxRequests, windowMs } = limits;
    
    return this.createLimiter({
      max: maxRequests,
      windowMs,
      keyGenerator: (req) => `tenant:${tenantId}:${req.ip}`,
      message: `Tenant rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs/1000} seconds.`
    });
  }

  // Dynamic rate limiting based on tenant plan
  getLimiterForTenant(tenant) {
    const limits = this.getLimitsForPlan(tenant.plan);
    return this.createTenantLimiter(tenant.id, limits);
  }

  // Get rate limits based on subscription plan
  getLimitsForPlan(plan) {
    const planLimits = {
      free: {
        maxRequests: 100,
        windowMs: 15 * 60 * 1000 // 15 minutes
      },
      basic: {
        maxRequests: 1000,
        windowMs: 15 * 60 * 1000 // 15 minutes
      },
      pro: {
        maxRequests: 5000,
        windowMs: 15 * 60 * 1000 // 15 minutes
      },
      enterprise: {
        maxRequests: 20000,
        windowMs: 15 * 60 * 1000 // 15 minutes
      }
    };

    return planLimits[plan] || planLimits.free;
  }

  // Middleware that applies tenant-specific rate limiting
  tenantAwareMiddleware() {
    return async (req, res, next) => {
      try {
        if (!req.tenant) {
          return next();
        }

        const limiter = this.getLimiterForTenant(req.tenant);
        return limiter(req, res, next);
      } catch (error) {
        logger.error('Rate limiting middleware error', error, {
          tenantId: req.tenantId,
          path: req.path
        });
        next(error);
      }
    };
  }

  // Get current rate limit status for a tenant
  async getTenantRateLimitStatus(tenantId) {
    try {
      if (!redis) {
        return {
          requests: 0,
          remaining: 100,
          resetTime: new Date(Date.now() + 15 * 60 * 1000)
        };
      }

      const key = `tenant:${tenantId}:status`;
      const status = await redis.get(key);
      
      if (status) {
        return JSON.parse(status);
      }

      return {
        requests: 0,
        remaining: 100,
        resetTime: new Date(Date.now() + 15 * 60 * 1000)
      };
    } catch (error) {
      logger.error('Failed to get rate limit status', error, { tenantId });
      return null;
    }
  }

  // Reset rate limits for a tenant (admin function)
  async resetTenantRateLimit(tenantId) {
    try {
      if (!redis) {
        logger.info('Redis unavailable; skipping tenant rate limit reset', { tenantId });
        return true;
      }

      const pattern = `rl:tenant:${tenantId}:*`;
      const keys = await redis.keys(pattern);
      
      if (keys.length > 0) {
        await redis.del(keys);
        logger.info('Rate limit reset for tenant', { tenantId, keysDeleted: keys.length });
      }

      return true;
    } catch (error) {
      logger.error('Failed to reset rate limit', error, { tenantId });
      return false;
    }
  }
}

module.exports = RateLimitingService;
