const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const LOCAL_SERVICE_ACCOUNT_PATH = path.join(__dirname, '..', '..', 'service-account.json');
let firebaseCredentialSource = 'uninitialized';
let db = null;

function hasExplicitFirebaseCredentials() {
  return !!(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    (fs.existsSync(LOCAL_SERVICE_ACCOUNT_PATH) && process.env.NODE_ENV !== 'production')
  );
}

function getFirebaseCredentialSource() {
  return firebaseCredentialSource;
}

function initializeFirebase() {
  return new Promise(async (resolve, reject) => {
    if (admin.apps.length) {
      logger.debug('[Firebase] Admin SDK already initialized.');
      if (!db) db = getFirestore();
      return resolve();
    }

    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        logger.info('[Firebase] Initializing from GOOGLE_APPLICATION_CREDENTIALS_JSON...');
        const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });
        firebaseCredentialSource = 'env_json';
        logger.info(`[Firebase] ✅ Initialized with project: ${serviceAccount.project_id}`);
      } else if (fs.existsSync(LOCAL_SERVICE_ACCOUNT_PATH) && process.env.NODE_ENV !== 'production') {
        logger.info('[Firebase] Initializing from local service-account.json...');
        const sa = require(LOCAL_SERVICE_ACCOUNT_PATH);
        admin.initializeApp({
          credential: admin.credential.cert(sa),
          projectId: sa.project_id,
        });
        firebaseCredentialSource = 'local-file';
        logger.info(`[Firebase] ✅ Initialized with project: ${sa.project_id}`);
      } else {
        logger.info('[Firebase] No explicit credentials — initializing with ADC');
        admin.initializeApp();
        firebaseCredentialSource = 'adc';
      }

      db = getFirestore();

      try {
        const testStart = Date.now();
        await db.collection('__healthcheck__').limit(1).get();
        logger.info(`[Firebase] ✅ Firestore connectivity OK (${Date.now() - testStart}ms)`);
      } catch (firestoreErr) {
        logger.warn(`[Firebase] ⚠️ Firestore connectivity test failed: ${firestoreErr.message}`);
      }

      resolve();

    } catch (err) {
      logger.error(`[Firebase] ❌ Initialization FAILED: ${err.message}`);
      reject(err);
    }
  });
}

module.exports = {
  get db() { return db; },
  get admin() { return admin; },
  hasExplicitFirebaseCredentials,
  getFirebaseCredentialSource,
  initializeFirebase,
};