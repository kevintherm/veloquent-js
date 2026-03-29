/**
 * SDK configuration and validation
 * @module core/config
 */

/**
 * @typedef {Object} SdkConfig
 * @property {string} apiUrl - Base API URL (e.g., https://api.example.com)
 * @property {import('../adapters/http/types.js').HttpAdapter} http - HTTP adapter
 * @property {import('../adapters/storage/types.js').StorageAdapter} storage - Storage adapter
 * @property {Object} [realtime] - Optional realtime adapter
 * @property {number} [timeout=30000] - Default request timeout in milliseconds
 * @property {number} [retryAttempts=1] - Number of retry attempts for failed requests
 */

/**
 * Validate and normalize SDK config
 * @param {Partial<SdkConfig>} config - User-provided config
 * @param {SdkConfig} defaults - Default config values
 * @returns {SdkConfig} Validated config
 * @throws {Error} If required fields are missing or invalid
 */
export function validateConfig(config, defaults) {
  if (!config.apiUrl || typeof config.apiUrl !== 'string') {
    throw new Error('SDK: apiUrl is required and must be a string')
  }
  if (!config.http) {
    throw new Error('SDK: http adapter is required')
  }
  if (!config.storage) {
    throw new Error('SDK: storage adapter is required')
  }

  return {
    apiUrl: config.apiUrl.replace(/\/$/, ''), // Remove trailing slash
    http: config.http,
    storage: config.storage,
    realtime: config.realtime ?? defaults.realtime,
    timeout: config.timeout ?? defaults.timeout,
    retryAttempts: config.retryAttempts ?? defaults.retryAttempts
  }
}

/**
 * Default SDK configuration
 * @type {SdkConfig}
 */
export const DEFAULT_CONFIG = {
  apiUrl: '',
  http: null,
  storage: null,
  realtime: null,
  timeout: 30000,
  retryAttempts: 1
}
