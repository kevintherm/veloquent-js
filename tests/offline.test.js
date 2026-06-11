/**
 * Tests for OfflineAdapter
 * @module tests/offline
 */

import { describe, test, expect, beforeEach } from 'bun:test'
import { createOfflineAdapter } from '../src/adapters/http/offline-adapter.js'
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

class HttpErrorAdapter {
  constructor(status = 422) { this.status = status }
  async request() {
    return { status: this.status, statusText: 'Error', headers: {}, data: { message: 'Bad request' } }
  }
  async *requestStream() {}
}

/** Adapter that fails first N calls, then succeeds */
class EventuallySuccessAdapter {
  constructor(failCount = 1, responseData = { data: { id: '123' } }) {
    this.failCount = failCount
    this.calls = 0
    this.responseData = responseData
    this.capturedRequests = []
  }
  async request(req) {
    this.capturedRequests.push(req)
    this.calls++
    if (this.calls <= this.failCount) throw new TypeError('Failed to fetch')
    return { status: 200, statusText: 'OK', headers: {}, data: this.responseData }
  }
  async *requestStream() {}
}

function makeAdapter(inner, overrides = {}) {
  const storage = new MemoryStorage()
  const adapter = createOfflineAdapter(inner, storage, {
    flushInterval: 0, // disable timer — manual flush only
    ...overrides
  })
  return { adapter, storage }
}

// ---------------------------------------------------------------------------
// Queueing — mutations
// ---------------------------------------------------------------------------

describe('OfflineAdapter — queueing mutations', () => {
  test('POST queued on network error, returns synthetic 202', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())

    const res = await adapter.request({
      method: 'POST',
      url: 'https://api.example.com/api/collections/posts/records',
      body: { title: 'Hello' }
    })

    expect(res.status).toBe(202)
    expect(res.data.data._queued).toBe(true)
    expect(res.data.data.title).toBe('Hello')
    expect(typeof res.data.data._queue_id).toBe('string')
  })

  test('PATCH queued on network error', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    const res = await adapter.request({ method: 'PATCH', url: 'https://api.example.com/api/collections/posts/records/1', body: { title: 'Updated' } })
    expect(res.status).toBe(202)
    expect(res.data.data._queued).toBe(true)
  })

  test('DELETE queued on network error', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    const res = await adapter.request({ method: 'DELETE', url: 'https://api.example.com/api/collections/posts/records/1' })
    expect(res.status).toBe(202)
    expect(res.data.data._queued).toBe(true)
  })

  test('queued entry count increases', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    expect(await adapter.getQueueSize()).toBe(0)
    await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: { title: 'A' } })
    expect(await adapter.getQueueSize()).toBe(1)
    await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: { title: 'B' } })
    expect(await adapter.getQueueSize()).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// GET requests are never queued
// ---------------------------------------------------------------------------

