/**
 * Core request utility for SDK
 * Handles URL building, query params, auth header injection, and response unwrapping
 * @module core/request
 */

import { SdkError } from '../errors/sdk-error.js'

const STORAGE_KEY_TOKEN = 'vp:token'
const STORAGE_KEY_META = 'vp:auth_meta'

/**
 * Build URL with query parameters
 * @param {string} baseUrl
 * @param {string} path
 * @param {Object} [params]
 * @returns {string}
 */
function buildUrl(baseUrl, path, params) {
  const url = new URL(`${baseUrl}${path}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value))
      }
    })
  }
  return url.toString()
}

/**
 * RequestHelper manages HTTP communication with Velo API
 * @class
 */
export class RequestHelper {
  /**
   * @param {import('./config.js').SdkConfig} config
   */
  constructor(config) {
    this.config = config
  }

  /**
   * Get stored auth token
   * @returns {Promise<string | null>}
   * @private
   */
  async getToken() {
    const storage = this.config.storage
    if (storage.isAsync) {
      return await storage.getItemAsync?.(STORAGE_KEY_TOKEN)
    }
    return storage.getItem(STORAGE_KEY_TOKEN)
  }

  /**
   * Store auth token
   * @param {string} token
   * @param {Object} [meta] - Additional auth metadata
   * @returns {Promise<void>}
   * @private
   */
  async setToken(token, meta) {
    const storage = this.config.storage
    if (storage.isAsync) {
      await storage.setItemAsync?.(STORAGE_KEY_TOKEN, token)
      if (meta) {
        await storage.setItemAsync?.(STORAGE_KEY_META, JSON.stringify(meta))
      }
    } else {
      storage.setItem(STORAGE_KEY_TOKEN, token)
      if (meta) {
        storage.setItem(STORAGE_KEY_META, JSON.stringify(meta))
      }
    }
  }

  /**
   * Clear auth token
   * @returns {Promise<void>}
   * @private
   */
  async clearToken() {
    const storage = this.config.storage
    if (storage.isAsync) {
      await storage.removeItemAsync?.(STORAGE_KEY_TOKEN)
      await storage.removeItemAsync?.(STORAGE_KEY_META)
    } else {
      storage.removeItem(STORAGE_KEY_TOKEN)
      storage.removeItem(STORAGE_KEY_META)
    }
  }

  /**
   * Execute HTTP request with auth header and error handling
   * @param {Object} options
   * @param {string} options.method
   * @param {string} options.path
   * @param {*} [options.body]
   * @param {Object} [options.query]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<*>} Unwrapped response data
   * @throws {SdkError}
   */
  async execute({ method, path, body, query, signal }) {
    const url = buildUrl(this.config.apiUrl + '/api', path, query)
    const headers = {}

    // Inject auth token if available
    const token = await this.getToken()
    if (token) {
      headers['authorization'] = `Bearer ${token}`
    }

    try {
      const response = await this.config.http.request({
        url,
        method,
        body,
        headers,
        signal,
        timeout: this.config.timeout
      })

      // Check for HTTP errors
      if (response.status >= 400) {
        throw this.errorFromResponse(response)
      }

      // Unwrap common Velo response envelope: { message, data, meta, errors }
      // Note: /api/user endpoint does NOT use envelope, but that's out of MVP scope
      if (response.data && typeof response.data === 'object') {
        if ('data' in response.data) {
          return {
            data: response.data.data,
            meta: response.data.meta,
            message: response.data.message
          }
        }
      }

      return { data: response.data }
    } catch (error) {
      if (error instanceof SdkError) {
        throw error
      }
      throw new SdkError('REQUEST_FAILED', error.message, { cause: error })
    }
  }

  /**
   * Create SdkError from HTTP response
   * @param {import('../adapters/http/types.js').HttpResponse} response
   * @returns {SdkError}
   * @private
   */
  errorFromResponse(response) {
    const { status, data } = response

    // Attempt to extract error details from Velo error envelope
    let message = data?.message || 'Unknown error'
    let details = data?.errors || data

    // Map common HTTP status codes to SDK error codes
    let code = 'HTTP_ERROR'
    if (status === 400) code = 'BAD_REQUEST'
    else if (status === 401) code = 'UNAUTHORIZED'
    else if (status === 403) code = 'FORBIDDEN'
    else if (status === 404) code = 'NOT_FOUND'
    else if (status === 409) code = 'CONFLICT'
    else if (status === 422) code = 'VALIDATION_ERROR'
    else if (status >= 500) code = 'SERVER_ERROR'

    return new SdkError(code, message, { statusCode: status, details })
  }
}
