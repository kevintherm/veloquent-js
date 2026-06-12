/**
 * Tests for CachingAdapter
 * @module tests/caching
 */

import { describe, test, expect } from 'bun:test'
import { createCachingAdapter } from '../src/adapters/http/caching-adapter.js'
import { SdkError } from '../src/errors/sdk-error.js'

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

class MemoryStorage {
  constructor() {
    this.isAsync = false
    this.data = {}
  }
  getItem(key) { return this.data[key] ?? null }
  setItem(key, value) { this.data[key] = value }
  removeItem(key) { delete this.data[key] }
  clear() { this.data = {} }
}

class NetworkErrorAdapter {
  async request() { throw new TypeError('Failed to fetch') }
  async *requestStream() {}
}

class SuccessAdapter {
  constructor(responseData = { data: { id: '123' } }) {
    this.responseData = responseData
    this.calls = []
  }
  async request(req) {
    this.calls.push(req)
    return { status: 200, statusText: 'OK', headers: {}, data: this.responseData }
  }
  async *requestStream() {}
}

class MockHttpAdapter {
  constructor() {
    this.responses = {}
    this.calls = []
  }
  setResponse(method, url, status, data) {
    this.responses[`${method}:${url}`] = { status, statusText: 'OK', headers: {}, data }
  }
  async request(req) {
    this.calls.push(req)
    const key = `${req.method.toUpperCase()}:${req.url}`
    if (this.responses[key]) return this.responses[key]
    throw new TypeError('Failed to fetch')
  }
  async *requestStream() {}
}

function makeAdapter(inner, overrides = {}) {
  const storage = new MemoryStorage()
  const adapter = createCachingAdapter(inner, storage, overrides)
  return { adapter, storage }
}

// ---------------------------------------------------------------------------
// Caching GET requests
// ---------------------------------------------------------------------------

describe('CachingAdapter — GET requests', () => {
  test('cables successful response to storage', async () => {
    const success = new SuccessAdapter({ items: [{ id: '1', name: 'A' }] })
    const { adapter, storage } = makeAdapter(success)

    const url = 'https://api.example.com/api/collections/posts/records'
    const res = await adapter.request({ method: 'GET', url })

    expect(res.status).toBe(200)
    expect(res.data.items).toHaveLength(1)

    // Verify written to storage
    const cachedRaw = storage.getItem(`vp:cache:${url}`)
    expect(cachedRaw).not.toBeNull()
    const cached = JSON.parse(cachedRaw)
    expect(cached.data.items[0].name).toBe('A')
    expect(typeof cached.timestamp).toBe('number')

    // Verify registered
    const registry = JSON.parse(storage.getItem('vp:cache_registry'))
    expect(registry).toContain(`vp:cache:${url}`)
  })

  test('falls back to cached data on network error', async () => {
    const mock = new MockHttpAdapter()
    const { adapter, storage } = makeAdapter(mock)

    const url = 'https://api.example.com/api/collections/posts/records'
    
    // Seed cache
    await storage.setItem(`vp:cache:${url}`, JSON.stringify({
      timestamp: Date.now(),
      data: { items: [{ id: '99', name: 'Old' }] }
    }))
    await storage.setItem('vp:cache_registry', JSON.stringify([`vp:cache:${url}`]))

    // Execute GET — inner adapter throws network error, should return fallback
    const res = await adapter.request({ method: 'GET', url })
    expect(res.status).toBe(200)
    expect(res.statusText).toBe('Cached Fallback')
    expect(res.data.items[0].name).toBe('Old')
  })

  test('throws if no cache exists and network fails', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    const url = 'https://api.example.com/api/collections/posts/records'

    await expect(adapter.request({ method: 'GET', url })).rejects.toThrow(TypeError)
  })
})

// ---------------------------------------------------------------------------
// Cache Invalidation (Online)
// ---------------------------------------------------------------------------

