/**
 * Caching adapter for Veloquent SDK
 * Wraps any HttpAdapter to cache GET responses, fallback during network outages,
 * perform optimistic updates on offline writes, and invalidate caches on successful online writes.
 * @module adapters/http/caching-adapter
 */

import { SdkError } from '../../errors/sdk-error.js'

const REGISTRY_KEY = 'vp:cache_registry'

/**
 * Returns true if the error represents a real network failure.
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
 * CachingAdapter — wraps any HttpAdapter to add GET caching.
 *
 * @class
 * @implements {import('./types.js').HttpAdapter}
 */
class CachingAdapter {
  /**
   * @param {import('./types.js').HttpAdapter} inner
   * @param {import('../storage/types.js').StorageAdapter} storage
   * @param {Object} [options]
   * @param {number} [options.ttl=300000] - Time to live in milliseconds (default: 5 minutes)
   */
  constructor(inner, storage, options = {}) {
    if (!inner) throw new Error('CachingAdapter: inner HttpAdapter is required')
    if (!storage) throw new Error('CachingAdapter: storage adapter is required')

    this._inner = inner
    this._storage = storage
    this._ttl = options.ttl ?? 300_000 // 5 minutes
  }

  // -------------------------------------------------------------------------
  // HttpAdapter interface
  // -------------------------------------------------------------------------

  /**
   * Execute request with caching support.
   * @param {import('./types.js').HttpRequest} req
   * @returns {Promise<import('./types.js').HttpResponse>}
   */
  async request(req) {
    const method = req.method.toUpperCase()

    // 1. GET requests: read through cache or fall back
    if (method === 'GET') {
      const cacheKey = `vp:cache:${req.url}`
      try {
        const response = await this._inner.request(req)
        await this._saveToCache(cacheKey, response.data)
        return response
      } catch (error) {
        if (isNetworkError(error)) {
          const cached = await this._readFromCache(cacheKey)
          if (cached) {
            return {
              status: 200,
              statusText: 'Cached Fallback',
              headers: {},
              data: cached.data
            }
          }
        }
        throw error
      }
    }

    // 2. Mutations (POST, PATCH, DELETE)
    const response = await this._inner.request(req)

    if (response.status === 202) {
      // Offline synthetic queued response — apply optimistic update to GET cache
      await this._applyOptimisticUpdate(req, response.data)
    } else if (response.status >= 200 && response.status < 300) {
      // Online success — invalidate cache for this collection
      await this._invalidateCollectionCache(req.url)
    }

    return response
  }

  /**
   * Stream passthrough.
   */
  async *requestStream(req) {
    yield* this._inner.requestStream(req)
  }

  // -------------------------------------------------------------------------
  // Helper methods
  // -------------------------------------------------------------------------

  /**
   * @private
   */
  async _saveToCache(key, data) {
    const entry = {
      timestamp: Date.now(),
      data
    }
    const raw = JSON.stringify(entry)
    
    if (this._storage.isAsync) {
      await this._storage.setItemAsync?.(key, raw)
    } else {
      this._storage.setItem(key, raw)
    }

    await this._addToRegistry(key)
  }

