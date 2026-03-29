import { describe, it, expect } from 'bun:test'
import { VeloPHP } from '../src/core/client.js'
import { SdkError } from '../src/errors/sdk-error.js'
import { MockHttpAdapter, MockStorageAdapter, MockAsyncStorageAdapter } from './mocks.js'

describe('Auth', () => {
  it('login stores token in storage', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        token: '4331795aecb5148be5318faa4ebe39e82775a55bf1c099ea44465d0a822ad54b',
        expires_in: 59999940,
        collection_name: 'users'
      }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const result = await sdk.auth.login('users', 'test@example.com', 'password')

    expect(result).toEqual({
      token: expect.any(String),
      expires_in: expect.any(Number),
      collection_name: expect.any(String)
    })
    expect(storageAdapter.getItem('vp:token')).toBe('4331795aecb5148be5318faa4ebe39e82775a55bf1c099ea44465d0a822ad54b')
  })

  it('login endpoint is correct', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        token: 'token123',
        expires_in: 3600,
        collection_name: 'users'
      }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.login('users', 'test@example.com', 'password')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('POST')
    expect(req.url).toBe('http://localhost:3000/api/collections/users/auth/login')
    expect(req.body).toEqual({
      identity: 'test@example.com',
      password: 'password'
    })
  })

  it('logout clears token', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    // Setup: store a token
    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: []
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.logout('users')

    expect(storageAdapter.getItem('vp:token')).toBeNull()
  })

  it('logout endpoint is correct', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()
    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: []
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.logout('users')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('DELETE')
    expect(req.url).toBe('http://localhost:3000/api/collections/users/auth/logout')
  })

  it('logoutAll clears token', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: []
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.logoutAll('users')

    expect(storageAdapter.getItem('vp:token')).toBeNull()
  })

  it('me endpoint is correct', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        id: 'user-123',
        collection_id: 'auth-coll',
        collection_name: 'users',
        email: 'test@example.com',
        name: 'Test User',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const user = await sdk.auth.me('users')

    expect(user.email).toBe('test@example.com')
    expect(user.id).toBe('user-123')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('GET')
    expect(req.url).toBe('http://localhost:3000/api/collections/users/auth/me')
  })

  it('authenticated requests include bearer token', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'my-secret-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { id: 'user-123', email: 'test@example.com' }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.me('users')

    const req = httpAdapter.getLastRequest()
    expect(req.headers.authorization).toBe('Bearer my-secret-token')
  })

  it('error on 401 unauth', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(401, {
      message: 'Unauthorized',
      errors: { auth: 'Invalid token' }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    try {
      await sdk.auth.me('users')
      throw new Error('Should have thrown')
    } catch (error) {
      expect(error.code).toBe('UNAUTHORIZED')
      expect(error.statusCode).toBe(401)
    }
  })

  it('isAuthenticated returns true when sync token exists', () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'sync-token')

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    expect(sdk.auth.isAuthenticated()).toBe(true)
  })

  it('isAuthenticated returns true when async token exists', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockAsyncStorageAdapter()

    await storageAdapter.setItemAsync('vp:token', 'async-token')

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await expect(sdk.auth.isAuthenticated()).resolves.toBe(true)
  })
})
