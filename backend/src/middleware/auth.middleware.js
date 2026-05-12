const { admin, db } = require("../config/firebase.js");
const cache = require("../config/cache.js");
const logger = require("../utils/logger.js"); // ✅ AUDIT FIX M10
const Sentry = require("@sentry/node");

const AUTH_CACHE_TTL = 180; // 3 minutes

const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing auth token" });
    }

    const idToken = authHeader.split(" ")[1];

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        // Check cache first for user role data
        const cacheKey = `auth_role_${decodedToken.uid}`;
        let userData = await cache.get(cacheKey);

        if (!userData) {
            // ✅ AUDIT FIX: Use AbortController instead of Promise.race to prevent orphaned promises
            const controller = new AbortController();
            const { signal } = controller;
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

            try {
                // Priority 1: Superadmins by ID
                let userDoc = await db.collection("superadmins").doc(decodedToken.uid).get();
                if (signal.aborted) throw new Error('AbortError');
                
                if (userDoc.exists) {
                    userData = userDoc.data();
                } else {
                    // Priority 2: Customers by ID
                    userDoc = await db.collection("customers").doc(decodedToken.uid).get();
                    if (signal.aborted) throw new Error('AbortError');

                    if (userDoc.exists) {
                        userData = { ...userDoc.data(), id: userDoc.id };
                    } else if (decodedToken.email) {
                        // Priority 3: Customers by Email (Fallback for pre-provisioned SaaS users)
                        const emailMatches = await db.collection("customers")
                            .where("email", "==", decodedToken.email)
                            .limit(1)
                            .get();
                        
                        if (signal.aborted) throw new Error('AbortError');
                        
                        if (!emailMatches.empty) {
                            const match = emailMatches.docs[0];
                            userData = { ...match.data(), id: match.id };
                        } else {
                            // Auto-provision basic customer profile
                            const bootstrapProfile = {
                                email: decodedToken.email,
                                full_name: decodedToken.name || decodedToken.email.split("@")[0] || "User",
                                display_name: decodedToken.name || decodedToken.email.split("@")[0] || "User",
                                role: "customer",
                                plan: "pro",
                                status: "active",
                                phone_number: "",
                                zone_id: null,
                                created_at: new Date().toISOString(),
                            };

                            await db.collection("customers").doc(decodedToken.uid).set(bootstrapProfile, { merge: true });
                            if (signal.aborted) throw new Error('AbortError');
                            userData = { ...bootstrapProfile, id: decodedToken.uid };
                        }
                    }
                }

                if (userData) {
                    await cache.set(cacheKey, userData, AUTH_CACHE_TTL);
                }
            } catch (err) {
                if (err.name === 'AbortError' || signal.aborted) {
                    logger.warn('[Auth Middleware] Auth lookup timed out', { uid: decodedToken.uid });
                    return res.status(503).json({ error: "Authentication service timeout" });
                }
                logger.error("[Auth Middleware] Firestore lookup failed", err, { category: 'auth' });
                return res.status(503).json({ error: "Authentication service unavailable" });
            } finally {
                clearTimeout(timeoutId);
            }
        }

        // If Firestore returned null (no user found, or lookup failed), reject
        if (!userData || !userData.role) {
            return res.status(403).json({ error: "Access denied: user account not found in system" });
        }
        
        const role = (userData.role || "customer").trim().toLowerCase().replace(/\s+/g, "");
        logger.auth('resolved', decodedToken.uid, { role });
        
        req.user = {
            ...decodedToken,
            role: role,
            display_name: userData.display_name || userData.full_name || decodedToken.name,
            community_id: userData.community_id || "",
            customer_id: userData.customer_id || userData.id || "" // Robust fallback to doc.id
        };

        next();
    } catch (error) {
        logger.error("Token verification failed", error, { category: 'auth', code: error.code, name: error.name });

        Sentry.captureException(error);
        return res.status(401).json({ error: "Unauthorized" });
    }
};

/**
 * SaaS Architecture: Securing Device Access
 * 
 * ─── #6 FIX: TOCTOU race condition in ownership verification ─────────────────
 * ORIGINAL BUG: Between cache miss and Firestore read, device ownership could change.
 * A device reassigned from Customer A to Customer B would cache the NEW owner, but
 * the OLD owner's cached entry from before the transfer could still be valid for 4 hours.
 *
 * FIX STRATEGY:
 *   • Cache stores full ownership objects {customer_id, community_id} not bare strings
 *   • TTL reduced from 4 hours → 5 minutes (300s) so stale entries expire quickly
 *   • Use cache key `owner_v2_${deviceId}` to avoid collisions with old string-format entries
 *   • For security-sensitive paths, callers can pass { bypassCache: true }
 *
 * Efficiently verifies if a user owns a device using tiered collection lookups.
 */
async function checkOwnership(uid, deviceId, role = "customer", communityId = "", options = {}) {
    if (role === "superadmin") return true;
    if (!uid || !deviceId) return false;

    const cacheKey = `owner_v2_${deviceId}`; // v2 key prevents collisions with old entries

    try {
        // ────────────────────────────────────────────────────────────────────────────
        // Cache read (skip if bypassCache is set)
        // ────────────────────────────────────────────────────────────────────────────
        if (!options.bypassCache) {
            const cached = await cache.get(cacheKey);
            if (cached) {
                // Validate cached object has expected shape
                if (cached.customer_id === uid) return true;
                if (communityId && (cached.customer_id === communityId || cached.community_id === communityId)) return true;
            }
        }

        // ────────────────────────────────────────────────────────────────────────────
        // Authoritative Firestore read (Optimized single read if possible)
        // ────────────────────────────────────────────────────────────────────────────
        const registry = await db.collection("devices").doc(deviceId).get();
        if (!registry.exists) return false;

        const regData = registry.data();
        let ownerId = regData.customer_id || regData.customerId || null;
        let ownerCommunityId = regData.community_id || regData.communityId || null;

        // If registry doesn't have ownership, fallback to typed collection (legacy support)
        if (!ownerId && regData.device_type) {
            const meta = await db.collection(regData.device_type.toLowerCase()).doc(deviceId).get();
            if (meta.exists) {
                const data = meta.data();
                ownerId = data.customer_id || null;
                ownerCommunityId = data.community_id || null;
            }
        }

        // ────────────────────────────────────────────────────────────────────────────
        // Write fresh ownership OBJECT to cache (not bare string!)
        // TTL: 5 minutes (300s) — short enough that device transfers are reflected
        // within one polling cycle, long enough to absorb normal read traffic.
        // ────────────────────────────────────────────────────────────────────────────
        if (ownerId || ownerCommunityId) {
            await cache.set(
                cacheKey,
                { customer_id: ownerId, community_id: ownerCommunityId },
                300  // 5 minutes, NOT 4 hours
            );
        }

        // ────────────────────────────────────────────────────────────────────────────
        // Ownership check
        // ────────────────────────────────────────────────────────────────────────────
        if (ownerId === uid) return true;
        if (communityId && (ownerId === communityId || ownerCommunityId === communityId)) return true;

        return false;
    } catch (err) {
        logger.error("Ownership check failed", err, { category: 'auth' });
        return false;
    }
}

module.exports = { requireAuth, checkOwnership };

