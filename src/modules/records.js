/**
 * Records module for CRUD operations
 * @module modules/records
 */

/**
 * Detect if a value contains a File, Blob, or FileList that requires multipart upload.
 * Guards against browser-only globals so this module also works in Bun/Node environments.
 * @param {*} value
 * @returns {boolean}
 */
function isFileValue(value) {
  if (typeof File !== 'undefined' && value instanceof File) return true
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof FileList !== 'undefined' && value instanceof FileList) return true
  if (Array.isArray(value)) return value.some(isFileValue)
  return false
}

/**
 * Build a FormData from a data object if it contains any File/Blob values.
 * Returns null if no files are detected (use JSON body instead).
 *
 * Non-file values are appended as strings (objects/arrays are JSON-encoded).
 * File arrays are appended as multiple entries under the same key.
 *
 * @param {Object} data
 * @returns {FormData|null}
 */
function buildFormData(data) {
  const hasFiles = Object.values(data).some(isFileValue)
  if (!hasFiles) return null

  const form = new FormData()

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item instanceof File || item instanceof Blob) {
          form.append(key, item, item instanceof File ? item.name : undefined)
        } else {
          form.append(key, typeof item === 'object' ? JSON.stringify(item) : String(item))
        }
      }
      continue
    }

    if (typeof FileList !== 'undefined' && value instanceof FileList) {
      for (const file of value) {
        form.append(key, file, file.name)
      }
      continue
    }

    if ((typeof File !== 'undefined' && value instanceof File) ||
        (typeof Blob !== 'undefined' && value instanceof Blob)) {
      form.append(key, value, value instanceof File ? value.name : undefined)
      continue
    }

    if (typeof value === 'object') {
      form.append(key, JSON.stringify(value))
      continue
    }

    form.append(key, String(value))
  }

  return form
}

/**
 * @typedef {any[] & { meta?: Record<string, any> }} RecordList
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
   * @param {string} [options.filter] - Filter expression (e.g., \"status = 'active'\")
   * @param {string} [options.sort] - Comma-separated fields, use `-` prefix for descending (e.g., \"-created_at,name\")
   * @param {number} [options.per_page=15] - Records per page
   * @param {string} [options.expand] - Comma-separated relation fields to expand
   * @returns {Promise<RecordList>} Array of records with pagination metadata
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
   * Create a new record in a collection.
   *
   * If any value in `data` is a `File`, `Blob`, or `FileList`, the request is
   * automatically sent as `multipart/form-data` so files are uploaded alongside
   * the other field values.
   *
   * @param {string} collection - Collection name
   * @param {Record<string, any>} data - Record data. File fields accept `File`, `Blob`, `FileList`, or an array of those.
   * @returns {Promise<Record<string, any>>} Created record with id, created_at, updated_at
   * @throws {SdkError}
   *
   * @example
   * ```javascript
   * // Plain JSON (no files)
   * const record = await sdk.records.create('posts', {
   *   title: 'Hello World',
   *   status: 'draft'
   * })
   *
   * // With a file — automatically sends multipart/form-data
   * const file = document.querySelector('#avatar').files[0]
   * const record = await sdk.records.create('users', {
   *   name: 'Kevin',
   *   avatar: file
   * })
   *
   * // With multiple files
   * const files = [...document.querySelector('#gallery').files]
   * const record = await sdk.records.create('posts', {
   *   title: 'My Trip',
   *   gallery: files
   * })
   * ```
   */
  async create(collection, data) {
    const formData = buildFormData(data)

    const result = await this.requestHelper.execute({
      method: 'POST',
      path: `/collections/${collection}/records`,
      body: formData ?? data
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
   * @returns {Promise<Record<string, any>>} Record with all fields
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
   * Update a record.
   *
   * If any value in `data` is a `File`, `Blob`, or `FileList`, the request is
   * automatically sent as `multipart/form-data`.
   *
   * For multi-file fields you can use the `+` and `-` key suffixes to append or
   * remove files without replacing the entire field:
   * - `fieldName+` — appends file(s) to the existing list
   * - `fieldName-` — removes file(s) by path or metadata selector
   *
   * @param {string} collection - Collection name
   * @param {string} id - Record ULID
   * @param {Record<string, any>} data - Partial record data. Supports `fieldName+` (append) and `fieldName-` (remove) for file fields.
   * @returns {Promise<Record<string, any>>} Updated record
   * @throws {SdkError}
   *
   * @example
   * ```javascript
   * // Update plain field
   * await sdk.records.update('posts', id, { status: 'published' })
   *
   * // Replace the avatar file
   * await sdk.records.update('users', id, { avatar: newFile })
   *
   * // Append files to a multi-file gallery field
   * await sdk.records.update('posts', id, { 'gallery+': [file1, file2] })
   *
   * // Remove a specific file from a gallery by its stored path
   * await sdk.records.update('posts', id, {
   *   'gallery-': [{ path: 'collections/posts/abc.jpg' }]
   * })
   * ```
   */
  async update(collection, id, data) {
    const formData = buildFormData(data)

    const result = await this.requestHelper.execute({
      method: 'PATCH',
      path: `/collections/${collection}/records/${id}`,
      body: formData ?? data
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
