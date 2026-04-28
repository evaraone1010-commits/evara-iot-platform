module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/config/**/*.js"
  ],
  coverageDirectory: "coverage",
  clearMocks: true
};
