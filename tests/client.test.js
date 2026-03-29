import { describe, it, expect } from 'bun:test'
import { VeloPHP } from '../src/core/client.js'
import { SdkError } from '../src/errors/sdk-error.js'
import { MockHttpAdapter, MockStorageAdapter, MockAsyncStorageAdapter } from './mocks.js'

describe('Client', () => {
  it('initializes with config', () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    expect(sdk.auth).toBeDefined()
    expect(sdk.records).toBeDefined()
  })

  it('requires apiUrl', () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    expect(() => {
      new VeloPHP({
        http: httpAdapter,
        storage: storageAdapter
      })
    }).toThrow()
  })

  it('requires http adapter', () => {
    const storageAdapter = new MockStorageAdapter()

    expect(() => {
      new VeloPHP({
        apiUrl: 'http://localhost:3000',
        storage: storageAdapter
      })
    }).toThrow()
  })

  it('requires storage adapter', () => {
    const httpAdapter = new MockHttpAdapter()

    expect(() => {
      new VeloPHP({
        apiUrl: 'http://localhost:3000',
        http: httpAdapter
      })
    }).toThrow()
  })

  it('strips trailing slash from apiUrl', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { id: 'user-123', email: 'test@example.com' }
    })

    storageAdapter.setItem('vp:token', 'test-token')

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000/',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.me('users').catch(() => {}) // Ignore response

    const req = httpAdapter.getLastRequest()
    expect(req.url).toBe('http://localhost:3000/api/collections/users/auth/me')
  })

  it('response envelope parsing', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'Success',
      data: { id: 'rec-1', name: 'Test' },
      meta: { page: 1 }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const result = await sdk.auth.me('users')

    // Should unwrap data from envelope
    expect(result).toEqual({ id: 'rec-1', name: 'Test' })
  })

  it('unauthenticated requests omit auth header', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { token: 'new-token', expires_in: 3600, collection_name: 'users' }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.login('users', 'test@example.com', 'password')

    const req = httpAdapter.getLastRequest()
    expect(req.headers.authorization).toBeUndefined()
  })
})

describe('Integration', () => {
  it('login then authenticated request', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    // Mock login response
    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        token: 'secret-token-123',
        expires_in: 3600,
        collection_name: 'users'
      }
    })

    // Mock me response
    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { id: 'user-1', email: 'test@example.com' }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    // Login
    const loginResult = await sdk.auth.login('users', 'test@example.com', 'password')
    expect(loginResult.token).toBe('secret-token-123')

    // Token should be stored
    expect(storageAdapter.getItem('vp:token')).toBe('secret-token-123')

    // Subsequent request should include token
    await sdk.auth.me('users')

    const meRequest = httpAdapter.getLastRequest()
    expect(meRequest.headers.authorization).toBe('Bearer secret-token-123')
  })

  it('logout clears token', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    // Mock login
    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { token: 'test-token', expires_in: 3600, collection_name: 'users' }
    })

    // Mock logout
    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: []
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.login('users', 'test@example.com', 'password')
    expect(storageAdapter.getItem('vp:token')).toBe('test-token')

    await sdk.auth.logout('users')
    expect(storageAdapter.getItem('vp:token')).toBeNull()
  })

  it('async storage adapter', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockAsyncStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { token: 'async-token', expires_in: 3600, collection_name: 'users' }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.login('users', 'test@example.com', 'password')

    // Token should be stored in async storage
    const retrieved = await storageAdapter.getItemAsync('vp:token')
    expect(retrieved).toBe('async-token')
  })
})

describe('Error', () => {
  it('SdkError has all properties', () => {
    const error = new SdkError('TEST_ERROR', 'Test message', {
      statusCode: 400,
      details: { field: 'error' }
    })

    expect(error.name).toBe('SdkError')
    expect(error.code).toBe('TEST_ERROR')
    expect(error.message).toBe('Test message')
    expect(error.statusCode).toBe(400)
    expect(error.details).toEqual({ field: 'error' })
  })

  it('SdkError.isRetryable()', () => {
    const retryable = new SdkError('SERVER_ERROR', 'Internal Server Error', { statusCode: 500 })
    const notRetryable = new SdkError('VALIDATION_ERROR', 'Bad Request', { statusCode: 400 })

    expect(retryable.isRetryable()).toBe(true)
    expect(notRetryable.isRetryable()).toBe(false)
  })
})
