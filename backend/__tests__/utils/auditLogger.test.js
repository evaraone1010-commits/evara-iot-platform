const mockAdd = jest.fn(() => Promise.resolve({ id: "audit-log-id" }));
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockDebug = jest.fn();

jest.mock("../../src/config/firebase.js", () => ({
  db: {
    collection: jest.fn(() => ({
      add: mockAdd
    }))
  }
}));

jest.mock("../../src/utils/logger.js", () => ({
  warn: mockWarn,
  error: mockError,
  debug: mockDebug
}));

const { logAudit, logAuditBatch } = require("../../src/utils/auditLogger.js");

describe("auditLogger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("logAudit removes undefined metadata values before writing", () => {
    logAudit("user-1", "create", "customers", "customer-1", {
      display_name: "Acme",
      full_name: undefined,
      email: "acme@example.com",
      nested: {
        visible: true,
        hidden: undefined
      }
    });

    expect(mockAdd).toHaveBeenCalledTimes(1);

    const payload = mockAdd.mock.calls[0][0];
    expect(payload.action).toBe("CREATE");
    expect(payload.metadata).toEqual({
      display_name: "Acme",
      email: "acme@example.com",
      nested: {
        visible: true
      }
    });
    expect(payload.metadata.full_name).toBeUndefined();
    expect(payload.metadata.nested.hidden).toBeUndefined();
  });

  test("logAuditBatch delegates each record to logAudit", () => {
    logAuditBatch("user-1", "UPDATE", [
      { resourceType: "customers", resourceId: "a" },
      { resourceType: "zones", resourceId: "b", metadata: { state: "CA" } }
    ]);

    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd.mock.calls[1][0].resource_type).toBe("zones");
    expect(mockAdd.mock.calls[1][0].metadata).toEqual({ state: "CA" });
  });
});