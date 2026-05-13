const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const Sentry = require("@sentry/node");
const { httpLogger, requestIdMiddleware, logger } = require("./config/pino.js");
const { errorHandler } = require("./middleware/errorHandler.js");
const { NotFoundError } = require("./utils/AppError.js");
const mainRouter = require("./routes/index.js");
const RateLimitingService = require("./middleware/rateLimiting.js");

const app = express();

// Initialize Rate Limiting Service
const rlService = new RateLimitingService();
const limiters = rlService.getLimiters();

// ============================================================================
// CORS Configuration
// ============================================================================
function parseOriginList(value) {
  const normalizeOrigin = (origin) => {
    const trimmed = String(origin || '').trim().replace(/^['"]|['"]$/g, '');
    if (!trimmed) return null;

    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed.replace(/\/+$/, '');
    }

    if (/^[a-z0-9.-]+(?::\d+)?$/i.test(trimmed)) {
      return `https://${trimmed}`;
    }

    return trimmed;
  };

  return [...new Set(
    String(value || '')
      .split(',')
      .map(normalizeOrigin)
      .filter(Boolean)
  )];
}

const productionOrigins = parseOriginList(
  process.env.ALLOWED_ORIGINS ||
  process.env.CORS_ORIGINS ||
  process.env.FRONTEND_URL
);

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? productionOrigins
  : [
      "https://app.evaratech.com",
      "http://localhost:8080",
      "http://localhost:8081",
      "http://localhost:5173",
      "http://localhost:3000"
    ];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin)) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn({ origin, allowed: allowedOrigins }, '[CORS] Origin rejected');
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
};

// Apply CORS only to API routes. Static asset requests should not pass CORS checks.
app.use("/api", cors(corsOptions));

// ============================================================================
// Security Headers (Helmet)
// ============================================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "https:", "data:"],
      connectSrc: [
        "'self'",
        "https://*.railway.app",
        "wss://*.railway.app",
        "https://identitytoolkit.googleapis.com",
        "https://securetoken.googleapis.com",
        "https://www.googleapis.com",
        "https://firestore.googleapis.com",
        "https://firebaseinstallations.googleapis.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// ============================================================================
// Basic Middlewares
// ============================================================================
app.set('trust proxy', process.env.TRUST_PROXY_DEPTH || 1);

// ✅ HARDENING: Reduce JSON limit to 1MB (prevents memory DOS)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(requestIdMiddleware);
app.use(httpLogger);

// ============================================================================
// Rate Limiting
// ============================================================================
// Apply general API rate limit to all /api routes
app.use("/api/", limiters.api);

// ============================================================================
// Sentry Request Handler
// ============================================================================
if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers?.requestHandler?.() || ((req, res, next) => next()));
}

// ============================================================================
// API Routes
// ============================================================================
app.use("/api/v1", mainRouter);

// ✅ AUDIT FIX: 404 handler for unmatched API routes
app.use(/^\/api\/.*/, (req, res, next) => {
    next(new NotFoundError(`Endpoint ${req.method} ${req.originalUrl} not found`));
});

// ============================================================================
// Static Files & SPA Support
// ============================================================================
const publicPath = path.join(__dirname, "../../client/dist");
const fs = require("fs");

console.log(`[StaticFiles] Looking for dist at: ${publicPath}`);
console.log(`[StaticFiles] NODE_ENV: ${process.env.NODE_ENV}`);

if (fs.existsSync(publicPath)) {
    console.log(`[StaticFiles] ✅ Found dist folder, serving static files`);
    
    // Serve static files (CSS, JS, images, etc)
    app.use(express.static(publicPath, { maxAge: '1d' }));
} else {
    console.warn(`[StaticFiles] ⚠️  dist folder not found at ${publicPath}`);
    if (process.env.NODE_ENV === "production") {
        console.error(`[StaticFiles] 🚨 CRITICAL: In production but dist folder missing!`);
    }
}

// SPA Catch-All Route for page navigation
// This MUST be the last route before error handlers
app.get("*", (req, res, next) => {
    // Skip API and WebSocket routes
    if (req.url.startsWith("/api/") || req.url.startsWith("/socket.io/")) {
        return next();
    }
    
    // If URL has a file extension, it's a missing static file -> 404
    if (/\.\w+$/.test(req.url)) {
        console.log(`[SPA] File not found, returning 404: ${req.url}`);
        return res.status(404).send("Not Found");
    }
    
    // Serve index.html for SPA page navigation
    const indexPath = path.join(publicPath, "index.html");
    if (fs.existsSync(indexPath)) {
        console.log(`[SPA] Serving index.html for: ${req.url}`);
      // Ensure the SPA index response carries an explicit CSP that allows
      // Firebase / Google API connections. This overrides any upstream
      // proxy defaults that may be more restrictive.
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; connect-src 'self' https://*.railway.app wss://*.railway.app https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firestore.googleapis.com https://firebaseinstallations.googleapis.com https://firebasestorage.googleapis.com;"
      );
      return res.sendFile(indexPath);
    }
    
    console.error(`[SPA] index.html not found at ${indexPath}`);
    res.status(500).send("Server Error: index.html not found");
});

// ============================================================================
// Sentry Error Handler
// ============================================================================
if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers?.errorHandler?.() || ((err, req, res, next) => next(err)));
}

// ============================================================================
// Global Error Handler
// ============================================================================
app.use(errorHandler);

module.exports = { app, allowedOrigins };
