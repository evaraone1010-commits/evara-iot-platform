const logger = require('../utils/logger');
const { db } = require('../config/firebase');
const { UnauthorizedError, ForbiddenError } = require('./errorHandler');

class TenantMiddleware {
  constructor() {
    this.tenantCache = new Map();
  }

  // Extract tenant from request
  extractTenant(req) {
    // Method 1: Subdomain (e.g., tenant.evaratech.com)
    const host = req.get('host');
    if (host) {
      const subdomain = host.split('.')[0];
      if (subdomain !== 'www' && subdomain !== 'app') {
        return subdomain;
      }
    }

    // Method 2: Header (e.g., X-Tenant-ID)
    const tenantHeader = req.get('X-Tenant-ID');
    if (tenantHeader) {
      return tenantHeader;
    }

    // Method 3: JWT token claim
    if (req.user && req.user.tenantId) {
      return req.user.tenantId;
    }

    // Method 4: Query parameter (for development)
    const tenantParam = req.query.tenant;
    if (tenantParam) {
      return tenantParam;
    }

    return null;
  }

  // Validate tenant exists and is active
  async validateTenant(tenantId) {
    if (!tenantId) {
      throw new UnauthorizedError('Tenant identification required');
    }

    // Check cache first
    if (this.tenantCache.has(tenantId)) {
      const cached = this.tenantCache.get(tenantId);
      if (cached.expiresAt > Date.now()) {
        return cached.tenant;
      }
    }

    // Fetch from database
    const { db } = require('../config/firebase');
    const tenantDoc = await db.collection('tenants').doc(tenantId).get();

    if (!tenantDoc.exists) {
      throw new UnauthorizedError('Invalid tenant');
    }

    const tenant = { id: tenantId, ...tenantDoc.data() };

    if (!tenant.isActive) {
      throw new ForbiddenError('Tenant is not active');
    }

    // Cache for 5 minutes
    this.tenantCache.set(tenantId, {
      tenant,
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    logger.auth('tenant_validated', tenantId, {
      tenantName: tenant.name,
      plan: tenant.plan
    });

    return tenant;
  }

  // Check user has access to tenant
  async validateUserTenantAccess(userId, tenantId) {
    const { db } = require('../config/firebase');
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      throw new UnauthorizedError('User not found');
    }

    const user = userDoc.data();
    const userTenants = user.tenants || [];

    if (!userTenants.includes(tenantId) && user.role !== 'superadmin') {
      throw new ForbiddenError('User does not have access to this tenant');
    }

    return true;
  }

  // Main middleware function
  middleware() {
    return async (req, res, next) => {
      try {
        const tenantId = this.extractTenant(req);
        
        if (!tenantId) {
          throw new UnauthorizedError('Tenant identification required');
        }

        const tenant = await this.validateTenant(tenantId);

        // Validate user access if authenticated
        if (req.user) {
          await this.validateUserTenantAccess(req.user.uid, tenantId);
        }

        // Add tenant to request
        req.tenant = tenant;
        req.tenantId = tenantId;

        // Add tenant-specific database helpers
        req.db = {
          collection: (name) => {
            return db.collection(`tenants/${tenantId}/${name}`);
          },
          doc: (path) => {
            return db.doc(`tenants/${tenantId}/${path}`);
          }
        };

        logger.api(req.method, req.path, 200, null, {
          tenantId,
          tenantName: tenant.name
        });

        next();
      } catch (error) {
        logger.error('Tenant middleware error', error, {
          method: req.method,
          path: req.path,
          host: req.get('host')
        });
        next(error);
      }
    };
  }

  // Clear tenant cache
  clearCache(tenantId) {
    if (tenantId) {
      this.tenantCache.delete(tenantId);
    } else {
      this.tenantCache.clear();
    }
  }
}

module.exports = TenantMiddleware;
