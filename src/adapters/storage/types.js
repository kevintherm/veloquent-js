/**
 * Storage Adapter type definitions for Velo SDK
 * @module adapters/storage/types
 */

/**
 * Storage adapter contract - implement this to provide custom storage backends
 * Supports both sync (localStorage) and async (AsyncStorage, IndexedDB) patterns
 * 
 * @interface StorageAdapter
 * @property {boolean} isAsync - True if this adapter is async
 * @property {(key: string) => string | null} getItem - Sync read (required)
 * @property {(key: string, value: string) => void} setItem - Sync write (required)
 * @property {(key: string) => void} removeItem - Sync delete (required)
 * @property {(key: string) => void} clear - Sync clear all (required)
 * @property {(key: string) => Promise<string | null>} [getItemAsync] - Async read (optional, used if isAsync=true)
 * @property {(key: string, value: string) => Promise<void>} [setItemAsync] - Async write (optional, used if isAsync=true)
 * @property {(key: string) => Promise<void>} [removeItemAsync] - Async delete (optional, used if isAsync=true)
 * @property {() => Promise<void>} [clearAsync] - Async clear all (optional, used if isAsync=true)
 */

export {}
