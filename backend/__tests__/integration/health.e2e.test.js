require("dotenv").config({ path: require('path').resolve(__dirname, '../../.env.test') });
const request = require("supertest");
const server = require("../../src/server.js");

describe("E2E Integration Test - Firebase Emulator + Express App", () => {

  afterAll(async () => {
    // Teardown the server connections so Jest doesn't hang
    if (server && server.close) {
        await new Promise((resolve) => server.close(resolve));
    }
  });

  describe("GET /api/v1/health", () => {
    it("should return healthy status 200", async () => {
        const response = await request(server).get("/api/v1/health");
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("status");
    });
  });

  describe("GET /health", () => {
    it("should return healthy status 200 for ALB checks", async () => {
        const response = await request(server).get("/health");
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("status");
    });
  });

  describe("API Fallback Router", () => {
    it("should return a 404 for unknown endpoints", async () => {
        const response = await request(server).get("/api/v1/doesnotexist");
        expect(response.status).toBe(404);
        // It returns standard HTML 'Not Found' instead of JSON currently
    });
  });
});