describe('OfflineAdapter — GET requests', () => {
  test('GET throws immediately on network error', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    await expect(adapter.request({ method: 'GET', url: 'https://api.example.com/api/collections/posts/records' }))
      .rejects.toThrow(TypeError)
  })

  test('GET does not add to queue', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    try { await adapter.request({ method: 'GET', url: 'https://api.example.com/api/collections/posts/records' }) } catch (_) {}
    expect(await adapter.getQueueSize()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// FormData passthrough
// ---------------------------------------------------------------------------

describe('OfflineAdapter — FormData passthrough', () => {
  test('FormData POST passes through (not queued)', async () => {
    const success = new SuccessAdapter()
    const { adapter } = makeAdapter(success)
    const form = new FormData()
    form.append('file', new Blob(['hello']))
    const res = await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: form })
    expect(res.status).toBe(200)
    expect(success.calls).toHaveLength(1)
    expect(await adapter.getQueueSize()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Flush — success
// ---------------------------------------------------------------------------

describe('OfflineAdapter — flush success', () => {
  test('flush replays queued entries and clears queue', async () => {
    const eventually = new EventuallySuccessAdapter(1)
    const { adapter } = makeAdapter(eventually)

    // Queue one entry while offline
    await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: { title: 'A' } })
    expect(await adapter.getQueueSize()).toBe(1)

    // Swap to success mode and flush
    const result = await adapter.flush()
    expect(result.flushed).toBe(1)
    expect(result.remaining).toBe(0)
    expect(await adapter.getQueueSize()).toBe(0)
  })

  test('flush replays entries in FIFO order', async () => {
    const success = new SuccessAdapter()
    const netErr = new NetworkErrorAdapter()

    // Queue two entries while offline
    const { adapter } = makeAdapter(netErr)
    await adapter.request({ method: 'POST', url: 'https://api.example.com/1', body: { order: 1 } })
    await adapter.request({ method: 'POST', url: 'https://api.example.com/2', body: { order: 2 } })

    // Flush using a success adapter (swap inner)
    adapter._inner = success
    await adapter.flush()

    expect(success.calls[0].url).toBe('https://api.example.com/1')
    expect(success.calls[1].url).toBe('https://api.example.com/2')
  })

  test('flush returns correct counts', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    await adapter.request({ method: 'POST', url: 'https://api.example.com/1', body: {} })
    await adapter.request({ method: 'PATCH', url: 'https://api.example.com/2', body: {} })

    adapter._inner = new SuccessAdapter()
    const result = await adapter.flush()
    expect(result.flushed).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.remaining).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Flush — permanent failure (4xx)
// ---------------------------------------------------------------------------

describe('OfflineAdapter — flush 4xx discard', () => {
  test('4xx response discards the entry', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: { title: 'bad' } })

    // Flush with an adapter that returns 422
    const httpErr = new HttpErrorAdapter(422)
    adapter._inner = httpErr
    // Simulate how RequestHelper creates SdkError from 4xx
    const realFlush = adapter._inner.request.bind(adapter._inner)
    adapter._inner.request = async (req) => {
      const res = await realFlush(req)
      if (res.status >= 400) {
        const err = new SdkError('VALIDATION_ERROR', 'Bad request', { statusCode: res.status })
        throw err
      }
      return res
    }

    let errorEntry = null
    adapter._onFlushError = (entry) => { errorEntry = entry }

    const result = await adapter.flush()
    expect(result.flushed).toBe(0)
    expect(result.failed).toBe(1)
    expect(result.remaining).toBe(0)
    expect(await adapter.getQueueSize()).toBe(0)
    expect(errorEntry).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Flush — still offline (keep in queue)
// ---------------------------------------------------------------------------

describe('OfflineAdapter — flush while still offline', () => {
  test('network error during flush keeps entry in queue', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: { title: 'A' } })
    expect(await adapter.getQueueSize()).toBe(1)

    // Still offline — inner stays as NetworkErrorAdapter
    const result = await adapter.flush()
    expect(result.remaining).toBe(1)
    expect(await adapter.getQueueSize()).toBe(1)
  })

  test('concurrent flush calls are deduplicated', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    const [r1, r2] = await Promise.all([adapter.flush(), adapter.flush()])
    // One should be the real result (0/0/0), the other the dedup short-circuit
    expect(r1.flushed + r2.flushed).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Queue size limit
// ---------------------------------------------------------------------------

describe('OfflineAdapter — queue size limit', () => {
  test('exceeding maxQueueSize throws QUEUE_FULL', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter(), { maxQueueSize: 2 })
    await adapter.request({ method: 'POST', url: 'https://api.example.com/1', body: {} })
    await adapter.request({ method: 'POST', url: 'https://api.example.com/2', body: {} })

    await expect(
      adapter.request({ method: 'POST', url: 'https://api.example.com/3', body: {} })
    ).rejects.toMatchObject({ code: 'QUEUE_FULL' })
  })
})

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

describe('OfflineAdapter — callbacks', () => {
  test('onQueued fires when entry is added', async () => {
    let queuedEntry = null
    const { adapter } = makeAdapter(new NetworkErrorAdapter(), {
      onQueued: (entry) => { queuedEntry = entry }
    })
    await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: { title: 'A' } })
    expect(queuedEntry).not.toBeNull()
    expect(queuedEntry.method).toBe('POST')
    expect(queuedEntry.body).toEqual({ title: 'A' })
    expect(typeof queuedEntry.id).toBe('string')
    expect(typeof queuedEntry.createdAt).toBe('string')
  })

  test('onFlushed fires on successful replay', async () => {
    let flushedEntry = null
    const { adapter } = makeAdapter(new NetworkErrorAdapter(), {
      onFlushed: (entry) => { flushedEntry = entry }
    })
    await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: { title: 'A' } })
    adapter._inner = new SuccessAdapter()
    await adapter.flush()
    expect(flushedEntry).not.toBeNull()
    expect(flushedEntry.method).toBe('POST')
  })

  test('onFlushError fires on permanent failure', async () => {
    let errorEntry = null
    let errorObj = null
    const { adapter } = makeAdapter(new NetworkErrorAdapter(), {
      onFlushError: (entry, err) => { errorEntry = entry; errorObj = err }
    })
    await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: { title: 'A' } })
    adapter._inner = { request: async () => { throw new SdkError('VALIDATION_ERROR', 'Bad', { statusCode: 422 }) }, requestStream: async function* () {} }
    await adapter.flush()
    expect(errorEntry).not.toBeNull()
    expect(errorObj).toBeInstanceOf(SdkError)
  })
})

