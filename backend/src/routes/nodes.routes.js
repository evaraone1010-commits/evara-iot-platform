const router = require("express").Router();
const { getNodes, getNodeById, getNodeTelemetry, getNodeAnalytics, getNodeGraphData, getNodeGraphDataHybrid } = require("../controllers/nodes.controller.js");
const auditLog = require("../middleware/audit.middleware.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const validate = require("../middleware/validate.js");
const { z } = require("zod");

// ─── VALIDATION SCHEMAS ──────────────────────────────────────────────────────
const getNodesSchema = z.object({
    query: z.object({
        limit: z.coerce.number().min(1).max(200).default(100),
        cursor: z.string().optional(),
        customerId: z.string().optional(),
        customer_id: z.string().optional()
    })
});

const getGraphSchema = z.object({
    query: z.object({
        window: z.enum(['6H', '24H', '1W', '1M']).default('6H')
    })
});

const nodeIdSchema = z.object({
    params: z.object({
        id: z.string().min(1, "Device ID is required")
    })
});

router.get("/", auditLog("VIEW_DASHBOARD"), validate(getNodesSchema), getNodes);
router.get("/:id", validate(nodeIdSchema), auditLog("VIEW_DEVICE_DETAILS"), getNodeById);
router.get("/:id/telemetry", requireAuth, validate(nodeIdSchema), getNodeTelemetry);
router.get("/:id/analytics", requireAuth, validate(nodeIdSchema), getNodeAnalytics);
router.get("/:id/graph", requireAuth, validate(nodeIdSchema), validate(getGraphSchema), getNodeGraphData);
// ✅ NEW: Hybrid graph endpoint for 1W, 1M, 3M, custom ranges
router.get("/:id/graph-hybrid", requireAuth, validate(nodeIdSchema), getNodeGraphDataHybrid);

module.exports = router;