describe('CachingAdapter — cache invalidation', () => {
  test('successful online write invalidates matching collection cache', async () => {
    const mock = new MockHttpAdapter()
    const { adapter, storage } = makeAdapter(mock)

    const listUrl = 'https://api.example.com/api/collections/posts/records'
    const detailUrl = 'https://api.example.com/api/collections/posts/records/123'
    const otherUrl = 'https://api.example.com/api/collections/comments/records'

    // Seed caches
    await storage.setItem(`vp:cache:${listUrl}`, JSON.stringify({ timestamp: Date.now(), data: {} }))
    await storage.setItem(`vp:cache:${detailUrl}`, JSON.stringify({ timestamp: Date.now(), data: {} }))
    await storage.setItem(`vp:cache:${otherUrl}`, JSON.stringify({ timestamp: Date.now(), data: {} }))
    await storage.setItem('vp:cache_registry', JSON.stringify([
      `vp:cache:${listUrl}`,
      `vp:cache:${detailUrl}`,
      `vp:cache:${otherUrl}`
    ]))

    // Perform successful mutation (POST) on posts collection
    mock.setResponse('POST', listUrl, 201, { id: '456' })
    await adapter.request({ method: 'POST', url: listUrl, body: { title: 'New Post' } })

    // Verify posts caches are deleted, but other remains
    expect(storage.getItem(`vp:cache:${listUrl}`)).toBeNull()
    expect(storage.getItem(`vp:cache:${detailUrl}`)).toBeNull()
    expect(storage.getItem(`vp:cache:${otherUrl}`)).not.toBeNull()

    // Verify registry updated
    const registry = JSON.parse(storage.getItem('vp:cache_registry'))
    expect(registry).not.toContain(`vp:cache:${listUrl}`)
    expect(registry).not.toContain(`vp:cache:${detailUrl}`)
    expect(registry).toContain(`vp:cache:${otherUrl}`)
  })
})

// ---------------------------------------------------------------------------
// Optimistic Updates (Offline 202)
// ---------------------------------------------------------------------------

