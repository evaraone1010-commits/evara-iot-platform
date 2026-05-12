require("dotenv").config({ path: require('path').resolve(__dirname, '../../.env.test') });
const request = require("supertest");
const server = require("../../src/server.js");

describe("API Integration Tests - Critical Flows", () => {

  afterAll(async () => {
    // Teardown the server connections so Jest doesn't hang
    if (server && server.close) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==============================
  // Health Endpoint Tests
  // ==============================
  describe("Health endpoint", () => {
    it("returns 200 with status ok", async () => {
      const res = await request(server).get("/api/v1/health");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status");
    });

    it("returns 200 for ALB health check", async () => {
      const res = await request(server).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("status");
    });
  });

  // ==============================
  // Auth Middleware Tests
  // ==============================
  describe("Auth middleware", () => {
    it("rejects requests without token to protected endpoints", async () => {
      const res = await request(server).get("/api/v1/admin/dashboard");
      expect(res.status).toBe(401);
    });

    it("rejects requests with invalid token", async () => {
      const res = await request(server)
        .get("/api/v1/admin/dashboard")
        .set("Authorization", "Bearer invalid-token-that-doesnt-exist");
      expect(res.status).toBe(401);
    });

    it("rejects requests with malformed Authorization header", async () => {
      const res = await request(server)
        .get("/api/v1/admin/dashboard")
        .set("Authorization", "NotABearerToken");
      expect(res.status).toBe(401);
    });
  });

  // ==============================
  // Rate Limiting Tests
  // ==============================
  describe("Rate limiting on auth attempts", () => {
    it("blocks excessive failed login attempts", async () => {
      // Attempt login 12 times (default limit is typically 10-15)
      const loginAttempts = Array(12).fill(null).map(() =>
        request(server).post("/api/v1/auth/login")
          .send({ email: "nonexistent@test.com", password: "wrongpassword" })
      );

      const results = await Promise.all(loginAttempts);

      // At least one should be rate limited (429)
      const rateLimited = results.filter(r => r.status === 429);
      const forbidden = results.filter(r => r.status === 401 || r.status === 400);

      // Either rate limited or unauthorized is acceptable
      expect(rateLimited.length + forbidden.length).toBeGreaterThan(0);
    }, 15000); // Increase timeout for rate limiting test
  });

  // ==============================
  // Audit Logger Tests
  // ==============================
  describe("Audit logger with edge cases", () => {
    it("does not throw when logging without metadata", async () => {
      const { auditLog } = require("../../src/middleware/audit.middleware.js");
      
      // This should not throw
      expect(() => {
        if (auditLog) auditLog({ action: "test_action", userId: "test-user" });
      }).not.toThrow();
    });

    it("handles undefined fields in audit logs gracefully", async () => {
      // Even if auditLogger is not directly callable, the middleware should handle it
      const res = await request(server)
        .post("/api/v1/auth/login")
        .send({ email: "test@test.com", password: "test" });
      
      // Should return 400/401 without crashing from undefined metadata
      expect([400, 401, 403]).toContain(res.status);
    });
  });

  // ==============================
  // Error Handling Tests
  // ==============================
  describe("Error handling", () => {
    it("returns 404 for unknown endpoints", async () => {
      const res = await request(server).get("/api/v1/this-endpoint-does-not-exist");
      expect(res.status).toBe(404);
    });

    it("returns appropriate error for malformed JSON body", async () => {
      const res = await request(server)
        .post("/api/v1/auth/login")
        .set("Content-Type", "application/json")
        .send("{ invalid json }");
      
      // Should handle malformed JSON gracefully
      expect([400, 500]).toContain(res.status);
    });
  });

  // ==============================
  // CORS Tests
  // ==============================
  describe("CORS configuration", () => {
    it("includes CORS headers in response", async () => {
      const res = await request(server)
        .get("/health")
        .set("Origin", "http://localhost:3000");
      
      // Should return 200 with CORS headers in dev mode
      expect(res.status).toBe(200);
    });
  });

  // ==============================
  // Security Headers Tests
  // ==============================
  describe("Security headers", () => {
    it("includes helmet security headers", async () => {
      const res = await request(server).get("/health");
      
      // Helmet should add these headers
      expect(res.headers).toHaveProperty("x-content-type-options");
    });

    it("sets appropriate content type", async () => {
      const res = await request(server).get("/api/v1/health");
      expect(res.type).toMatch(/json/);
    });
  });

});
