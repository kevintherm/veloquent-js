import { describe, it, expect } from 'bun:test'
import { Veloquent } from '../src/core/client.js'
import { MockHttpAdapter, MockStorageAdapter } from './mocks.js'

describe('AI Chat', () => {
  it('chat executes normal request and returns parsed data', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        text: 'Hello, user!',
        json: { parsed: true }
      }
    })

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const response = await sdk.ai.chat({
      agent: 'agent-123',
      prompt: 'Hello',
      collection: 'custom-agents',
      messages: [{ role: 'user', content: 'prev message' }],
      outputType: 'json',
      schema: { type: 'object' }
    })

    expect(response.text).toBe('Hello, user!')
    expect(response.json).toEqual({ parsed: true })

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('POST')
    expect(req.url).toBe('http://localhost:3000/api/collections/custom-agents/ai/chat')
    expect(req.body).toEqual({
      agent: 'agent-123',
      prompt: 'Hello',
      messages: [{ role: 'user', content: 'prev message' }],
      output_type: 'json',
      schema: { type: 'object' }
    })
  })

  it('chat with stream: true delegates to chatStream and returns async generator', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    const encoder = new TextEncoder()
    const chunks = [
      encoder.encode('data: {"type":"text_delta","id":"1","delta":"Chunk 1"}\n\n'),
      encoder.encode('data: {"type":"text_delta","id":"1","delta":"Chunk 2"}\n\n'),
      encoder.encode('data: [DONE]\n\n')
    ]
    httpAdapter.mockStreamResponse(chunks)

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const stream = await sdk.ai.chat({
      agent: 'agent-123',
      prompt: 'Stream this',
      stream: true
    })

    const results = []
    for await (const chunk of stream) {
      results.push(chunk)
    }

    expect(results.length).toBe(2)
    expect(results[0]).toEqual({ type: 'text_delta', id: '1', delta: 'Chunk 1' })
    expect(results[1]).toEqual({ type: 'text_delta', id: '1', delta: 'Chunk 2' })

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('POST')
    expect(req.isStream).toBe(true)
    expect(req.body).toEqual({
      agent: 'agent-123',
      prompt: 'Stream this',
      stream: true
    })
  })

  it('chat / chatStream validation throws error when streaming structured output', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    expect(() => {
      sdk.ai.chat({
        agent: 'agent-123',
        prompt: 'Hi',
        stream: true,
        outputType: 'json'
      })
    }).toThrow('Streaming is not supported for structured output.')

    expect(() => {
      sdk.ai.chatStream({
        agent: 'agent-123',
        prompt: 'Hi',
        schema: { type: 'object' }
      })
    }).toThrow('Streaming is not supported for structured output.')
  })

  it('chat with attachments sends multipart/form-data request', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { text: 'File received!' }
    })

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    // Create a mock Blob to simulate File
    const mockFile = new Blob(['content'], { type: 'text/plain' })

    await sdk.ai.chat({
      agent: 'agent-123',
      prompt: 'Here is file',
      attachments: [mockFile]
    })

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('POST')
    expect(req.body instanceof FormData).toBe(true)
    expect(req.body.get('agent')).toBe('agent-123')
    expect(req.body.get('prompt')).toBe('Here is file')
    expect(req.body.get('attachments') instanceof Blob).toBe(true)
  })
})
