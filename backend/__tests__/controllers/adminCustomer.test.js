const request = require("supertest");

const mockAuditAdd = jest.fn(() => Promise.resolve({ id: "audit-log-id" }));
const mockCacheVersionSet = jest.fn(() => Promise.resolve());
const mockCacheVersionGet = jest.fn(() => Promise.resolve({ exists: false }));
const mockBatch = {
  set: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  commit: jest.fn(() => Promise.resolve())
};
const mockCustomerDoc = jest.fn((id) => ({
  id: id || "generated-customer-id"
}));
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockDebug = jest.fn();
const mockServerTimestamp = jest.fn(() => "SERVER_TIMESTAMP");
const mockIncrement = jest.fn((value) => ({ __op: "increment", value }));

jest.mock("firebase-admin", () => ({
  firestore: {
    FieldValue: {
      serverTimestamp: mockServerTimestamp
    }
  }
}));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: mockIncrement
  }
}));

jest.mock("../../src/config/firebase.js", () => ({
  db: {
    collection: jest.fn((name) => {
      if (name === "audit_logs") {
        return {
          add: mockAuditAdd,
          doc: jest.fn(() => ({ id: "audit-log-id" }))
        };
      }

      if (name === "_cache_versions") {
        return {
          doc: jest.fn(() => ({
            get: mockCacheVersionGet,
            set: mockCacheVersionSet
          }))
        };
      }

      return {
        doc: mockCustomerDoc,
        where: jest.fn(),
        limit: jest.fn(),
        get: jest.fn(),
        add: jest.fn()
      };
    }),
    batch: jest.fn(() => mockBatch)
  },
  admin: {
    firestore: {
      FieldValue: {
        serverTimestamp: mockServerTimestamp
      }
    }
  }
}));

jest.mock("../../src/utils/logger.js", () => ({
  warn: mockWarn,
  error: mockError,
  debug: mockDebug,
  info: jest.fn()
}));

jest.mock("../../src/utils/cacheVersioning.js", () => ({
  getVersionKey: jest.fn(),
  incrementCacheVersion: jest.fn(() => Promise.resolve()),
  initializeCacheVersions: jest.fn(() => Promise.resolve())
}));

const { startTestServer } = require("../../test_helpers/startServer.js");
const { updateCustomer } = require("../../src/controllers/admin.controller.js");
const { incrementCacheVersion } = require("../../src/utils/cacheVersioning.js");

describe("admin customer flows", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBatch.set.mockClear();
    mockBatch.update.mockClear();
    mockBatch.delete.mockClear();
    mockBatch.commit.mockClear();
    mockAuditAdd.mockClear();
    mockCacheVersionSet.mockClear();
    mockCacheVersionGet.mockClear();
    mockCustomerDoc.mockClear();
    mockServerTimestamp.mockClear();
    mockIncrement.mockClear();
  });

  test("createCustomer succeeds through the admin route and writes sanitized audit data", async () => {
    const { server, close } = await startTestServer();

    try {
      const response = await request(server)
        .post("/api/v1/admin/customers")
        .send({
          display_name: "Acme Water",
          full_name: "Acme Water Pvt Ltd",
          email: "acme@example.com",
          phone_number: "1234567890",
          password: "secret-password",
          confirmPassword: "secret-password",
          role: "customer",
          status: "active",
          regionFilter: "west"
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, id: "generated-customer-id" });
      expect(mockBatch.commit).toHaveBeenCalledTimes(1);
      expect(incrementCacheVersion).toHaveBeenCalledWith("customers");
      expect(incrementCacheVersion).toHaveBeenCalledWith("default");

      const auditPayload = mockBatch.set.mock.calls[1][1];
      expect(auditPayload.metadata).toEqual(
        expect.objectContaining({
          display_name: "Acme Water",
          full_name: "Acme Water Pvt Ltd",
          email: "acme@example.com",
          phone_number: "1234567890",
          role: "customer",
          status: "active",
          regionFilter: "west"
        })
      );
      expect(auditPayload.metadata.password).toBeUndefined();
      expect(auditPayload.metadata.confirmPassword).toBeUndefined();

      const customerPayload = mockBatch.set.mock.calls[0][1];
      expect(customerPayload.created_at).toBe("SERVER_TIMESTAMP");
      expect(customerPayload.display_name).toBe("Acme Water");
      expect(customerPayload.zone_id).toBe("west");
    } finally {
      await close();
    }
  });

  test("updateCustomer strips undefined values before audit metadata is written", async () => {
    const req = {
      body: {
        display_name: "Updated Name",
        phone: undefined,
        email: "updated@example.com"
      },
      params: { id: "customer-1" },
      user: {
        uid: "user-1",
        role: "superadmin",
        community_id: "test-community",
        customer_id: "customer-1"
      }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await updateCustomer(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockBatch.update).toHaveBeenCalledTimes(1);
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);

    const auditPayload = mockBatch.set.mock.calls[0][1];
    expect(auditPayload.metadata).toEqual({
      display_name: "Updated Name",
      email: "updated@example.com"
    });
    expect(auditPayload.metadata.phone).toBeUndefined();
    expect(incrementCacheVersion).toHaveBeenCalledWith("customers");
  });
});