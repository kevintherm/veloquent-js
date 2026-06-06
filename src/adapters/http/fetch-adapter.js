/**
 * Default Fetch-based HTTP adapter for browser and Node.js
 * @module adapters/http/fetch-adapter
 */

/**
 * Options for creating a FetchAdapter
 * @typedef {Object} FetchAdapterOptions
 * @property {number} [timeout=30000] - Request timeout in milliseconds
 */

/**
 * FetchAdapter - HTTP adapter using native fetch
 * @class
 * @implements {import('./types.js').HttpAdapter}
 */
class FetchAdapter {
  /**
   * @param {FetchAdapterOptions} [options={}]
   */
  constructor(options = {}) {
    this.timeout = options.timeout ?? 30000
  }

  /**
   * Execute an HTTP request
   * @param {import('./types.js').HttpRequest} req
   * @returns {Promise<import('./types.js').HttpResponse>}
   */
  async request(req) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), req.timeout ?? this.timeout)

    try {
      const fetchInit = {
        method: req.method,
        headers: req.headers ?? {},
        signal: req.signal ?? controller.signal
      }

      if (req.body) {
        if (req.body instanceof FormData) {
          fetchInit.body = req.body
        } else {
          fetchInit.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
          if (!fetchInit.headers['content-type']) {
            fetchInit.headers['content-type'] = 'application/json'
          }
        }
      }

      const response = await fetch(req.url, fetchInit)
      const contentType = response.headers.get('content-type') || ''
      let data = null

      if (contentType.includes('application/json')) {
        data = await response.json()
      } else if (response.ok) {
        data = await response.text()
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Execute an HTTP request and stream response bytes
   * @param {import('./types.js').HttpRequest} req
   * @returns {AsyncGenerator<Uint8Array>}
   */
  async *requestStream(req) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), req.timeout ?? this.timeout)

    try {
      const fetchInit = {
        method: req.method,
        headers: req.headers ?? {},
        signal: req.signal ?? controller.signal
      }

      if (req.body) {
        if (req.body instanceof FormData) {
          fetchInit.body = req.body
        } else {
          fetchInit.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
          if (!fetchInit.headers['content-type']) {
            fetchInit.headers['content-type'] = 'application/json'
          }
        }
      }

      const response = await fetch(req.url, fetchInit)

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || ''
        let data = null
        try {
          if (contentType.includes('application/json')) {
            data = await response.json()
          } else {
            data = await response.text()
          }
        } catch (_) {}

        const err = new Error(response.statusText)
        err.status = response.status
        err.statusText = response.statusText
        err.headers = Object.fromEntries(response.headers.entries())
        err.data = data
        throw err
      }

      if (!response.body) {
        return
      }

      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          yield value
        }
      } finally {
        reader.releaseLock()
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

/**
 * Create a fetch-based HTTP adapter
 * @param {FetchAdapterOptions} [options]
 * @returns {FetchAdapter}
 */
export function createFetchAdapter(options) {
  return new FetchAdapter(options)
}
