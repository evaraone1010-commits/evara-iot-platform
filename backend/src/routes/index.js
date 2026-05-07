const express = require("express");
const router = express.Router();

// Middlewares
const { requireAuth } = require("../middleware/auth.middleware.js");
const tenantCheck = require("../middleware/tenantCheck.middleware.js");
const rbac = require("../middleware/rbac.middleware.js");
const adminOnly = require("../middleware/adminOnly.middleware.js");

// Controllers (for direct route definitions)
const { 
    getDashboardSummary, 
    getHierarchy, 
    getAuditLogs, 
    getZoneStats, 
    getPublicZones 
} = require("../controllers/admin.controller.js");

// Routes
const authRoutes = require("./auth.routes.js");
const adminRoutes = require("./admin.routes.js");
const nodesRoutes = require("./nodes.routes.js");
const evaratdsRoutes = require("./evaratds.routes.js");
const tdsRoutes = require("./tds.routes.js");
const thingspeakConfigRoutes = require("./thingspeakConfig.routes.js");

// SaaS Architecture: Global Security Stack for Authenticated Routes
const globalSaaSAuth = [requireAuth, tenantCheck, rbac()];

// Public routes
router.get("/health", (req, res) => res.status(200).json({ status: "ok", timestamp: new Date().toISOString() }));
router.use("/auth", authRoutes);
router.get("/public/zones", getPublicZones);

// Protected routes
router.use("/admin", globalSaaSAuth, adminOnly, adminRoutes);
router.use("/nodes", globalSaaSAuth, nodesRoutes);
router.use("/evaratds", globalSaaSAuth, evaratdsRoutes);
router.use("/devices/tds", globalSaaSAuth, tdsRoutes);
router.use("/thingspeak", globalSaaSAuth, thingspeakConfigRoutes);

// Other admin/stats routes
router.get("/admin/hierarchy", globalSaaSAuth, adminOnly, getHierarchy);
router.get("/admin/audit-logs", globalSaaSAuth, getAuditLogs);
router.get("/stats/dashboard/summary", globalSaaSAuth, getDashboardSummary);
router.get("/stats/zones", globalSaaSAuth, adminOnly, getZoneStats);

module.exports = router;