  /**
   * @private
   */
  async _readFromCache(key) {
    try {
      const raw = this._storage.isAsync
        ? await this._storage.getItemAsync?.(key)
        : this._storage.getItem(key)
      if (!raw) return null
      
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed.timestamp !== 'number') return null

      // Check TTL (only if online — offline gets expired fallback)
      const age = Date.now() - parsed.timestamp
      if (age > this._ttl) {
        // We only discard expired if we are online (determined by throwing original error,
        // but if calling readFromCache we check network status indirectly or let calling method handle it).
        // Since request() checks isNetworkError(error) before falling back,
        // we can return the cached item if we're offline, but return null if we're online and just doing regular read.
        // To handle this, we check if the caller wants strictly fresh data (i.e. we are not in offline fallback).
        // But simpler: let's return it anyway if offline, and if online we fetch fresh anyway.
        // Actually, we can return null if age > ttl AND we are online.
        // Wait, how does request() work?
        // If we are online, request() attempts inner.request(req) FIRST, which succeeds and overwrites the cache.
        // So we only ever read from cache in request() when the network FAILS (isNetworkError).
        // That means _readFromCache is ONLY called during offline fallback!
        // Therefore, we should ALWAYS return the cached data even if expired.
        // What if we want to support Cache-First loading when online?
        // If we want to support Cache-First later, we check age > ttl. But for our current Network-First approach,
        // we always fetch first. So TTL check here is not strictly needed for fallback, but let's implement it
        // properly in case we want to support online cache hits:
        // Let's keep it simple: we can allow expired cache when offline.
      }
      return parsed
    } catch (_) {
      return null
    }
  }

  /**
   * @private
   */
  async _addToRegistry(key) {
    try {
      const registry = await this._loadRegistry()
      if (!registry.includes(key)) {
        registry.push(key)
        await this._saveRegistry(registry)
      }
    } catch (_) {}
  }

  /**
   * @private
   */
  async _loadRegistry() {
    try {
      const raw = this._storage.isAsync
        ? await this._storage.getItemAsync?.(REGISTRY_KEY)
        : this._storage.getItem(REGISTRY_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (_) {
      return []
    }
  }

  /**
   * @private
   */
  async _saveRegistry(registry) {
    const raw = JSON.stringify(registry)
    if (this._storage.isAsync) {
      await this._storage.setItemAsync?.(REGISTRY_KEY, raw)
    } else {
      this._storage.setItem(REGISTRY_KEY, raw)
    }
  }

  /**
   * @private
   */
  async _invalidateCollectionCache(url) {
    try {
      const collection = this._extractCollectionName(url)
      if (!collection) return

      const registry = await this._loadRegistry()
      const remaining = []

      // Invalidation pattern: matches '/collections/{collectionName}/records'
      const pattern = `/collections/${collection}/records`

      for (const key of registry) {
        if (key.includes(pattern)) {
          if (this._storage.isAsync) {
            await this._storage.removeItemAsync?.(key)
          } else {
            this._storage.removeItem(key)
          }
        } else {
          remaining.push(key)
        }
      }

      await this._saveRegistry(remaining)
    } catch (_) {}
  }

  /**
   * @private
   */
  _extractCollectionName(url) {
    try {
      const parsed = new URL(url)
      const segments = parsed.pathname.split('/')
      // Expect segments to be ['', 'api', 'collections', '{collection}', 'records', ...]
      const idx = segments.indexOf('collections')
      if (idx !== -1 && idx + 1 < segments.length) {
        return segments[idx + 1]
      }
    } catch (_) {}
    return null
  }

  /**
   * Apply optimistic local updates to list/detail caches for synthetic 202 responses.
   * @private
   */
  async _applyOptimisticUpdate(req, responseData) {
    try {
      const collection = this._extractCollectionName(req.url)
      if (!collection) return

      const registry = await this._loadRegistry()
      const pattern = `/collections/${collection}/records`
      
      const method = req.method.toUpperCase()
      const reqBody = req.body && typeof req.body === 'object' ? req.body : {}
      const queueId = responseData?.data?._queue_id

      // Find the ID of the record if it's PATCH or DELETE
      // segments: ['', 'api', 'collections', '{collection}', 'records', '{id}']
      const urlParsed = new URL(req.url)
      const segments = urlParsed.pathname.split('/')
      const recordIdx = segments.indexOf('records')
      const recordId = (recordIdx !== -1 && recordIdx + 1 < segments.length) ? segments[recordIdx + 1] : null

      for (const key of registry) {
        if (key.includes(pattern)) {
          const cached = await this._readFromCache(key)
          if (!cached || !cached.data) continue

          let cacheUpdated = false

          // 1. Updating a List Cache (e.g. GET /api/collections/{collection}/records)
          if (cached.data.items && Array.isArray(cached.data.items)) {
            let items = [...cached.data.items]

            if (method === 'POST' && queueId) {
              const newRecord = {
                ...reqBody,
                id: queueId,
                _queued: true
              }
              items.push(newRecord)
              cacheUpdated = true
            } else if (method === 'PATCH' && recordId) {
              items = items.map(item => {
                if (item.id === recordId) {
                  return { ...item, ...reqBody, _queued: true }
                }
                return item
              })
              cacheUpdated = true
            } else if (method === 'DELETE' && recordId) {
              items = items.filter(item => item.id !== recordId)
              cacheUpdated = true
            }

            if (cacheUpdated) {
              cached.data.items = items
            }
          } 
          
          // 2. Updating a Detail Cache (e.g. GET /api/collections/{collection}/records/{id})
          else if (cached.data.id && cached.data.id === recordId) {
            if (method === 'PATCH') {
              cached.data = { ...cached.data, ...reqBody, _queued: true }
              cacheUpdated = true
            } else if (method === 'DELETE') {
              // Delete the detail cache entirely
              if (this._storage.isAsync) {
                await this._storage.removeItemAsync?.(key)
              } else {
                this._storage.removeItem(key)
              }
              // Remove from registry
              const updatedRegistry = (await this._loadRegistry()).filter(k => k !== key)
              await this._saveRegistry(updatedRegistry)
              continue
            }
          }

          if (cacheUpdated) {
            // Save modified cache entry
            await this._saveToCache(key, cached.data)
          }
        }
      }
    } catch (_) {}
  }
}

/**
 * Create an opt-in GET caching HTTP adapter wrapping an existing adapter.
 *
 * @param {import('./types.js').HttpAdapter} inner - e.g. `createFetchAdapter()`
 * @param {import('../storage/types.js').StorageAdapter} storage - Same storage passed to `Veloquent`
 * @param {Object} [options]
 * @param {number} [options.ttl=300000] - Cache TTL in ms (default: 5 mins)
 * @returns {CachingAdapter}
 */
export function createCachingAdapter(inner, storage, options) {
  return new CachingAdapter(inner, storage, options)
}
