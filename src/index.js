/**
 * Velo BaaS JavaScript SDK
 * Lightweight, adapter-first SDK with pluggable HTTP and storage
 */

export { VeloPHP } from './core/client.js'
export { createFetchAdapter } from './adapters/http/fetch-adapter.js'
export { createLocalStorageAdapter } from './adapters/storage/local-storage-adapter.js'
export { createAsyncStorageAdapter } from './adapters/storage/async-storage-adapter.js'
export { createEchoAdapter } from './adapters/realtime/echo.js'
export { SdkError } from './errors/sdk-error.js'
