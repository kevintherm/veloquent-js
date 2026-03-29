# VeloPHP JavaScript SDK

Lightweight, adapter-first SDK for Velo backend. Choose your own HTTP client and storage backend.

## Features

- **Pluggable adapters**: Use default web adapters or bring your own HTTP and storage implementations
- **Minimal core**: Only ~10KB gzipped for core SDK
- **TypeScript-friendly**: JSDoc types for editor IntelliSense
- **ESM-only**: Modern JavaScript modules
- **Stateful token auth**: Supports opaque bearer tokens (no JWT parsing)

## Quick Start

```javascript
import { VeloPHP, createFetchAdapter, createLocalStorageAdapter } from '@velophp/sdk'

const sdk = new VeloPHP({
  apiUrl: 'https://api.example.com',
  http: createFetchAdapter(),
  storage: createLocalStorageAdapter()
})

// Login to auth collection
const { token } = await sdk.auth.login('users', 'user@example.com', 'password')

// Records CRUD
const records = await sdk.records.list('users')
const newRecord = await sdk.records.create('users', { name: 'John' })
const updated = await sdk.records.update('users', recordId, { name: 'Jane' })
await sdk.records.delete('users', recordId)

// Logout
await sdk.auth.logout('users')
```

## Custom Adapters

### Node.js Example

```javascript
import { VeloPHP } from '@velophp/sdk'
import { createNodeFetchAdapter } from './adapters/node-fetch-adapter.js'

const memoryStorage = {
  isAsync: false,
  data: {},
  getItem(key) { return this.data[key] ?? null },
  setItem(key, value) { this.data[key] = value },
  removeItem(key) { delete this.data[key] },
  clear() { this.data = {} }
}

const sdk = new VeloPHP({
  apiUrl: 'https://api.example.com',
  http: createNodeFetchAdapter(),
  storage: memoryStorage
})
```

### React Native Example

```javascript
import { VeloPHP, createFetchAdapter } from '@velophp/sdk'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createAsyncStorageAdapter } from './adapters/async-storage-adapter.js'

const sdk = new VeloPHP({
  apiUrl: 'https://api.example.com',
  http: createFetchAdapter(),
  storage: createAsyncStorageAdapter(AsyncStorage)
})
```

## API Reference

### Auth Module

```javascript
// Login and store bearer token
const { token, expires_in, collection_name } = await sdk.auth.login(
  'users',                    // auth collection name
  'user@example.com',
  'password'
)

// Get current authenticated user
const user = await sdk.auth.me('users')

// Logout and revoke token
await sdk.auth.logout('users')

// Revoke all tokens for user (e.g., password change)
await sdk.auth.logoutAll('users')
```

### Records Module

```javascript
// List records with options
const { records, meta } = await sdk.records.list('posts', {
  filter: 'status = "published"',
  sort: '-created_at,title',
  per_page: 25,
  expand: 'userId,categoryId'
})

// Create record
const post = await sdk.records.create('posts', {
  title: 'Hello World',
  content: 'This is my first post',
  status: 'draft'
})

// Get single record
const post = await sdk.records.get('posts', recordId, {
  expand: 'userId'
})

// Update record
const updated = await sdk.records.update('posts', recordId, {
  status: 'published'
})

// Delete record
await sdk.records.delete('posts', recordId)
```

```

## Custom HTTP Adapter

Implement the `HttpAdapter` interface to provide your own HTTP client:

```javascript
class CustomHttpAdapter {
  async request(req) {
    // req = {
    //   url: string
    //   method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    //   headers?: Record<string, string>
    //   body?: any
    //   signal?: AbortSignal
    //   timeout?: number
    // }

    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal: req.signal
    })

    // Must return:
    // {
    //   status: number
    //   statusText: string
    //   headers: Record<string, string>
    //   data: any
    // }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers),
      data: await response.json()
    }
  }
}
```

## Custom Storage Adapter

Implement the `StorageAdapter` interface for sync or async storage:

```javascript
// Sync (localStorage-like)
class SyncStorageAdapter {
  isAsync = false

  getItem(key) {
    return localStorage.getItem(key)
  }

  setItem(key, value) {
    localStorage.setItem(key, value)
  }

  removeItem(key) {
    localStorage.removeItem(key)
  }

  clear() {
    localStorage.clear()
  }
}

// Async (React Native AsyncStorage-like)
class AsyncStorageAdapter {
  isAsync = true

  // Sync methods not used in async mode
  getItem() { throw new Error('Use async methods') }
  setItem() { throw new Error('Use async methods') }
  removeItem() { throw new Error('Use async methods') }
  clear() { throw new Error('Use async methods') }

  // Async methods
  async getItemAsync(key) {
    return await AsyncStorage.getItem(key)
  }

  async setItemAsync(key, value) {
    await AsyncStorage.setItem(key, value)
  }

  async removeItemAsync(key) {
    await AsyncStorage.removeItem(key)
  }

  async clearAsync() {
    await AsyncStorage.clear()
  }
}
```

## Error Handling

```javascript
import { SdkError } from '@velophp/sdk'

try {
  await sdk.records.create('posts', {})
} catch (error) {
  if (error instanceof SdkError) {
    console.error('Code:', error.code)         // 'VALIDATION_ERROR', 'UNAUTHORIZED', etc.
    console.error('Status:', error.statusCode) // 422, 401, 404, etc.
    console.error('Details:', error.details)   // Raw API errors
    console.error('Retryable:', error.isRetryable()) // Server errors only
  }
}
```

**Error Codes:**
- `UNAUTHORIZED` (401) - No token or invalid token
- `FORBIDDEN` (403) - Insufficient permissions
- `NOT_FOUND` (404) - Resource not found
- `CONFLICT` (409) - Resource already exists
- `VALIDATION_ERROR` (422) - Input validation failed
- `SERVER_ERROR` (5xx) - Server error (retryable)

## Important Notes

### Auth Collection Scoping
- Tokens are scoped to a specific auth collection
- `auth.me('users')` only works if your token was issued from the `users` collection
- Mixing collections will result in a 401 error

### Token Persistence
- SDK automatically stores tokens in the provided storage adapter on login
- Tokens are automatically cleared on logout
- If you manually clear storage, subsequent requests will fail with 401

### Token Expiration
- The SDK does NOT auto-refresh expired tokens
- Implement re-authentication logic in your app
- On 401, prompt user to login again

## Installing Custom Adapters

Custom adapter examples are in `/examples`:
- `node-fetch-adapter.js` - Node.js compatible HTTP adapter
- `async-storage-adapter.js` - React Native storage adapter

## Testing

Run tests with Bun:
```bash
bun test
```

31 tests covering auth and records scenarios.

## License

MIT
