/**
 * Offline adapter for Veloquent SDK
 * Wraps any HttpAdapter to queue failed mutations during network outages
 * and replay them automatically when connectivity resumes.
 * @module adapters/http/offline-adapter
 */

import { SdkError } from '../../errors/sdk-error.js'

const QUEUE_KEY = 'vp:offline_queue'
const TOKEN_KEY = 'vp:token'

/**
 * Returns true if the error represents a real network failure (not an HTTP error).
 * @param {unknown} error
 * @returns {boolean}
 */
function isNetworkError(error) {
  if (error instanceof SdkError) return false
  if (error instanceof TypeError) return true
  const msg = String(error?.message ?? '').toLowerCase()
  return (
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('connection refused') ||
    msg.includes('network error')
  )
}

/**
 * Generate a UUID v4.
 * @returns {string}
 */
function uuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch (_) {}
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * OfflineAdapter — wraps any HttpAdapter with transparent offline mutation queuing.
 *
 * Behaviour:
 * - `GET` requests are **never** queued; they fail immediately when offline.
 * - `FormData` (file upload) requests are **never** queued; they pass straight through.
 * - `POST` / `PATCH` / `DELETE` with a JSON-serializable body are queued to
 *   persistent storage on a network failure and a synthetic 202 response is
 *   returned so the caller can continue normally.
 * - The queue is flushed automatically on a periodic interval (default 30 s).
 * - Call `flush()` manually for an immediate retry (e.g. on a connectivity event).
 * - Call `destroy()` to cancel the timer when the SDK instance is torn down.
 *
 * @class
 * @implements {import('./types.js').HttpAdapter}
 *
 * @example
 * ```javascript
 * import { Veloquent, createFetchAdapter, createLocalStorageAdapter, createOfflineAdapter } from '@veloquent/sdk'
 *
 * const storage = createLocalStorageAdapter()
 * const sdk = new Veloquent({
 *   apiUrl: 'https://api.example.com',
 *   http: createOfflineAdapter(createFetchAdapter(), storage, {
 *     onQueued:     (entry)           => console.log('Offline — queued:', entry.method, entry.url),
 *     onFlushed:    (entry, response) => console.log('Synced:',           entry.method, entry.url),
 *     onFlushError: (entry, error)    => console.warn('Dropped:',         entry.method, entry.url, error),
 *   }),
 *   storage,
 * })
 * ```
 */
class OfflineAdapter {
  /**
   * @param {import('./types.js').HttpAdapter} inner
   * @param {import('../storage/types.js').StorageAdapter} storage
   * @param {Object} [options]
   * @param {number}   [options.maxQueueSize=200]   - Max queued entries before new ones throw
   * @param {number}   [options.flushInterval=30000] - Auto-flush interval in ms; 0 to disable
   * @param {Function} [options.onQueued]    - `(entry) => void`
   * @param {Function} [options.onFlushed]   - `(entry, response) => void`
   * @param {Function} [options.onFlushError] - `(entry, error) => void`
   */
  constructor(inner, storage, options = {}) {
    if (!inner) throw new Error('OfflineAdapter: inner HttpAdapter is required')
    if (!storage) throw new Error('OfflineAdapter: storage adapter is required')

    this._inner = inner
    this._storage = storage
    this._maxQueueSize = options.maxQueueSize ?? 200
    this._onQueued = options.onQueued ?? null
    this._onFlushed = options.onFlushed ?? null
    this._onFlushError = options.onFlushError ?? null
    this._flushing = false
    this._timer = null

    const interval = options.flushInterval ?? 30_000
    if (interval > 0) {
      this._timer = setInterval(() => { this.flush() }, interval)
      // Don't keep the Node.js process alive just for this timer
      if (this._timer?.unref) this._timer.unref()
    }
  }

  // -------------------------------------------------------------------------
  // HttpAdapter interface
  // -------------------------------------------------------------------------

  /**
   * Execute a request. Mutations failing with a network error are queued.
   * @param {import('./types.js').HttpRequest} req
   * @returns {Promise<import('./types.js').HttpResponse>}
   */
  async request(req) {
    const isMutation = req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE'

    // File uploads use FormData and cannot be serialized — pass through as-is
    if (isMutation && typeof FormData !== 'undefined' && req.body instanceof FormData) {
      return this._inner.request(req)
    }

    try {
      const queue = await this._loadQueue()
      if (queue.length > 0) {
        await this.flush()
      }
    } catch (_) {}

    try {
      return await this._inner.request(req)
    } catch (error) {
      if (isMutation && isNetworkError(error)) {
        return this._enqueue(req)
      }
      throw error
    }
  }

  /**
   * Stream passthrough — offline queuing does not apply to streaming requests.
   * @param {import('./types.js').HttpRequest} req
   * @returns {AsyncGenerator<Uint8Array>}
   */
  async *requestStream(req) {
    yield* this._inner.requestStream(req)
  }

  // -------------------------------------------------------------------------
  // Public queue management
  // -------------------------------------------------------------------------

