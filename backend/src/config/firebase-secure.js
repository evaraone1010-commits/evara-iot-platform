const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

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
        console.log('[Firebase] Admin SDK already initialized.');
        if (!db) db = getFirestore();
        return resolve();
      }

    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        console.log('[Firebase] Initializing from GOOGLE_APPLICATION_CREDENTIALS_JSON...');
        
        // Validate that the env var is actually set and not empty
        const rawCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON.trim();
        if (!rawCreds) {
          throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is set but empty');
        }

        let serviceAccount;
        try {
          serviceAccount = JSON.parse(rawCreds);
        } catch (jsonErr) {
          throw new Error(`GOOGLE_APPLICATION_CREDENTIALS_JSON contains invalid JSON: ${jsonErr.message}`);
        }

        // Validate service account has required fields
        if (!serviceAccount.project_id) {
          throw new Error('Service account JSON missing required field: project_id');
        }
        if (!serviceAccount.private_key) {
          throw new Error('Service account JSON missing required field: private_key');
        }
        if (!serviceAccount.client_email) {
          throw new Error('Service account JSON missing required field: client_email');
        }

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });
        firebaseCredentialSource = 'env_json';
        console.log(`[Firebase] ✅ Initialized with project: ${serviceAccount.project_id}`);
      } else if (fs.existsSync(LOCAL_SERVICE_ACCOUNT_PATH) && process.env.NODE_ENV !== 'production') {
        console.log('[Firebase] Initializing from local service-account.json...');
        const sa = require(LOCAL_SERVICE_ACCOUNT_PATH);
        admin.initializeApp({
          credential: admin.credential.cert(sa),
          projectId: sa.project_id,
        });
        firebaseCredentialSource = 'local-file';
        console.log(`[Firebase] ✅ Initialized with project: ${sa.project_id}`);
      } else {
        console.log('[Firebase] No explicit credentials — initializing with ADC');
        admin.initializeApp();
        firebaseCredentialSource = 'adc';
      }

      db = getFirestore();

      try {
        const testStart = Date.now();
        await db.collection('__healthcheck__').limit(1).get();
        console.log(`[Firebase] ✅ Firestore connectivity OK (${Date.now() - testStart}ms)`);
      } catch (firestoreErr) {
        console.warn(`[Firebase] ⚠️ Firestore connectivity test failed: ${firestoreErr.message}`);
      }

      resolve();

    } catch (err) {
      console.error('=== FIREBASE INIT ERROR ===');
      console.error('Message:', err.message);
      console.error('Stack:', err.stack);
      console.error('GOOGLE_APPLICATION_CREDENTIALS_JSON exists:', !!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      console.error('JSON length:', process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.length);
      console.error('JSON preview:', process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.substring(0, 100));
      process.exit(1);
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