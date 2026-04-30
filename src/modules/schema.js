/**
 * Schema module for Veloquent schema management APIs.
 * @module modules/schema
 */

/**
 * Schema module - manage schema health and transfers
 * @class
 */
export class Schema {
  /**
   * @param {import('../core/request.js').RequestHelper} requestHelper
   */
  constructor(requestHelper) {
    this.requestHelper = requestHelper
  }

  /**
   * List collections with corrupted schema metadata.
   * @returns {Promise<any[]>} Corrupt schema details
   */
  async corrupt() {
    const result = await this.requestHelper.execute({
      method: 'GET',
      path: '/schema/corrupt'
    })

    return result.data
  }

  /**
   * List orphan database tables without a matching collection.
   * @returns {Promise<Array<string>>}
   */
  async orphans() {
    const result = await this.requestHelper.execute({
      method: 'GET',
      path: '/schema/orphans'
    })

    return result.data
  }

  /**
   * Drop all orphan tables.
   * @returns {Promise<void>}
   */
  async dropOrphans() {
    await this.requestHelper.execute({
      method: 'DELETE',
      path: '/schema/orphans'
    })
  }

  /**
   * Drop a single orphan table by name.
   * @param {string} tableName
   * @returns {Promise<void>}
   */
  async dropOrphan(tableName) {
    await this.requestHelper.execute({
      method: 'DELETE',
      path: `/schema/orphans/${encodeURIComponent(tableName)}`
    })
  }

  /**
   * Export schema metadata to JSON.
   * @param {Record<string, any>} [body]
   * @returns {Promise<Record<string, any>>} Export payload
   */
  async transferExport(body = {}) {
    const result = await this.requestHelper.execute({
      method: 'POST',
      path: '/schema/transfer/export',
      body
    })

    return result.data
  }

  /**
   * Import schema metadata from JSON.
   * @param {Record<string, any>} body
   * @returns {Promise<Record<string, any>>} Import result
   */
  async transferImport(body) {
    const result = await this.requestHelper.execute({
      method: 'POST',
      path: '/schema/transfer/import',
      body
    })

    return result.data
  }

  /**
   * Get schema transfer options.
   * @returns {Promise<Record<string, any>>} Transfer options
   */
  async transferOptions() {
    const result = await this.requestHelper.execute({
      method: 'GET',
      path: '/schema/transfer/options'
    })

    return result.data
  }
}
