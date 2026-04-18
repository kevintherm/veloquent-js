import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { Realtime } from '../src/modules/realtime.js'

describe('Realtime Visibility Synthetic Test', () => {
  let realtime
  let mockRequestHelper
  let mockAdapter
  let visibilityHandler

  beforeEach(() => {
    // 1. Mock the environment
    global.document = {
      visibilityState: 'hidden',
      addEventListener: (event, handler) => {
        if (event === 'visibilitychange') visibilityHandler = handler
      },
      removeEventListener: mock(() => {})
    }

    mockRequestHelper = {
      execute: mock(() => Promise.resolve({ data: { channel: 'test-channel' } }))
    }

    mockAdapter = {
      private: mock(() => ({
        listen: mock(() => {}),
        leave: mock(() => {})
      })),
      disconnect: mock(() => {})
    }

    realtime = new Realtime(mockRequestHelper, mockAdapter)
  })

  afterEach(() => {
    delete global.document
  })

  it('triggers heartbeat pulse when visibility changes to visible', async () => {
    // Subscribe to something first
    await realtime.subscribe('posts', {}, () => {})
    
    // Bypass throttle by reaching into internals
    const channelName = [...realtime.activeChannels.keys()][0]
    realtime.activeChannels.get(channelName).lastHeartbeat = 0

    // Clear initial subscribe call from history
    mockRequestHelper.execute.mockClear()

    // 2. Simulate tab becoming visible
    global.document.visibilityState = 'visible'
    visibilityHandler()

    // 3. Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 10))

    // 4. Assert heartbeat was triggered
    expect(mockRequestHelper.execute).toHaveBeenCalledTimes(1)
    const call = mockRequestHelper.execute.mock.calls[0][0]
    expect(call.path).toBe('/collections/posts/subscribe')
  })

  it('throttles rapid visibility changes', async () => {
    await realtime.subscribe('posts', {}, () => {})
    const channelName = [...realtime.activeChannels.keys()][0]
    realtime.activeChannels.get(channelName).lastHeartbeat = 0
    
    mockRequestHelper.execute.mockClear()

    // Trigger twice rapidly
    global.document.visibilityState = 'visible'
    visibilityHandler()
    visibilityHandler()

    await new Promise(resolve => setTimeout(resolve, 10))

    // Should only call once due to 2s throttle
    expect(mockRequestHelper.execute).toHaveBeenCalledTimes(1)
  })

  it('heartbeats ALL collections in a channel', async () => {
    // Both posts and comments on the same channel
    await realtime.subscribe('posts', { channel: 'my-chan' }, () => {})
    await realtime.subscribe('comments', { channel: 'my-chan' }, () => {})
    
    const channelName = [...realtime.activeChannels.keys()][0]
    realtime.activeChannels.get(channelName).lastHeartbeat = 0
    
    mockRequestHelper.execute.mockClear()

    global.document.visibilityState = 'visible'
    visibilityHandler()

    await new Promise(resolve => setTimeout(resolve, 10))

    // Should refresh BOTH collections
    expect(mockRequestHelper.execute).toHaveBeenCalledTimes(2)
  })
})
