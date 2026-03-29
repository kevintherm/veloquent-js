import { describe, it, expect } from 'bun:test'
import { VeloPHP } from '../src/core/client.js'
import { SdkError } from '../src/errors/sdk-error.js'
import { MockHttpAdapter, MockStorageAdapter } from './mocks.js'

describe('Records', () => {
  it('list endpoint is correct', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: [
        { id: 'rec-1', collection_name: 'posts', title: 'Post 1' },
        { id: 'rec-2', collection_name: 'posts', title: 'Post 2' }
      ],
      meta: {
        current_page: 1,
        last_page: 1,
        per_page: 15,
        total: 2
      }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const records = await sdk.records.list('posts')

    expect(records.length).toBe(2)
    expect(records.meta).toEqual({
      current_page: 1,
      last_page: 1,
      per_page: 15,
      total: 2
    })

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('GET')
    expect(req.url).toBe('http://localhost:3000/api/collections/posts/records')
  })

  it('list with filter and sort', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: [{ id: 'rec-1', status: 'published' }],
      meta: { total: 1 }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.records.list('posts', {
      filter: 'status = "published"',
      sort: '-created_at,name',
      per_page: 25
    })

    const req = httpAdapter.getLastRequest()
    expect(req.url).toContain('filter=status+%3D+%22published%22')
    expect(req.url).toContain('sort=-created_at%2Cname')
    expect(req.url).toContain('per_page=25')
  })

  it('create endpoint is correct', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(201, {
      message: 'Created',
      data: {
        id: 'rec-new',
        collection_name: 'posts',
        title: 'New Post',
        content: 'Content',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const record = await sdk.records.create('posts', {
      title: 'New Post',
      content: 'Content'
    })

    expect(record.id).toBe('rec-new')
    expect(record.title).toBe('New Post')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('POST')
    expect(req.url).toBe('http://localhost:3000/api/collections/posts/records')
    expect(req.body).toEqual({
      title: 'New Post',
      content: 'Content'
    })
  })

  it('get single record', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        id: 'rec-123',
        collection_name: 'posts',
        title: 'My Post'
      }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const record = await sdk.records.get('posts', 'rec-123')

    expect(record.id).toBe('rec-123')
    expect(record.title).toBe('My Post')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('GET')
    expect(req.url).toBe('http://localhost:3000/api/collections/posts/records/rec-123')
  })

  it('update endpoint is correct', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: {
        id: 'rec-123',
        status: 'published'
      }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    const record = await sdk.records.update('posts', 'rec-123', {
      status: 'published'
    })

    expect(record.status).toBe('published')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('PATCH')
    expect(req.url).toBe('http://localhost:3000/api/collections/posts/records/rec-123')
    expect(req.body).toEqual({ status: 'published' })
  })

  it('delete endpoint is correct', async () => {
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

    await sdk.records.delete('posts', 'rec-123')

    const req = httpAdapter.getLastRequest()
    expect(req.method).toBe('DELETE')
    expect(req.url).toBe('http://localhost:3000/api/collections/posts/records/rec-123')
  })

  it('expand query parameter', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(200, {
      message: 'OK',
      data: { id: 'rec-1' }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    await sdk.records.get('posts', 'rec-123', {
      expand: 'userId,authorId'
    })

    const req = httpAdapter.getLastRequest()
    expect(req.url).toContain('expand=userId%2CauthorId')
  })

  it('error on 422 validation', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(422, {
      message: 'Validation failed',
      errors: {
        title: ['Title is required']
      }
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    try {
      await sdk.records.create('posts', {})
      throw new Error('Should have thrown')
    } catch (error) {
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.statusCode).toBe(422)
      expect(error.details.title).toEqual(['Title is required'])
    }
  })

  it('error on 404 not found', async () => {
    const httpAdapter = new MockHttpAdapter()
    const storageAdapter = new MockStorageAdapter()

    storageAdapter.setItem('vp:token', 'test-token')

    httpAdapter.mockResponse(404, {
      message: 'Not found'
    })

    const sdk = new VeloPHP({
      apiUrl: 'http://localhost:3000',
      http: httpAdapter,
      storage: storageAdapter
    })

    try {
      await sdk.records.get('posts', 'nonexistent')
      throw new Error('Should have thrown')
    } catch (error) {
      expect(error.code).toBe('NOT_FOUND')
      expect(error.statusCode).toBe(404)
    }
  })
})
