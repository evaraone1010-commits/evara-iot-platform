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
      scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "https:", "data:", "https://cdnjs.cloudflare.com", "https://tile.openstreetmap.org"],
      connectSrc: [
        "'self'",
        "https://*.railway.app",
        "wss://*.railway.app",
        "https://*.openstreetmap.org",
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
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "no-referrer-when-downgrade" }
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
const isProduction = process.env.NODE_ENV === "production";
const frontendDevUrl = process.env.FRONTEND_DEV_URL || "http://localhost:8080";
const shouldServeStaticDist = isProduction || process.env.SERVE_CLIENT_DIST === "true";

console.log(`[StaticFiles] Looking for dist at: ${publicPath}`);
console.log(`[StaticFiles] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[StaticFiles] shouldServeStaticDist: ${shouldServeStaticDist}`);

if (shouldServeStaticDist && fs.existsSync(publicPath)) {
    console.log(`[StaticFiles] ✅ Found dist folder, serving static files`);
    
    // Serve static files (CSS, JS, images, etc)
  app.use(express.static(publicPath, { maxAge: isProduction ? '1d' : 0 }));
} else {
  if (!shouldServeStaticDist) {
    console.log(`[StaticFiles] ℹ️  Development mode: static dist serving disabled (using Vite dev server)`);
  } else {
    console.warn(`[StaticFiles] ⚠️  dist folder not found at ${publicPath}`);
  }
  if (isProduction) {
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

  // In local development, always serve the Vite app so UI matches the active frontend code.
  if (!shouldServeStaticDist) {
    const targetUrl = `${frontendDevUrl}${req.originalUrl}`;
    return res.redirect(302, targetUrl);
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
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; img-src 'self' https: data: https://cdnjs.cloudflare.com https://tile.openstreetmap.org; connect-src 'self' https://*.railway.app wss://*.railway.app https://*.openstreetmap.org https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firestore.googleapis.com https://firebaseinstallations.googleapis.com https://firebasestorage.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src 'none'; object-src 'none';"
      );
      res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
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
