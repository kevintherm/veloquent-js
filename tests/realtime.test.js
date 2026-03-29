import { describe, it, expect, mock, afterEach } from 'bun:test'
import { VeloPHP } from '../src/core/client.js'
import { MockHttpAdapter, MockStorageAdapter } from './mocks.js'

// Simple mock for Echo channel
class MockEchoChannel {
  constructor(name) {
    this.name = name
    this.listeners = new Map()
  }

  listen(event, callback) {
    this.listeners.set(event, callback)
    return this
  }

  trigger(event, payload) {
    const cb = this.listeners.get(event)
    if (cb) cb(payload)
  }
}

// Simple mock for Echo adapter
class MockEchoAdapter {
  constructor() {
    this.channels = new Map()
    this.leftChannels = []
    this.disconnected = false
  }

  private(channel) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new MockEchoChannel(channel))
    }
    return this.channels.get(channel)
  }

  leave(channel) {
    this.leftChannels.push(channel)
    this.channels.delete(channel)
  }

  disconnect() {
    this.disconnected = true
  }
}

describe('Realtime', () => {
  let sdk
  let httpAdapter
  let storageAdapter
  let realtimeAdapter

  const setupSdk = () => {
    httpAdapter = new MockHttpAdapter()
    storageAdapter = new MockStorageAdapter()
    realtimeAdapter = new MockEchoAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter,
      realtime: realtimeAdapter
    })

    // Shorten heartbeat for testing
    sdk.realtime.heartbeatMs = 50
  }

  afterEach(() => {
    if (sdk) {
      sdk.realtime.disconnect()
    }
  })

  it('subscribe starts API call and Echo listen', async () => {
    setupSdk()
    httpAdapter.mockResponse(200, { message: 'Subscribed' })

    const callback = mock(() => { })

    await sdk.realtime.subscribe('posts', {
      channel: 'superusers.1',
      filter: 'status="published"'
    }, callback)

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('POST')
    expect(req.url).toBe('http://localhost:3000/api/collections/posts/subscribe')
    expect(req.body).toEqual({ filter: 'status="published"' })

    const channel = realtimeAdapter.channels.get('superusers.1')
    expect(channel).toBeDefined()

    // Simulate event
    channel.trigger('.record.created', { id: 'rec-1' })
    expect(callback).toHaveBeenCalledWith('record.created', { id: 'rec-1' })
  })

  it('unsubscribe calls API and leaves channel', async () => {
    setupSdk()
    httpAdapter.mockResponse(200, { message: 'Subscribed' })
    httpAdapter.mockResponse(200, { message: 'Unsubscribed' })

    await sdk.realtime.subscribe('posts', { channel: 'superusers.1' })
    await sdk.realtime.unsubscribe('posts')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('DELETE')
    expect(req.url).toBe('http://localhost:3000/api/collections/posts/subscribe')

    expect(realtimeAdapter.leftChannels).toContain('superusers.1')
  })

  it('heartbeat sends periodic requests', async () => {
    setupSdk()
    httpAdapter.mockResponse(200, { message: 'Subscribed' })
    httpAdapter.mockResponse(200, { message: 'Heartbeat' })

    await sdk.realtime.subscribe('posts', { channel: 'mychannel' })

    // Wait for one heartbeat interval (50ms set during setup)
    await new Promise(resolve => setTimeout(resolve, 60))

    const requests = httpAdapter.getAllRequests()
    // 1 initial, 1 heartbeat = at least 2 requests
    expect(requests.length).toBeGreaterThanOrEqual(2)
    const latestSyncReq = requests[requests.length - 1]
    expect(latestSyncReq.method).toBe('POST')
    expect(latestSyncReq.url).toBe('http://localhost:3000/api/collections/posts/subscribe')
  })

  it('disconnect clears all subscriptions and adapter', async () => {
    setupSdk()
    httpAdapter.mockResponse(200, { message: 'Subscribed' })

    await sdk.realtime.subscribe('comments', { channel: 'users.1' })

    sdk.realtime.disconnect()

    expect(realtimeAdapter.disconnected).toBe(true)
    expect(realtimeAdapter.leftChannels).toContain('users.1')
  })
})