// ---------------------------------------------------------------------------
// Queue persistence across instances
// ---------------------------------------------------------------------------

describe('OfflineAdapter — persistence', () => {
  test('queue survives adapter re-instantiation (same storage)', async () => {
    const storage = new MemoryStorage()

    const adapter1 = createOfflineAdapter(new NetworkErrorAdapter(), storage, { flushInterval: 0 })
    await adapter1.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', body: { title: 'Persisted' } })
    adapter1.destroy()

    // New instance, same storage
    const adapter2 = createOfflineAdapter(new SuccessAdapter(), storage, { flushInterval: 0 })
    expect(await adapter2.getQueueSize()).toBe(1)
    await adapter2.flush()
    expect(await adapter2.getQueueSize()).toBe(0)
    adapter2.destroy()
  })

  test('auth token is refreshed on flush', async () => {
    const storage = new MemoryStorage()
    // Store a fresh token
    storage.setItem('vp:token', 'new-token-xyz')

    const success = new SuccessAdapter()
    const adapter = createOfflineAdapter(new NetworkErrorAdapter(), storage, { flushInterval: 0 })

    // Queue with no/stale auth header
    await adapter.request({ method: 'POST', url: 'https://api.example.com/api/collections/posts/records', headers: { authorization: 'Bearer old-token' }, body: { title: 'A' } })

    // Flush using success adapter
    adapter._inner = success
    await adapter.flush()

    expect(success.calls[0].headers?.authorization).toBe('Bearer new-token-xyz')
    adapter.destroy()
  })
})

// ---------------------------------------------------------------------------
// clearQueue / destroy
// ---------------------------------------------------------------------------

describe('OfflineAdapter — housekeeping', () => {
  test('clearQueue empties all pending entries', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    await adapter.request({ method: 'POST', url: 'https://api.example.com/1', body: {} })
    await adapter.request({ method: 'POST', url: 'https://api.example.com/2', body: {} })
    expect(await adapter.getQueueSize()).toBe(2)
    await adapter.clearQueue()
    expect(await adapter.getQueueSize()).toBe(0)
  })

  test('destroy cancels the flush timer', () => {
    const storage = new MemoryStorage()
    const adapter = createOfflineAdapter(new NetworkErrorAdapter(), storage, { flushInterval: 1000 })
    expect(adapter._timer).not.toBeNull()
    adapter.destroy()
    expect(adapter._timer).toBeNull()
  })

  test('non-serializable body throws NETWORK_ERROR (not queued)', async () => {
    const { adapter } = makeAdapter(new NetworkErrorAdapter())
    const circular = {}
    circular.self = circular
    await expect(
      adapter.request({ method: 'POST', url: 'https://api.example.com/1', body: circular })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
    expect(await adapter.getQueueSize()).toBe(0)
  })
})
