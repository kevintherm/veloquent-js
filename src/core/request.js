/**
 * Core request utility for SDK
 * Handles URL building, query params, auth header injection, and response unwrapping
 * @module core/request
 */

import { SdkError } from '../errors/sdk-error.js'

const STORAGE_KEY_TOKEN = 'vp:token'
const STORAGE_KEY_META = 'vp:auth_meta'
const STORAGE_KEY_USER = 'vp:auth_user'
const STORAGE_KEY_DEVICE_ID = 'vp:device_id'


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
 * RequestHelper manages HTTP communication with Veloquent API
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
      await storage.removeItemAsync?.(STORAGE_KEY_USER)
    } else {
      storage.removeItem(STORAGE_KEY_TOKEN)
      storage.removeItem(STORAGE_KEY_META)
      storage.removeItem(STORAGE_KEY_USER)
    }
  }

  /**
   * Get stored user data
   * @returns {Promise<Object | null>}
   */
  async getUser() {
    const storage = this.config.storage
    const userJson = storage.isAsync
      ? await storage.getItemAsync?.(STORAGE_KEY_USER)
      : storage.getItem(STORAGE_KEY_USER)

    if (!userJson) return null
    try {
      return JSON.parse(userJson)
    } catch (e) {
      return null
    }
  }

  /**
   * Store user data
   * @param {Object} user
   * @returns {Promise<void>}
   */
  async setUser(user) {
    const storage = this.config.storage
    const userJson = JSON.stringify(user)
    if (storage.isAsync) {
      await storage.setItemAsync?.(STORAGE_KEY_USER, userJson)
    } else {
      storage.setItem(STORAGE_KEY_USER, userJson)
    }
  }

  /**
   * Get stored auth metadata
   * @returns {Promise<Object | null>}
   */
  async getAuthMeta() {
    const storage = this.config.storage
    const metaJson = storage.isAsync
      ? await storage.getItemAsync?.(STORAGE_KEY_META)
      : storage.getItem(STORAGE_KEY_META)

    if (!metaJson) return null
    try {
      return JSON.parse(metaJson)
    } catch (e) {
      return null
    }
  }


  /**
   * Get or generate a persistent device ID
   * @returns {Promise<string>}
   */
  async getDeviceId() {
    if (this.config.deviceId) {
      return this.config.deviceId
    }

    const storage = this.config.storage
    let deviceId = storage.isAsync
      ? await storage.getItemAsync?.(STORAGE_KEY_DEVICE_ID)
      : storage.getItem(STORAGE_KEY_DEVICE_ID)

    if (!deviceId) {
      deviceId = this.generateUuid()
      if (storage.isAsync) {
        await storage.setItemAsync?.(STORAGE_KEY_DEVICE_ID, deviceId)
      } else {
        storage.setItem(STORAGE_KEY_DEVICE_ID, deviceId)
      }
    }

    return deviceId
  }

  /**
   * Generate a UUID v4
   * @returns {string}
   */
  generateUuid() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
      }
    } catch (e) { }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  /**
   * Construct a default User-Agent identifying the SDK and platform
   * @returns {string}
   */
  getDefaultUserAgent() {
    const platform = typeof window !== 'undefined' ? 'Browser' : 'Node.js'
    const realUA = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    return `Veloquent JS SDK/1.5.0 (${platform}${realUA ? '; ' + realUA : ''})`
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

    const token = await this.getToken()
    if (token) {
      headers['authorization'] = `Bearer ${token}`
    }

    const deviceId = await this.getDeviceId()
    if (deviceId) {
      headers['X-Device-ID'] = deviceId
    }

    headers['User-Agent'] = this.config.userAgent || this.getDefaultUserAgent()

    let requestBody = body
    if (requestBody && !(typeof FormData !== 'undefined' && requestBody instanceof FormData)) {
      requestBody = serializeDates(requestBody)
    }

    try {
      const response = await this.config.http.request({
        url,
        method,
        body: requestBody,
        headers,
        signal,
        timeout: this.config.timeout
      })

      if (response.status >= 400) {
        throw this.errorFromResponse(response)
      }

      if (response.data && typeof response.data === 'object') {
        if ('data' in response.data) {
          return {
            data: parseDates(response.data.data),
            meta: response.data.meta,
            message: response.data.message
          }
        }
      }

      return { data: parseDates(response.data) }
    } catch (error) {
      if (error instanceof SdkError) {
        throw error
      }
      throw new SdkError('REQUEST_FAILED', error.message, { cause: error })
    }
  }

  /**
   * Execute HTTP request and stream response bytes
   * @param {Object} options
   * @param {string} options.method
   * @param {string} options.path
   * @param {*} [options.body]
   * @param {Object} [options.query]
   * @param {AbortSignal} [options.signal]
   * @returns {AsyncGenerator<Uint8Array>}
   * @throws {SdkError}
   */
  async *executeStream({ method, path, body, query, signal }) {
    const url = buildUrl(this.config.apiUrl + '/api', path, query)
    const headers = {}

    const token = await this.getToken()
    if (token) {
      headers['authorization'] = `Bearer ${token}`
    }

    const deviceId = await this.getDeviceId()
    if (deviceId) {
      headers['X-Device-ID'] = deviceId
    }

    headers['User-Agent'] = this.config.userAgent || this.getDefaultUserAgent()

    let requestBody = body
    if (requestBody && !(typeof FormData !== 'undefined' && requestBody instanceof FormData)) {
      requestBody = serializeDates(requestBody)
    }

    try {
      const stream = this.config.http.requestStream({
        url,
        method,
        body: requestBody,
        headers,
        signal,
        timeout: this.config.timeout
      })
      yield* stream
    } catch (error) {
      if (error instanceof SdkError) {
        throw error
      }
      if (error && error.status !== undefined) {
        throw this.errorFromResponse(error)
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

    // Attempt to extract error details from Veloquent error envelope
    let message = data?.message || 'Unknown error'
    let details = data?.errors || data

    // Map custom server-provided codes if available, otherwise map HTTP status codes
    let code = data?.code || data?.error_type
    if (!code) {
      code = 'HTTP_ERROR'
      if (status === 400) code = 'BAD_REQUEST'
      else if (status === 401) code = 'UNAUTHORIZED'
      else if (status === 403) code = 'FORBIDDEN'
      else if (status === 404) code = 'NOT_FOUND'
      else if (status === 409) code = 'CONFLICT'
      else if (status === 422) code = 'VALIDATION_ERROR'
      else if (status >= 500) code = 'SERVER_ERROR'
    }

    return new SdkError(code, message, { statusCode: status, details })
  }
}

/**
 * Helper to check if a value is a plain object.
 * @param {*} val
 * @returns {boolean}
 */
function isPlainObject(val) {
  if (typeof val !== 'object' || val === null) return false
  const proto = Object.getPrototypeOf(val)
  return proto === null || proto === Object.prototype
}

/**
 * Recursively convert any Date objects in a payload to UTC ISO strings.
 * Leaves other values (and date-only strings) untouched.
 * @param {*} obj
 * @returns {*}
 */
function serializeDates(obj) {
  if (obj === null || obj === undefined) return obj
  if (obj instanceof Date) {
    return obj.toISOString()
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeDates)
  }
  if (isPlainObject(obj)) {
    const newObj = {}
    for (const key of Object.keys(obj)) {
      newObj[key] = serializeDates(obj[key])
    }
    return newObj
  }
  return obj
}

/**
 * Recursively parse UTC ISO-8601 datetime strings back to local Date objects.
 * Leaves date-only strings (e.g. YYYY-MM-DD) untouched.
 * @param {*} obj
 * @returns {*}
 */
function parseDates(obj) {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') {
    // Matches YYYY-MM-DDTHH:mm:ss... or YYYY-MM-DD HH:mm:ss...
    // Avoids matching date-only strings like YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(obj)) {
      let normalized = obj
      // If there is no timezone suffix (e.g. Z or +/- offset), treat it as UTC by appending 'Z'
      if (!/[Zz]$/.test(normalized) && !/[+-]\d{2}(?::?\d{2})?$/.test(normalized)) {
        normalized = normalized.replace(' ', 'T') + 'Z'
      }
      const date = new Date(normalized)
      if (!isNaN(date.getTime())) {
        return date
      }
    }
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(parseDates)
  }
  if (isPlainObject(obj)) {
    const newObj = {}
    for (const key of Object.keys(obj)) {
      newObj[key] = parseDates(obj[key])
    }
    return newObj
  }
  return obj
}
