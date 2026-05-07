const admin = require("firebase-admin");
const logger = require("../utils/logger.js");

function buildFirebaseConfigFromEnv() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
        return null;
    }

    return {
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
        projectId,
        databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
    };
}

if (!admin.apps.length) {
    const config = buildFirebaseConfigFromEnv();
    if (config) {
        admin.initializeApp(config);
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore();

module.exports = { db, admin };

// Non-blocking startup connectivity test
(async () => {
  try {
        const hasServiceAccount = process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY;
        if (!hasServiceAccount && process.env.NODE_ENV !== 'production') {
            logger.warn("[Firebase] Service-account env vars are missing; skipping Firestore connectivity probe in development.");
            return;
        }

    const testStart = Date.now();
    const snapshot = await db.collection("zones").limit(1).get();
    const elapsed = Date.now() - testStart;
    logger.debug(`[Firebase] ✅ Firestore connectivity OK (${elapsed}ms, docs: ${snapshot.size})`);
  } catch (err) {
    logger.error("[Firebase] ❌ Firestore connectivity FAILED:", err.message);
  }
})();


