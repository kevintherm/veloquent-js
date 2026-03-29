/**
 * Mock HTTP adapter for testing
 * @module tests/mocks
 */

/**
 * Mock HTTP adapter for testing
 */
export class MockHttpAdapter {
  constructor() {
    this.requests = []
    this.responses = []
    this.nextResponse = null
  }

  mockResponse(status, data) {
    this.responses.push({ status, data })
    return this
  }

  async request(req) {
    this.requests.push(req)

    if (this.nextResponse) {
      const response = this.nextResponse
      this.nextResponse = null
      return response
    }

    if (this.responses.length === 0) {
      return {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        data: { message: 'OK', data: {} }
      }
    }

    return this.responses.shift()
  }

  getLastRequest() {
    return this.requests[this.requests.length - 1]
  }

  getAllRequests() {
    return this.requests
  }
}

/**
 * Mock Storage adapter for testing
 */
export class MockStorageAdapter {
  constructor() {
    this.isAsync = false
    this.data = {}
  }

  getItem(key) {
    return this.data[key] ?? null
  }

  setItem(key, value) {
    this.data[key] = value
  }

  removeItem(key) {
    delete this.data[key]
  }

  clear() {
    this.data = {}
  }
}

/**
 * Mock Async Storage adapter for testing React Native
 */
export class MockAsyncStorageAdapter {
  constructor() {
    this.isAsync = true
    this.data = {}
  }

  getItem() {
    throw new Error('Not implemented in async mode')
  }

  setItem() {
    throw new Error('Not implemented in async mode')
  }

  removeItem() {
    throw new Error('Not implemented in async mode')
  }

  clear() {
    throw new Error('Not implemented in async mode')
  }

  async getItemAsync(key) {
    return this.data[key] ?? null
  }

  async setItemAsync(key, value) {
    this.data[key] = value
  }

  async removeItemAsync(key) {
    delete this.data[key]
  }

  async clearAsync() {
    this.data = {}
  }
}
