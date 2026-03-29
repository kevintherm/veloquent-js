/**
 * Async storage adapter for Velo SDK (e.g. for React Native AsyncStorage)
 * @module adapters/storage/async-storage-adapter
 */

/**
 * AsyncStorageAdapter - Storage adapter using an external async storage instance
 * @class
 * @implements {import('./types.js').StorageAdapter}
 */
class AsyncStorageAdapter {
  /**
   * @param {Object} storage - The async storage instance (must have getItem, setItem, removeItem, clear)
   */
  constructor(storage) {
    this.storage = storage
    this.isAsync = true
  }

  // Sync methods (not used when isAsync is true, but required by interface)
  getItem() { throw new Error('Velo SDK: Use getItemAsync for this adapter') }
  setItem() { throw new Error('Velo SDK: Use setItemAsync for this adapter') }
  removeItem() { throw new Error('Velo SDK: Use removeItemAsync for this adapter') }
  clear() { throw new Error('Velo SDK: Use clearAsync for this adapter') }

  /**
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async getItemAsync(key) {
    return await this.storage.getItem(key)
  }

  /**
   * @param {string} key
   * @param {string} value
   * @returns {Promise<void>}
   */
  async setItemAsync(key, value) {
    await this.storage.setItem(key, value)
  }

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async removeItemAsync(key) {
    await this.storage.removeItem(key)
  }

  /**
   * @returns {Promise<void>}
   */
  async clearAsync() {
    await this.storage.clear()
  }
}

/**
 * Create an async storage adapter
 * @param {Object} storage - The storage instance (e.g. AsyncStorage)
 * @returns {AsyncStorageAdapter}
 */
export function createAsyncStorageAdapter(storage) {
  return new AsyncStorageAdapter(storage)
}
