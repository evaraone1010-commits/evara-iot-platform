module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,
  // Only collect coverage when running in CI to avoid importing
  // Firestore-heavy modules after local teardown which can cause
  // "import after Jest environment has been torn down" errors.
  collectCoverage: Boolean(process.env.CI),
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/config/**/*.js"
  ],
  coverageDirectory: "coverage",
  clearMocks: true
  ,
  // Ensure Firebase apps are closed after tests to avoid open handles
  globalTeardown: "<rootDir>/tests/teardown.js"
};
