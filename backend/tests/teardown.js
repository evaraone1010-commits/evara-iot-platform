const admin = require('firebase-admin');

module.exports = async () => {
  try {
    if (admin.apps && admin.apps.length) {
      // Delete all initialized admin apps to close open handles
      await Promise.all(admin.apps.map((app) => app.delete()));
    }
  } catch (err) {
    // Teardown should not throw — log and continue
    // Use console since test environment logger may not be available
    console.warn('[Jest] globalTeardown failed:', err && err.message ? err.message : err);
  }
};
