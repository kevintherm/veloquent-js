/**
 * Collections module for managing Veloquent collections.
 * @module modules/collections
 */

/**
 * Collections module - handle collection CRUD operations
 * @class
 */
export class Collections {
  /**
   * @param {import('../core/request.js').RequestHelper} requestHelper
   */
  constructor(requestHelper) {
    this.requestHelper = requestHelper
  }

  /**
   * List collections with optional query filters
   * @param {Object} [options]
   * @param {string} [options.filter]
   * @param {string} [options.sort]
   * @param {string} [options.expand]
   * @returns {Promise<any[]>} List of collections
   */
  async list(options = {}) {
    const query = {}
    if (options.filter) query.filter = options.filter
    if (options.sort) query.sort = options.sort
    if (options.expand) query.expand = options.expand

    const result = await this.requestHelper.execute({
      method: 'GET',
      path: '/collections',
      query
    })

    return result.data
  }

  /**
   * Get a single collection by name or id
   * @param {string} collection
   * @returns {Promise<Record<string, any>>} Collection object
   */
  async get(collection) {
    const result = await this.requestHelper.execute({
      method: 'GET',
      path: `/collections/${collection}`
    })

    return result.data
  }

  /**
   * Create a new collection
   * @param {Record<string, any>} data
   * @returns {Promise<Record<string, any>>} Created collection
   */
  async create(data) {
    const result = await this.requestHelper.execute({
      method: 'POST',
      path: '/collections',
      body: data
    })

    return result.data
  }

  /**
   * Update an existing collection
   * @param {string} collection
   * @param {Record<string, any>} data
   * @returns {Promise<Record<string, any>>} Updated collection
   */
  async update(collection, data) {
    const result = await this.requestHelper.execute({
      method: 'PATCH',
      path: `/collections/${collection}`,
      body: data
    })

    return result.data
  }

  /**
   * Delete a collection
   * @param {string} collection
   * @returns {Promise<void>}
   */
  async delete(collection) {
    await this.requestHelper.execute({
      method: 'DELETE',
      path: `/collections/${collection}`
    })
  }

  /**
   * Truncate a collection and delete all records
   * @param {string} collection
   * @returns {Promise<Record<string, any>>} Deletion result
   */
  async truncate(collection) {
    const result = await this.requestHelper.execute({
      method: 'DELETE',
      path: `/collections/${collection}/truncate`
    })

    return result.data
  }
}
