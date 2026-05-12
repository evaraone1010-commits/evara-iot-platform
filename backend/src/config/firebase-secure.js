const admin = require("firebase-admin");
const logger = require("../utils/logger.js");
const fs = require("fs");
const path = require("path");

const LOCAL_SERVICE_ACCOUNT_PATH = path.join(__dirname, "..", "..", "service-account.json");
let firebaseCredentialSource = "adc";

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
        logger.debug('[Firebase] Initializing Admin SDK from env service-account variables');
        firebaseCredentialSource = "env";
        admin.initializeApp(config);
    } else {
        // Attempt to load a local service-account.json in development for convenience
        try {
            if (fs.existsSync(LOCAL_SERVICE_ACCOUNT_PATH) && process.env.NODE_ENV !== 'production') {
                logger.info('[Firebase] service-account.json found locally — initializing Admin SDK from file (development only)');
                const sa = require(LOCAL_SERVICE_ACCOUNT_PATH);
                firebaseCredentialSource = "local-file";
                admin.initializeApp({
                    credential: admin.credential.cert(sa),
                    projectId: sa.project_id || undefined,
                    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
                    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
                });
            } else {
                logger.info('[Firebase] No explicit Firebase credentials found — initializing Admin SDK with ADC');
                firebaseCredentialSource = "adc";
                admin.initializeApp();
            }
        } catch (err) {
            logger.error('[Firebase] Error while attempting to load local service-account.json:', err.message);
            firebaseCredentialSource = "adc";
            admin.initializeApp();
        }
    }
}

const db = admin.firestore();

function hasExplicitFirebaseCredentials() {
    return firebaseCredentialSource === "env" || firebaseCredentialSource === "local-file";
}

function getFirebaseCredentialSource() {
    return firebaseCredentialSource;
}

module.exports = { db, admin, hasExplicitFirebaseCredentials, getFirebaseCredentialSource };

// Non-blocking startup connectivity test
(async () => {
  try {
        if (!hasExplicitFirebaseCredentials() && process.env.NODE_ENV !== 'production') {
            logger.info("[Firebase] Explicit Firebase credentials are not configured; skipping Firestore connectivity probe in development.");
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