describe('CachingAdapter — optimistic updates', () => {
  test('POST 202 appends item to cached list', async () => {
    const mock = new MockHttpAdapter()
    const { adapter, storage } = makeAdapter(mock)

    const listUrl = 'https://api.example.com/api/collections/posts/records'

    // Seed cached list
    await storage.setItem(`vp:cache:${listUrl}`, JSON.stringify({
      timestamp: Date.now(),
      data: { items: [{ id: '1', title: 'Post 1' }] }
    }))
    await storage.setItem('vp:cache_registry', JSON.stringify([`vp:cache:${listUrl}`]))

    // Trigger offline mutation returning 202 synthetic response
    mock.setResponse('POST', listUrl, 202, {
      status: 202,
      data: { title: 'Post 2', _queued: true, _queue_id: 'q-999' }
    })

    await adapter.request({
      method: 'POST',
      url: listUrl,
      body: { title: 'Post 2' }
    })

    // Read updated cache
    const cached = JSON.parse(storage.getItem(`vp:cache:${listUrl}`))
    expect(cached.data.items).toHaveLength(2)
    expect(cached.data.items[1].id).toBe('q-999')
    expect(cached.data.items[1].title).toBe('Post 2')
    expect(cached.data.items[1]._queued).toBe(true)
  })

  test('PATCH 202 updates item in cached list and detail cache', async () => {
    const mock = new MockHttpAdapter()
    const { adapter, storage } = makeAdapter(mock)

    const listUrl = 'https://api.example.com/api/collections/posts/records'
    const detailUrl = 'https://api.example.com/api/collections/posts/records/123'

    // Seed list and detail caches
    await storage.setItem(`vp:cache:${listUrl}`, JSON.stringify({
      timestamp: Date.now(),
      data: { items: [{ id: '123', title: 'Original' }, { id: '456', title: 'Other' }] }
    }))
    await storage.setItem(`vp:cache:${detailUrl}`, JSON.stringify({
      timestamp: Date.now(),
      data: { id: '123', title: 'Original' }
    }))
    await storage.setItem('vp:cache_registry', JSON.stringify([`vp:cache:${listUrl}`, `vp:cache:${detailUrl}`]))

    // Offline update (PATCH)
    mock.setResponse('PATCH', detailUrl, 202, {
      status: 202,
      data: { title: 'Updated Title', _queued: true }
    })

    await adapter.request({
      method: 'PATCH',
      url: detailUrl,
      body: { title: 'Updated Title' }
    })

    // Check list cache updated
    const cachedList = JSON.parse(storage.getItem(`vp:cache:${listUrl}`))
    expect(cachedList.data.items[0].title).toBe('Updated Title')
    expect(cachedList.data.items[0]._queued).toBe(true)
    expect(cachedList.data.items[1].title).toBe('Other') // untouched

    // Check detail cache updated
    const cachedDetail = JSON.parse(storage.getItem(`vp:cache:${detailUrl}`))
    expect(cachedDetail.data.title).toBe('Updated Title')
    expect(cachedDetail.data._queued).toBe(true)
  })

  test('DELETE 202 removes item from cached list and removes detail cache', async () => {
    const mock = new MockHttpAdapter()
    const { adapter, storage } = makeAdapter(mock)

    const listUrl = 'https://api.example.com/api/collections/posts/records'
    const detailUrl = 'https://api.example.com/api/collections/posts/records/123'

    // Seed list and detail caches
    await storage.setItem(`vp:cache:${listUrl}`, JSON.stringify({
      timestamp: Date.now(),
      data: { items: [{ id: '123', title: 'A' }, { id: '456', title: 'B' }] }
    }))
    await storage.setItem(`vp:cache:${detailUrl}`, JSON.stringify({
      timestamp: Date.now(),
      data: { id: '123', title: 'A' }
    }))
    await storage.setItem('vp:cache_registry', JSON.stringify([`vp:cache:${listUrl}`, `vp:cache:${detailUrl}`]))

    // Offline delete
    mock.setResponse('DELETE', detailUrl, 202, {
      status: 202,
      data: { _queued: true }
    })

    await adapter.request({ method: 'DELETE', url: detailUrl })

    // Check list cache removes record
    const cachedList = JSON.parse(storage.getItem(`vp:cache:${listUrl}`))
    expect(cachedList.data.items).toHaveLength(1)
    expect(cachedList.data.items[0].id).toBe('456')

    // Check detail cache is deleted
    expect(storage.getItem(`vp:cache:${detailUrl}`)).toBeNull()
    
    // Registry contains only list cache
    const registry = JSON.parse(storage.getItem('vp:cache_registry'))
    expect(registry).toContain(`vp:cache:${listUrl}`)
    expect(registry).not.toContain(`vp:cache:${detailUrl}`)
  })

  test('POST 202 appends item to wrapped list cache (data.data format)', async () => {
    const mock = new MockHttpAdapter()
    const { adapter, storage } = makeAdapter(mock)

    const listUrl = 'https://api.example.com/api/collections/posts/records'

    // Seed wrapped list cache
    await storage.setItem(`vp:cache:${listUrl}`, JSON.stringify({
      timestamp: Date.now(),
      data: { data: [{ id: '1', title: 'Post 1' }] }
    }))
    await storage.setItem('vp:cache_registry', JSON.stringify([`vp:cache:${listUrl}`]))

    mock.setResponse('POST', listUrl, 202, {
      status: 202,
      data: { title: 'Post 2', _queued: true, _queue_id: 'q-999' }
    })

    await adapter.request({
      method: 'POST',
      url: listUrl,
      body: { title: 'Post 2' }
    })

    const cached = JSON.parse(storage.getItem(`vp:cache:${listUrl}`))
    expect(cached.data.data).toHaveLength(2)
    expect(cached.data.data[1].id).toBe('q-999')
    expect(cached.data.data[1].title).toBe('Post 2')
    expect(cached.data.data[1]._queued).toBe(true)
  })

  test('PATCH 202 updates wrapped detail cache (data.data format)', async () => {
    const mock = new MockHttpAdapter()
    const { adapter, storage } = makeAdapter(mock)

    const detailUrl = 'https://api.example.com/api/collections/posts/records/123'

    // Seed wrapped detail cache
    await storage.setItem(`vp:cache:${detailUrl}`, JSON.stringify({
      timestamp: Date.now(),
      data: { data: { id: '123', title: 'Original' } }
    }))
    await storage.setItem('vp:cache_registry', JSON.stringify([`vp:cache:${detailUrl}`]))

    mock.setResponse('PATCH', detailUrl, 202, {
      status: 202,
      data: { title: 'Updated Title', _queued: true }
    })

    await adapter.request({
      method: 'PATCH',
      url: detailUrl,
      body: { title: 'Updated Title' }
    })

    const cached = JSON.parse(storage.getItem(`vp:cache:${detailUrl}`))
    expect(cached.data.data.title).toBe('Updated Title')
    expect(cached.data.data._queued).toBe(true)
  })
})