  /**
   * Replay all queued entries in FIFO order through the inner adapter.
   * Safe to call concurrently; overlapping calls are ignored.
   *
   * @returns {Promise<{flushed: number, failed: number, remaining: number}>}
   */
  async flush() {
    if (this._flushing) return { flushed: 0, failed: 0, remaining: 0 }
    this._flushing = true

    let flushed = 0
    let failed = 0

    try {
      const queue = await this._loadQueue()
      if (queue.length === 0) return { flushed: 0, failed: 0, remaining: 0 }

      const remaining = []

      for (const entry of queue) {
        try {
          // Always use the latest token in case the user re-authenticated
          const headers = await this._refreshAuthHeader(entry.headers)

          const response = await this._inner.request({
            method: entry.method,
            url: entry.url,
            headers,
            body: entry.body,
            timeout: entry.timeout ?? undefined
          })

          this._onFlushed?.(entry, response)
          flushed++
        } catch (error) {
          if (isNetworkError(error)) {
            // Still offline — keep for next flush
            remaining.push(entry)
          } else {
            // 4xx or other permanent error — discard
            failed++
            this._onFlushError?.(entry, error)
          }
        }
      }

      await this._saveQueue(remaining)
      return { flushed, failed, remaining: remaining.length }
    } finally {
      this._flushing = false
    }
  }

  /**
   * Return the number of pending entries in the queue.
   * @returns {Promise<number>}
   */
  async getQueueSize() {
    return (await this._loadQueue()).length
  }

  /**
   * Remove all pending entries from the queue.
   * @returns {Promise<void>}
   */
  async clearQueue() {
    await this._saveQueue([])
  }

  /**
   * Stop the periodic flush timer. Call when the SDK is torn down.
   */
  destroy() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Serialize and persist a failed request.
   * @param {import('./types.js').HttpRequest} req
   * @returns {Promise<import('./types.js').HttpResponse>}
   * @private
   */
  async _enqueue(req) {
    // Verify the body is JSON-serializable (rules out binary payloads)
    if (req.body != null) {
      try {
        JSON.stringify(req.body)
      } catch (_) {
        throw new SdkError(
          'NETWORK_ERROR',
          'Request failed while offline. The request body is not serializable and cannot be queued.',
          { cause: new Error('Non-serializable body') }
        )
      }
    }

    const queue = await this._loadQueue()

    if (queue.length >= this._maxQueueSize) {
      throw new SdkError(
        'QUEUE_FULL',
        `Offline queue is full (max ${this._maxQueueSize} entries). Request not queued.`
      )
    }

    const entry = {
      id: uuid(),
      method: req.method,
      url: req.url,
      headers: req.headers ?? {},
      body: req.body ?? null,
      timeout: req.timeout ?? null,
      createdAt: new Date().toISOString()
    }

    queue.push(entry)
    await this._saveQueue(queue)
    this._onQueued?.(entry)

    // Synthetic 202 response — echo the request body so callers get data back
    const echoData = req.body && typeof req.body === 'object' ? { ...req.body } : {}
    return {
      status: 202,
      statusText: 'Queued',
      headers: {},
      data: {
        data: { ...echoData, _queued: true, _queue_id: entry.id },
        message: 'Request queued for offline replay'
      }
    }
  }

  /**
   * @returns {Promise<Array>}
   * @private
   */
  async _loadQueue() {
    try {
      const raw = this._storage.isAsync
        ? await this._storage.getItemAsync?.(QUEUE_KEY)
        : this._storage.getItem(QUEUE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (_) {
      return []
    }
  }

  /**
   * @param {Array} queue
   * @returns {Promise<void>}
   * @private
   */
  async _saveQueue(queue) {
    const raw = JSON.stringify(queue)
    if (this._storage.isAsync) {
      await this._storage.setItemAsync?.(QUEUE_KEY, raw)
    } else {
      this._storage.setItem(QUEUE_KEY, raw)
    }
  }

  /**
   * Re-read the current auth token from storage and inject it into headers.
   * @param {Object} headers
   * @returns {Promise<Object>}
   * @private
   */
  async _refreshAuthHeader(headers) {
    try {
      const token = this._storage.isAsync
        ? await this._storage.getItemAsync?.(TOKEN_KEY)
        : this._storage.getItem(TOKEN_KEY)
      if (token) return { ...headers, authorization: `Bearer ${token}` }
    } catch (_) {}
    return headers
  }
}

/**
 * Create an offline-capable HTTP adapter by wrapping an existing adapter.
 *
 * @param {import('./types.js').HttpAdapter} inner - e.g. `createFetchAdapter()`
 * @param {import('../storage/types.js').StorageAdapter} storage - Same storage passed to `Veloquent`
 * @param {Object} [options]
 * @param {number}   [options.maxQueueSize=200]    - Cap on queued entries
 * @param {number}   [options.flushInterval=30000] - Auto-flush every N ms (0 = disabled)
 * @param {Function} [options.onQueued]     - Called when entry is added: `(entry) => void`
 * @param {Function} [options.onFlushed]    - Called on successful replay: `(entry, response) => void`
 * @param {Function} [options.onFlushError] - Called on permanent failure: `(entry, error) => void`
 * @returns {OfflineAdapter}
 */
export function createOfflineAdapter(inner, storage, options) {
  return new OfflineAdapter(inner, storage, options)
}
