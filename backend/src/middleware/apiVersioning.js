const logger = require('../utils/logger');
const { NotFoundError } = require('./errorHandler');

class ApiVersioning {
  constructor() {
    this.supportedVersions = ['v1', 'v2'];
    this.defaultVersion = 'v1';
    this.deprecatedVersions = [];
  }

  // Extract version from request
  extractVersion(req) {
    // Method 1: URL path (/api/v1/users)
    const pathVersion = req.path.match(/\/api\/(v\d+)\//);
    if (pathVersion) {
      return pathVersion[1];
    }

    // Method 2: Header (API-Version: v1)
    const headerVersion = req.get('API-Version');
    if (headerVersion) {
      return headerVersion;
    }

    // Method 3: Query parameter (?api_version=v1)
    const queryVersion = req.query.api_version;
    if (queryVersion) {
      return queryVersion;
    }

    return this.defaultVersion;
  }

  // Validate version
  validateVersion(version) {
    if (!version) {
      return { valid: false, error: 'API version is required' };
    }

    if (!this.supportedVersions.includes(version)) {
      return { 
        valid: false, 
        error: `Unsupported API version: ${version}`,
        supportedVersions: this.supportedVersions
      };
    }

    if (this.deprecatedVersions.includes(version)) {
      return {
        valid: true,
        deprecated: true,
        warning: `API version ${version} is deprecated`,
        migrateTo: this.defaultVersion
      };
    }

    return { valid: true };
  }

  // Get version-specific middleware
  getVersionMiddleware(version) {
    const versionHandlers = {
      v1: this.v1Middleware.bind(this),
      v2: this.v2Middleware.bind(this)
    };

    return versionHandlers[version] || versionHandlers[this.defaultVersion];
  }

  // Version 1 middleware (current implementation)
  v1Middleware(req, res, next) {
    // Add version info to response headers
    res.set('API-Version', 'v1');
    res.set('API-Supported-Versions', this.supportedVersions.join(','));
    
    // Add version to request for handlers
    req.apiVersion = 'v1';
    req.apiVersionNumber = 1;

    // V1 specific validations
    this.validateV1Request(req);
    
    next();
  }

  // Version 2 middleware (future implementation)
  v2Middleware(req, res, next) {
    res.set('API-Version', 'v2');
    res.set('API-Supported-Versions', this.supportedVersions.join(','));
    
    req.apiVersion = 'v2';
    req.apiVersionNumber = 2;

    // V2 specific validations
    this.validateV2Request(req);
    
    next();
  }

  // V1 request validation
  validateV1Request(req) {
    // Ensure content type for POST/PUT requests
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.get('Content-Type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('V1 API requires Content-Type: application/json');
      }
    }

    // Add V1 specific request processing
    req.body = this.sanitizeV1Input(req.body);
  }

  // V2 request validation
  validateV2Request(req) {
    // V2 might support more content types
    const validContentTypes = [
      'application/json',
      'application/vnd.api+json'
    ];

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.get('Content-Type');
      if (!validContentTypes.some(type => contentType?.includes(type))) {
        throw new Error('V2 API requires valid content type');
      }
    }

    req.body = this.sanitizeV2Input(req.body);
  }

  // Input sanitization for V1
  sanitizeV1Input(data) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Remove potentially dangerous fields
    const sanitized = { ...data };
    delete sanitized.__proto__;
    delete sanitized.constructor;
    delete sanitized.prototype;

    // Trim string values
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = sanitized[key].trim();
      }
    });

    return sanitized;
  }

  // Input sanitization for V2
  sanitizeV2Input(data) {
    // V2 might have stricter validation
    const sanitized = this.sanitizeV1Input(data);
    
    // Add V2 specific sanitization
    if (sanitized.id && typeof sanitized.id === 'string') {
      // Validate ID format for V2
      const idPattern = /^[a-zA-Z0-9_-]+$/;
      if (!idPattern.test(sanitized.id)) {
        throw new Error('Invalid ID format for V2 API');
      }
    }

    return sanitized;
  }

  // Main middleware function
  middleware() {
    return (req, res, next) => {
      try {
        const version = this.extractVersion(req);
        const validation = this.validateVersion(version);

        if (!validation.valid) {
          logger.warn('Invalid API version requested', {
            requestedVersion: version,
            error: validation.error,
            path: req.path,
            ip: req.ip
          });

          return res.status(400).json({
            error: validation.error,
            supportedVersions: validation.supportedVersions,
            documentation: '/api/docs'
          });
        }

        // Add deprecation warning if needed
        if (validation.deprecated) {
          res.set('API-Deprecated', 'true');
          res.set('API-Migrate-To', validation.migrateTo);
          
          logger.warn('Deprecated API version used', {
            version,
            migrateTo: validation.migrateTo,
            path: req.path
          });
        }

        // Get version-specific middleware
        const versionMiddleware = this.getVersionMiddleware(version);
        return versionMiddleware(req, res, next);

      } catch (error) {
        logger.error('API versioning middleware error', error, {
          path: req.path,
          method: req.method
        });
        next(error);
      }
    };
  }

  // Route versioning helper
  versionRoute(basePath, handlers) {
    const routes = {};
    
    this.supportedVersions.forEach(version => {
      const versionPath = `/api/${version}${basePath}`;
      routes[versionPath] = handlers[version] || handlers[this.defaultVersion];
    });

    return routes;
  }

  // Add new version support
  addVersion(version, handler) {
    if (!this.supportedVersions.includes(version)) {
      this.supportedVersions.push(version);
    }

    // Add to version handlers
    this.getVersionMiddleware = function(requestedVersion) {
      const versionHandlers = {
        ...this.getVersionMiddleware(),
        [version]: handler.bind(this)
      };
      return versionHandlers[requestedVersion] || versionHandlers[this.defaultVersion];
    }.bind(this);
  }

  // Deprecate version
  deprecateVersion(version, migrateTo, deprecationDate) {
    if (!this.deprecatedVersions.includes(version)) {
      this.deprecatedVersions.push(version);
    }

    logger.info('API version deprecated', {
      version,
      migrateTo,
      deprecationDate
    });
  }

  // Get API information
  getApiInfo() {
    return {
      currentVersion: this.defaultVersion,
      supportedVersions: this.supportedVersions,
      deprecatedVersions: this.deprecatedVersions,
      documentation: '/api/docs',
      changelog: '/api/changelog'
    };
  }
}

module.exports = ApiVersioning;
