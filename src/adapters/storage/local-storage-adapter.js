/**
 * Default localStorage-based storage adapter for browser
 * @module adapters/storage/local-storage-adapter
 */

/**
 * LocalStorageAdapter - Storage adapter using browser localStorage
 * @class
 * @implements {import('./types.js').StorageAdapter}
 */
class LocalStorageAdapter {
  constructor() {
    this.isAsync = false
  }

  /**
   * Get item from localStorage
   * @param {string} key
   * @returns {string | null}
   */
  getItem(key) {
    return globalThis.localStorage?.getItem(key) ?? null
  }

  /**
   * Set item in localStorage
   * @param {string} key
   * @param {string} value
   */
  setItem(key, value) {
    globalThis.localStorage?.setItem(key, value)
  }

  /**
   * Remove item from localStorage
   * @param {string} key
   */
  removeItem(key) {
    globalThis.localStorage?.removeItem(key)
  }

  /**
   * Clear all items from localStorage
   */
  clear() {
    globalThis.localStorage?.clear()
  }
}

/**
 * Create a localStorage-based storage adapter
 * @returns {LocalStorageAdapter}
 */
export function createLocalStorageAdapter() {
  return new LocalStorageAdapter()
}
