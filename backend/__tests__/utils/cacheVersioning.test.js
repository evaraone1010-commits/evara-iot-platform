const mockGet = jest.fn();
const mockSet = jest.fn(() => Promise.resolve());
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockDebug = jest.fn();
const mockIncrement = jest.fn((value) => ({ __op: "increment", value }));

jest.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: mockIncrement
  }
}));

jest.mock("../../src/config/firebase.js", () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockGet,
        set: mockSet
      }))
    }))
  }
}));

jest.mock("../../src/utils/logger.js", () => ({
  warn: mockWarn,
  error: mockError,
  debug: mockDebug
}));

const { getVersionKey, incrementCacheVersion, initializeCacheVersions } = require("../../src/utils/cacheVersioning.js");

describe("cacheVersioning", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getVersionKey returns the current versioned key", async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ version: 7 })
    });

    await expect(getVersionKey("zones_list")).resolves.toBe("zones_list_v7");
  });

  test("incrementCacheVersion writes an atomic increment", async () => {
    await incrementCacheVersion("customers");

    expect(mockIncrement).toHaveBeenCalledWith(1);
    expect(mockSet).toHaveBeenCalledWith(
      { version: { __op: "increment", value: 1 } },
      { merge: true }
    );
  });

  test("initializeCacheVersions seeds missing version docs", async () => {
    mockGet.mockResolvedValue({ exists: false });

    await initializeCacheVersions();

    expect(mockSet).toHaveBeenCalledTimes(6);
    expect(mockSet.mock.calls[0][0]).toEqual(
      expect.objectContaining({ version: 1, created_at: expect.any(Date) })
    );
  });
});