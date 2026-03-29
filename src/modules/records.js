/**
 * Records module for CRUD operations
 * @module modules/records
 */

/**
 * Records module - handle CRUD operations on collections
 * @class
 */
export class Records {
  /**
   * @param {import('../core/request.js').RequestHelper} requestHelper
   */
  constructor(requestHelper) {
    this.requestHelper = requestHelper
  }

  /**
   * List records from a collection with optional filtering and pagination
   * 
   * @param {string} collection - Collection name
   * @param {Object} [options]
   * @param {string} [options.filter] - Filter expression (e.g., "status = 'active'")
   * @param {string} [options.sort] - Comma-separated fields, use `-` prefix for descending (e.g., "-created_at,name")
   * @param {number} [options.per_page=15] - Records per page
   * @param {string} [options.expand] - Comma-separated relation fields to expand
   * @returns {Promise<Array>} Array of records with pagination metadata
   * @throws {SdkError}
   * 
   * @example
   * ```javascript
   * const records = await sdk.records.list('posts', {
   *   filter: 'status = "published"',
   *   sort: '-created_at',
   *   per_page: 10
   * })
   * ```
   */
  async list(collection, options = {}) {
    const query = {}
    if (options.filter) query.filter = options.filter
    if (options.sort) query.sort = options.sort
    if (options.per_page) query.per_page = options.per_page
    if (options.expand) query.expand = options.expand

    const result = await this.requestHelper.execute({
      method: 'GET',
      path: `/collections/${collection}/records`,
      query
    })

    // Attach pagination metadata if present
    if (result.meta) {
      result.data.meta = result.meta
    }

    return result.data
  }

  /**
   * Create a new record in a collection
   * 
   * @param {string} collection - Collection name
   * @param {Object} data - Record data (fields validated against schema)
   * @returns {Promise<Object>} Created record with id, created_at, updated_at
   * @throws {SdkError}
   * 
   * @example
   * ```javascript
   * const record = await sdk.records.create('posts', {
   *   title: 'Hello World',
   *   content: 'This is my first post',
   *   status: 'draft'
   * })
   * ```
   */
  async create(collection, data) {
    const result = await this.requestHelper.execute({
      method: 'POST',
      path: `/collections/${collection}/records`,
      body: data
    })

    return result.data
  }

  /**
   * Get a single record by ID
   * 
   * @param {string} collection - Collection name
   * @param {string} id - Record ULID
   * @param {Object} [options]
   * @param {string} [options.expand] - Comma-separated relation fields to expand
   * @returns {Promise<Object>} Record with all fields
   * @throws {SdkError}
   * 
   * @example
   * ```javascript
   * const record = await sdk.records.get('posts', '01JAB...')
   * ```
   */
  async get(collection, id, options = {}) {
    const query = {}
    if (options.expand) query.expand = options.expand

    const result = await this.requestHelper.execute({
      method: 'GET',
      path: `/collections/${collection}/records/${id}`,
      query: Object.keys(query).length > 0 ? query : undefined
    })

    return result.data
  }

  /**
   * Update a record
   * 
   * @param {string} collection - Collection name
   * @param {string} id - Record ULID
   * @param {Object} data - Partial record data (only provided fields are updated)
   * @returns {Promise<Object>} Updated record
   * @throws {SdkError}
   * 
   * @example
   * ```javascript
   * const updated = await sdk.records.update('posts', '01JAB...', {
   *   status: 'published'
   * })
   * ```
   */
  async update(collection, id, data) {
    const result = await this.requestHelper.execute({
      method: 'PATCH',
      path: `/collections/${collection}/records/${id}`,
      body: data
    })

    return result.data
  }

  /**
   * Delete a record
   * 
   * @param {string} collection - Collection name
   * @param {string} id - Record ULID
   * @returns {Promise<void>}
   * @throws {SdkError}
   * 
   * @example
   * ```javascript
   * await sdk.records.delete('posts', '01JAB...')
   * ```
   */
  async delete(collection, id) {
    await this.requestHelper.execute({
      method: 'DELETE',
      path: `/collections/${collection}/records/${id}`
    })
  }
}
