import { expect, test, describe, spyOn } from "bun:test";
import { createAsyncStorageAdapter } from "../src/adapters/storage/async-storage-adapter.js";

describe("AsyncStorageAdapter", () => {
  const mockStorage = {
    getItem: (key) => Promise.resolve(`value-for-${key}`),
    setItem: (key, value) => Promise.resolve(),
    removeItem: (key) => Promise.resolve(),
    clear: () => Promise.resolve(),
  };

  test("should implement StorageAdapter interface with isAsync=true", () => {
    const adapter = createAsyncStorageAdapter(mockStorage);
    expect(adapter.isAsync).toBe(true);
  });

  test("should call storage methods correctly", async () => {
    const getItemSpy = spyOn(mockStorage, "getItem");
    const setItemSpy = spyOn(mockStorage, "setItem");
    const removeItemSpy = spyOn(mockStorage, "removeItem");
    const clearSpy = spyOn(mockStorage, "clear");

    const adapter = createAsyncStorageAdapter(mockStorage);

    await adapter.getItemAsync("test-key");
    expect(getItemSpy).toHaveBeenCalledWith("test-key");

    await adapter.setItemAsync("test-key", "test-value");
    expect(setItemSpy).toHaveBeenCalledWith("test-key", "test-value");

    await adapter.removeItemAsync("test-key");
    expect(removeItemSpy).toHaveBeenCalledWith("test-key");

    await adapter.clearAsync();
    expect(clearSpy).toHaveBeenCalled();
  });

  test("should throw on sync methods", () => {
    const adapter = createAsyncStorageAdapter(mockStorage);
    expect(() => adapter.getItem("key")).toThrow();
    expect(() => adapter.setItem("key", "val")).toThrow();
    expect(() => adapter.removeItem("key")).toThrow();
    expect(() => adapter.clear()).toThrow();
  });
});
