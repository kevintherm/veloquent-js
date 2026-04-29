import { describe, it, expect } from 'bun:test'
import { Veloquent } from '../src/core/client.js'
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

    const sdk = new Veloquent({
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

    const sdk = new Veloquent({
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

  it('impersonate stores the returned token', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        token: 'impersonation-token',
        expires_in: 3600,
        collection_name: 'users'
      }
    })

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const result = await sdk.auth.impersonate('users', 'rec-123')

    expect(result.token).toBe('impersonation-token')
    expect(storageAdapter.getItem('vp:token')).toBe('impersonation-token')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('POST')
    expect(req.url).toBe('http://localhost:3000/api/collections/users/auth/impersonate/rec-123')
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

    const sdk = new Veloquent({
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

    const sdk = new Veloquent({
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

    const sdk = new Veloquent({
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

    const sdk = new Veloquent({
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

  it('me() hits /api/user if no collection provided', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        id: 'user-123',
        collection_id: 'auth-coll',
        collection_name: 'users',
        email: 'test@example.com'
      }
    })

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const profile = await sdk.auth.me()

    expect(profile.email).toBe('test@example.com')
    expect(profile.collection_name).toBe('users')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('GET')
    expect(req.url).toBe('http://localhost:3000/api/user')
  })

  it('authenticated requests include bearer token', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'my-secret-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { id: 'user-123', email: 'test@example.com' }
    })

    const sdk = new Veloquent({
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

    const sdk = new Veloquent({
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

    const sdk = new Veloquent({
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

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await expect(sdk.auth.isAuthenticated()).resolves.toBe(true)
  })

  it('maintains synchronous user and session state', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    const mockUser = { id: '1', email: 'test@example.com' }
    const mockMeta = {
      expires_in: 3600,
      collection_name: 'users'
    }

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        token: 'sync-token',
        record: mockUser,
        ...mockMeta
      }
    })

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.auth.login('users', 'test@example.com', 'password')

    expect(sdk.auth.user).toEqual(mockUser)
    expect(sdk.auth.session.collection_name).toBe('users')
    expect(JSON.parse(storageAdapter.getItem('vp:auth_user'))).toEqual(mockUser)
  })

  it('provides validation error helpers on SdkError', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(422, {
      message: 'Validation failed',
      errors: {
        email: ['The email has already been taken.'],
        password: ['Too short', 'Must contain a number']
      }
    })

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    try {
      await sdk.auth.login('users', 'taken@example.com', '123')
    } catch (e) {
      expect(e.code).toBe('VALIDATION_ERROR')
      expect(e.getFieldErrors('email')).toEqual(['The email has already been taken.'])
      expect(e.getFirstFieldError('password')).toBe('Too short')
      expect(e.getFieldErrors('non-existent')).toEqual([])
    }
  })

  it('getOAuthRedirectUrl hits /api/oauth2/redirect', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { redirect_url: 'http://localhost/oauth/google/redirect' }
    })

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const url = await sdk.auth.getOAuthRedirectUrl('users', 'google')

    expect(url).toBe('http://localhost/oauth/google/redirect')
    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('POST')
    expect(req.url).toBe('http://localhost:3000/api/oauth2/redirect')
    expect(req.body).toEqual({ collection: 'users', provider: 'google' })
  })

  it('exchangeOAuthCode hits /api/oauth2/exchange and stores session', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    const mockUser = { id: 'user-456', email: 'oauth@example.com' }
    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        token: 'oauth-session-token',
        expires_in: 3600,
        collection_name: 'users',
        record: mockUser
      }
    })

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const result = await sdk.auth.exchangeOAuthCode('test-exchange-code')

    expect(result.token).toBe('oauth-session-token')
    expect(sdk.auth.user).toEqual(mockUser)
    expect(storageAdapter.getItem('vp:token')).toBe('oauth-session-token')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('POST')
    expect(req.url).toBe('http://localhost:3000/api/oauth2/exchange')
    expect(req.body).toEqual({ code: 'test-exchange-code' })
  })

  it('loginWithOAuth coordinates with launcher adapter', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { redirect_url: 'http://localhost/oauth' }
    })

    const sdk = new Veloquent({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    // Setup second response for exchange
    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        token: 'oauth-token',
        expires_in: 3600,
        collection_name: 'users',
        record: { email: 'oauth@example.com' }
      }
    })

    const mockLauncher = async (url) => {
      expect(url).toBe('http://localhost/oauth')
      return 'launcher-extracted-code'
    }

    const result = await sdk.auth.loginWithOAuth('users', 'google', mockLauncher)

    expect(result.token).toBe('oauth-token')
    expect(sdk.auth.user.email).toBe('oauth@example.com')
  })
})


