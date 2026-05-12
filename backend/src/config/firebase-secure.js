const admin = require("firebase-admin");
const logger = require("../utils/logger.js");
const fs = require("fs");
const path = require("path");

const LOCAL_SERVICE_ACCOUNT_PATH = path.join(__dirname, "..", "..", "service-account.json");
let firebaseCredentialSource = "adc";

// Standard way to load credentials in production environments like Railway/GCP
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    firebaseConfig = {
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    };
    firebaseCredentialSource = 'env_json';
  } catch (e) {
    logger.error('[Firebase] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', e.message);
  }
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
  let firebaseConfig = null;
  let firebaseCredentialSource = 'uninitialized';

  // Standard way to load credentials in production environments like Railway/GCP
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      firebaseConfig = {
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      };
      firebaseCredentialSource = 'env_json';
      logger.debug('[Firebase] Initializing Admin SDK from GOOGLE_APPLICATION_CREDENTIALS_JSON');
      admin.initializeApp(firebaseConfig);
    } catch (e) {
      logger.error('[Firebase] Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', e.message);
    }
  }

  // Fallback for local development
  if (!admin.apps.length) {
    try {
      if (fs.existsSync(LOCAL_SERVICE_ACCOUNT_PATH) && process.env.NODE_ENV !== 'production') {
        logger.info('[Firebase] service-account.json found locally — initializing Admin SDK from file (development only)');
        const sa = require(LOCAL_SERVICE_ACCOUNT_PATH);
        firebaseCredentialSource = 'local-file';
        admin.initializeApp({
          credential: admin.credential.cert(sa),
          projectId: sa.project_id,
        });
      } else {
        logger.info('[Firebase] No explicit Firebase credentials found — initializing Admin SDK with ADC');
        firebaseCredentialSource = 'adc';
        admin.initializeApp();
      }
    } catch (err) {
      logger.error('[Firebase] Error during fallback initialization:', err.message);
      if (!admin.apps.length) {
        admin.initializeApp(); // Final attempt with ADC
      }
    }
  const snapshot = await db.collection("zones").limit(1).get();
    const elapsed = Date.now() - testStart;
    logger.debug(`[Firebase] ✅ Firestore connectivity OK (${elapsed}ms, docs: ${snapshot.size})`);
  } catch (err) {
    logger.error("[Firebase] ❌ Firestore connectivity FAILED:", err.message);
  }
})();


